/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Hono } from "hono";
import type { Context } from "hono";
import {
  buildClearSessionCookieHeader,
  buildSessionCookieHeader,
  checkRateLimit,
  constantTimeEqual,
  createUserSession,
  extractSessionToken,
  generateSecureToken,
  getSessionSecret,
  hashPassword,
  revokeUserSession,
  sha256Hex,
  verifyPassword,
  verifySessionToken,
  verifyTurnstileToken,
} from "../security";
import { createNotification, getSystemSettings, logAudit, rowToUser, sanitizeUser } from "../db";
import type { AuthUser, Env, HonoVariables } from "../types";

export const authRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

export async function authenticateRequest(
  c: Context<{ Bindings: Env; Variables: HonoVariables }>
): Promise<{ user: AuthUser; jti: string } | null> {
  const rawToken = extractSessionToken(c);
  if (!rawToken) return null;

  const secret = await getSessionSecret(c.env, c.req.url);
  const payload = await verifySessionToken(rawToken, secret);
  if (!payload) return null;

  // Verify session has not been revoked in KV
  const sessionRecord = await c.env.KV.get(`session:${payload.jti}`);
  if (!sessionRecord) return null;

  const row = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(payload.sub)
    .first<any>();
  if (!row) return null;

  if (row.status !== "APPROVED") {
    return null;
  }

  return { user: sanitizeUser(row, true), jti: payload.jti };
}

export async function requireAuth(
  c: Context<{ Bindings: Env; Variables: HonoVariables }>,
  next: () => Promise<void>
) {
  const session = await authenticateRequest(c);
  if (!session) {
    return c.json({ success: false, message: "No autenticado o sesión expirada." }, 401);
  }
  c.set("user", session.user);
  c.set("sessionId", session.jti);
  await next();
}

export async function requireAdmin(
  c: Context<{ Bindings: Env; Variables: HonoVariables }>,
  next: () => Promise<void>
) {
  const user = c.get("user");
  if (!user || user.role !== "ADMIN") {
    return c.json({ success: false, message: "Privilegios insuficientes. Solo Director General." }, 403);
  }
  await next();
}

export async function requireManagerOrAdmin(
  c: Context<{ Bindings: Env; Variables: HonoVariables }>,
  next: () => Promise<void>
) {
  const user = c.get("user");
  if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
    return c.json({ success: false, message: "Privilegios insuficientes." }, 403);
  }
  await next();
}

authRoutes.get("/setup-status", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT COUNT(*) as total FROM users WHERE role = 'ADMIN'"
  ).first<{ total: number }>();

  const adminCount = Number(row?.total || 0);
  return c.json({
    needsSetup: adminCount === 0,
    requiresBootstrapSecret: Boolean(c.env.BOOTSTRAP_ADMIN_SECRET?.trim()),
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY?.trim() || null,
  });
});

authRoutes.post("/setup-admin", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT COUNT(*) as total FROM users WHERE role = 'ADMIN'"
  ).first<{ total: number }>();

  if (Number(row?.total || 0) > 0) {
    return c.json(
      {
        success: false,
        message: "La configuración inicial ya fue completada. Ya existe un Director General.",
      },
      403
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const phone = String(body.phone || "").trim();
  const setupSecret = String(body.setupSecret || "");
  const turnstileToken = body.turnstileToken ? String(body.turnstileToken) : undefined;

  const remoteIp = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || null;
  const tsCheck = await verifyTurnstileToken(c.env, turnstileToken, remoteIp);
  if (!tsCheck.ok) {
    return c.json({ success: false, message: tsCheck.error }, 400);
  }

  const expectedSecret = c.env.BOOTSTRAP_ADMIN_SECRET?.trim();
  if (expectedSecret) {
    const enc = new TextEncoder();
    if (!constantTimeEqual(enc.encode(setupSecret), enc.encode(expectedSecret))) {
      return c.json({ success: false, message: "Clave de inicialización administrativa inválida." }, 403);
    }
  }

  if (!name || !email || password.length < 8) {
    return c.json(
      {
        success: false,
        message: "Nombre, correo electrónico válido y contraseña de al menos 8 caracteres son obligatorios.",
      },
      400
    );
  }

  const existingEmail = await c.env.DB.prepare("SELECT id FROM users WHERE LOWER(email) = ?")
    .bind(email)
    .first();
  if (existingEmail) {
    return c.json({ success: false, message: "Este correo electrónico ya existe en el sistema." }, 400);
  }

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  const adminId = `usr-admin-${Date.now()}`;

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, name, role, avatar_url, phone, address, status, can_create_cases, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'ADMIN', '', ?, '', 'APPROVED', 1, ?, ?)`
  )
    .bind(adminId, email, passwordHash, name, phone, now, now)
    .run();

  await logAudit(
    c.env,
    { id: adminId, name, role: "ADMIN" },
    "INITIAL_ADMIN_CREATED",
    "USER",
    adminId,
    `Se inicializó la cuenta del Director General (${email}) mediante procedimiento seguro.`
  );

  const session = await createUserSession(c.env, adminId, "ADMIN", c.req.url);
  c.header("Set-Cookie", buildSessionCookieHeader(session.token, c.req.url, session.maxAge));

  const created = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(adminId).first<any>();
  return c.json({
    success: true,
    user: sanitizeUser(created, true),
  });
});

authRoutes.post("/login", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const turnstileToken = body.turnstileToken ? String(body.turnstileToken) : undefined;

    if (!email || !password) {
      return c.json({ success: false, message: "Email y contraseña son requeridos." }, 400);
    }

    const remoteIp = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "local";
    const rl = await checkRateLimit(c.env.KV, `login:${remoteIp}:${email}`, 12, 300);
    if (!rl.allowed) {
      return c.json(
        {
          success: false,
          message: "Demasiados intentos de inicio de sesión. Espere 5 minutos antes de volver a intentar.",
        },
        429
      );
    }

    const tsCheck = await verifyTurnstileToken(c.env, turnstileToken, remoteIp);
    if (!tsCheck.ok) {
      return c.json({ success: false, message: tsCheck.error }, 400);
    }

    const foundRow = await c.env.DB.prepare("SELECT * FROM users WHERE LOWER(email) = ?")
      .bind(email)
      .first<any>();

    if (!foundRow) {
      return c.json({ success: false, message: "Credenciales inválidas." }, 401);
    }

    const validPass = await verifyPassword(password, foundRow.password_hash);
    if (!validPass) {
      return c.json({ success: false, message: "Credenciales inválidas." }, 401);
    }

    if (foundRow.status !== "APPROVED") {
      let msg = "Su cuenta aún no ha sido aprobada.";
      if (foundRow.status === "PENDING") {
        msg = "Su cuenta está pendiente de verificación de código de seguridad.";
      } else if (foundRow.status === "VERIFIED_PENDING_APPROVAL") {
        msg = "Su cuenta está verificada y en espera de aprobación por parte del Director General.";
      } else if (foundRow.status === "REJECTED") {
        msg = "Su solicitud de registro ha sido rechazada por la dirección general.";
      } else if (foundRow.status === "SUSPENDED") {
        msg = "Su cuenta se encuentra suspendida temporalmente.";
      } else if (foundRow.status === "BANNED") {
        msg = "Su acceso a la plataforma ha sido bloqueado.";
      }
      return c.json({ success: false, message: msg }, 403);
    }

    const user = rowToUser(foundRow);
    const session = await createUserSession(c.env, user.id, user.role, c.req.url);
    c.header("Set-Cookie", buildSessionCookieHeader(session.token, c.req.url, session.maxAge));

    await logAudit(
      c.env,
      user,
      "LOGIN",
      "USER",
      user.id,
      `El usuario ${user.name} (${user.role}) inició sesión.`
    );

    return c.json({
      success: true,
      user: sanitizeUser(user, true),
    });
  } catch (err: any) {
    return c.json({ success: false, message: `Error interno de autenticación: ${err.message}` }, 500);
  }
});

authRoutes.post("/logout", async (c) => {
  const rawToken = extractSessionToken(c);
  if (rawToken) {
    try {
      const secret = await getSessionSecret(c.env, c.req.url);
      const payload = await verifySessionToken(rawToken, secret);
      if (payload?.jti) {
        await revokeUserSession(c.env, payload.jti);
      }
    } catch {
      // ignore invalid session on logout
    }
  }
  c.header("Set-Cookie", buildClearSessionCookieHeader(c.req.url));
  return c.json({ success: true });
});

authRoutes.get("/me", requireAuth, async (c) => {
  return c.json(c.get("user"));
});

authRoutes.post("/register-advisor", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const turnstileToken = body.turnstileToken ? String(body.turnstileToken) : undefined;

    if (!email || !password || !name || !phone) {
      return c.json({ success: false, message: "Todos los campos son obligatorios para registrarse." }, 400);
    }
    if (password.length < 8) {
      return c.json(
        { success: false, message: "La contraseña debe tener al menos 8 caracteres para proteger su cuenta." },
        400
      );
    }

    const remoteIp = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "local";
    const rl = await checkRateLimit(c.env.KV, `register:${remoteIp}`, 10, 600);
    if (!rl.allowed) {
      return c.json(
        { success: false, message: "Límite de registros temporales alcanzado. Intente nuevamente más tarde." },
        429
      );
    }

    const tsCheck = await verifyTurnstileToken(c.env, turnstileToken, remoteIp);
    if (!tsCheck.ok) {
      return c.json({ success: false, message: tsCheck.error }, 400);
    }

    const existing = await c.env.DB.prepare("SELECT * FROM users WHERE LOWER(email) = ?")
      .bind(email)
      .first<any>();

    if (existing) {
      if (
        existing.status === "PENDING" ||
        existing.status === "VERIFIED_PENDING_APPROVAL" ||
        existing.status === "REJECTED"
      ) {
        await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(existing.id).run();
      } else {
        return c.json(
          { success: false, message: "Este correo electrónico ya se encuentra registrado y aprobado." },
          400
        );
      }
    }

    const settings = await getSystemSettings(c.env.DB, c.env.KV);
    const channel = String(settings.verificationChannel || c.env.VERIFICATION_MODE || "ADMIN_CODE");

    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();
    const userId = `usr-asesor-${Date.now()}`;
    const initialStatus = channel === "DIRECT_APPROVAL" ? "VERIFIED_PENDING_APPROVAL" : "PENDING";

    await c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role, avatar_url, phone, address, status, can_create_cases, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'ASESOR', '', ?, '', ?, 0, ?, ?)`
    )
      .bind(userId, email, passwordHash, name, phone, initialStatus, now, now)
      .run();

    if (channel === "CF_SEND_EMAIL") {
      if (!c.env.SEND_EMAIL) {
        // Revert registration instead of pretending an email was sent
        await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
        return c.json(
          {
            success: false,
            message:
              "El canal Cloudflare Email Service (SEND_EMAIL) no está vinculado en este Worker (requiere plan de pago y dominio DNS en Cloudflare). Configure el modo 'ADMIN_CODE' o 'DIRECT_APPROVAL' en Administración.",
          },
          400
        );
      }
      const token = generateSecureToken(16);
      const tokenHash = await sha256Hex(token);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await c.env.DB.prepare(
        `INSERT INTO verification_tokens (id, user_id, token_hash, channel, expires_at, created_at)
         VALUES (?, ?, ?, 'CF_SEND_EMAIL', ?, ?)`
      )
        .bind(`vt-${Date.now()}`, userId, tokenHash, expiresAt, now)
        .run();

      await c.env.KV.put(`verify:${userId}`, tokenHash, { expirationTtl: 86400 });

      try {
        await c.env.SEND_EMAIL.send({
          to: email,
          subject: "Código de verificación - Gestor de Documentos",
          text: String(settings.messageTemplate || "Hola {{name}}, tu código de verificación es: {{token}}")
            .replace("{{name}}", name)
            .replace("{{token}}", token),
        });
      } catch (emailErr: any) {
        await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
        await c.env.KV.delete(`verify:${userId}`);
        return c.json(
          {
            success: false,
            message: `Error enviando correo mediante Cloudflare Email Service: ${emailErr?.message || "fallo de envío"}`,
          },
          502
        );
      }
    } else if (channel === "ADMIN_CODE") {
      const token = generateSecureToken(16);
      const tokenHash = await sha256Hex(token);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await c.env.DB.prepare(
        `INSERT INTO verification_tokens (id, user_id, token_hash, channel, expires_at, created_at)
         VALUES (?, ?, ?, 'ADMIN_CODE', ?, ?)`
      )
        .bind(`vt-${Date.now()}`, userId, tokenHash, expiresAt, now)
        .run();
      await c.env.KV.put(`verify:${userId}`, tokenHash, { expirationTtl: 86400 });
    }

    // Notify Admins & Managers about the new registration
    const admins = await c.env.DB.prepare("SELECT id FROM users WHERE role = 'ADMIN'").all<{ id: string }>();
    for (const adm of admins.results || []) {
      await createNotification(
        c.env.DB,
        adm.id,
        initialStatus === "VERIFIED_PENDING_APPROVAL"
          ? "Nuevo Asesor Pendiente de Aprobación"
          : "Nuevo Asesor Esperando Verificación",
        initialStatus === "VERIFIED_PENDING_APPROVAL"
          ? `El asesor ${name} (${email}) se registró y espera su aprobación manual.`
          : `El asesor ${name} (${email}) se registró. Genere un código de verificación desde el panel administrativo o apruébelo directamente.`,
        "WARNING"
      );
    }

    await logAudit(
      c.env,
      { id: userId, name, role: "ASESOR" },
      "USER_SIGNUP",
      "USER",
      userId,
      `Asesor registrado: ${name} (${email}) con modo de verificación nativo Cloudflare: ${channel}.`
    );

    const responseMsg =
      channel === "DIRECT_APPROVAL"
        ? "Registro completado. Su solicitud ha sido enviada al Director General para aprobación directa."
        : channel === "CF_SEND_EMAIL"
        ? "Registro completado. Se envió el código de verificación mediante Cloudflare Email Service a su correo."
        : "Registro completado. Solicite al Director General o Gerente el código de verificación de un solo uso (16 caracteres) desde el panel administrativo, o aguarde aprobación directa.";

    return c.json({
      success: true,
      verificationMode: channel,
      requiresCodeEntry: channel !== "DIRECT_APPROVAL",
      message: responseMsg,
      userId,
    });
  } catch (err: any) {
    return c.json({ success: false, message: `Error interno de registro: ${err.message}` }, 500);
  }
});

authRoutes.post("/verify-token", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const userId = String(body.userId || "").trim();
  const token = String(body.token || "").trim();

  if (!userId || !token) {
    return c.json({ success: false, message: "ID de usuario y código de seguridad son obligatorios." }, 400);
  }

  const remoteIp = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "local";
  const rl = await checkRateLimit(c.env.KV, `verify:${remoteIp}:${userId}`, 8, 300);
  if (!rl.allowed) {
    return c.json({ success: false, message: "Demasiados intentos de verificación. Espere unos minutos." }, 429);
  }

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first<any>();
  if (!user) {
    return c.json({ success: false, message: "Registro no encontrado." }, 404);
  }
  if (user.status !== "PENDING") {
    return c.json(
      { success: false, message: "Este usuario ya no se encuentra en estado pendiente de verificación." },
      400
    );
  }

  const candidateHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const tokenRow = await c.env.DB.prepare(
    `SELECT * FROM verification_tokens
     WHERE user_id = ? AND used_at IS NULL AND expires_at > ?
     ORDER BY created_at DESC LIMIT 1`
  )
    .bind(userId, now)
    .first<any>();

  const kvHash = await c.env.KV.get(`verify:${userId}`);
  const enc = new TextEncoder();
  const matchesD1 = tokenRow && constantTimeEqual(enc.encode(tokenRow.token_hash), enc.encode(candidateHash));
  const matchesKv = kvHash && constantTimeEqual(enc.encode(kvHash), enc.encode(candidateHash));

  if (!matchesD1 && !matchesKv) {
    return c.json({ success: false, message: "El código de seguridad ingresado es incorrecto o ha expirado." }, 400);
  }

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET status = 'VERIFIED_PENDING_APPROVAL', updated_at = ? WHERE id = ?").bind(
      now,
      userId
    ),
    c.env.DB.prepare("UPDATE verification_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL").bind(
      now,
      userId
    ),
  ]);
  await c.env.KV.delete(`verify:${userId}`);

  const admins = await c.env.DB.prepare("SELECT id FROM users WHERE role = 'ADMIN'").all<{ id: string }>();
  for (const adm of admins.results || []) {
    await createNotification(
      c.env.DB,
      adm.id,
      "Asesor Verificado - Pendiente de Aprobación",
      `El asesor ${user.name} (${user.email}) verificó su código de seguridad. Requiere aprobación final para ingresar.`,
      "WARNING"
    );
  }

  await logAudit(
    c.env,
    { id: user.id, name: user.name, role: user.role },
    "USER_VERIFIED",
    "USER",
    user.id,
    `Asesor ${user.name} verificó exitosamente su código de registro.`
  );

  return c.json({
    success: true,
    message: "Código verificado con éxito. Su cuenta se encuentra en espera de aprobación por el Director General.",
  });
});
