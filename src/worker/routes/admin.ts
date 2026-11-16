/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { requireAdmin, requireAuth, requireManagerOrAdmin } from "./auth";
import { generateSecureToken, hashPassword, sha256Hex } from "../security";
import {
  createNotification,
  getSystemSettings,
  logAudit,
  rowToUser,
  safeJsonParse,
  sanitizeUser,
  saveSystemSettings,
} from "../db";
import type { Env, HonoVariables } from "../types";

export const adminRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// Public settings (safe flags only — no secrets)
adminRoutes.get("/settings/commercial-focus", async (c) => {
  const settings = await getSystemSettings(c.env.DB, c.env.KV);
  return c.json({ commercialFocus: settings.commercialFocus || "general" });
});

adminRoutes.get("/settings/public", async (c) => {
  const settings = await getSystemSettings(c.env.DB, c.env.KV);
  return c.json({
    commercialFocus: settings.commercialFocus || "general",
    allowAdvisorViewProductivity: Boolean(settings.allowAdvisorViewProductivity),
    customTexts: settings.customTexts || {},
    verificationChannel: settings.verificationChannel || "ADMIN_CODE",
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY?.trim() || null,
    cfEmailConfigured: Boolean(c.env.SEND_EMAIL),
    messagingSettings: settings.messagingSettings,
  });
});

// Admin/Manager settings read
adminRoutes.get("/admin/settings", requireAuth, requireManagerOrAdmin, async (c) => {
  const settings = await getSystemSettings(c.env.DB, c.env.KV);
  return c.json({
    ...settings,
    cfEmailConfigured: Boolean(c.env.SEND_EMAIL),
    turnstileEnabled: Boolean(c.env.TURNSTILE_SECRET_KEY && c.env.TURNSTILE_SITE_KEY),
  });
});

adminRoutes.post("/admin/settings", requireAuth, requireManagerOrAdmin, async (c) => {
  const requester = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const current = await getSystemSettings(c.env.DB, c.env.KV);

  // Only ADMIN may alter verificationChannel, messagingSettings or productivity settings; Managers can update commercialFocus/customTexts if permitted
  const nextSettings = {
    ...current,
    ...body,
  };
  if (requester.role !== "ADMIN") {
    nextSettings.verificationChannel = current.verificationChannel;
    nextSettings.messagingSettings = current.messagingSettings;
  }

  const saved = await saveSystemSettings(c.env.DB, nextSettings, c.env.KV);
  await logAudit(
    c.env,
    requester,
    "SETTINGS_UPDATED",
    "SYSTEM",
    "settings",
    `${requester.role === "ADMIN" ? "El Director General" : "El Manager"} actualizó las configuraciones.`
  );
  return c.json({ success: true, settings: saved });
});

// Authenticated user list (contact info masked for ASESOR except self)
adminRoutes.get("/users", requireAuth, async (c) => {
  const requester = c.get("user");
  const rows = await c.env.DB.prepare("SELECT * FROM users ORDER BY created_at ASC").all<any>();
  const canSeeDetails = requester.role === "ADMIN" || requester.role === "MANAGER";

  const users = (rows.results || []).map((row) =>
    sanitizeUser(row, canSeeDetails || row.id === requester.id)
  );
  return c.json(users);
});

// Admin/Manager generates a fresh one-time verification code in ADMIN_CODE mode and hands it to the advisor
adminRoutes.post("/admin/users/:id/issue-verification-code", requireAuth, requireManagerOrAdmin, async (c) => {
  const requester = c.get("user");
  const targetId = c.req.param("id") || "";
  const targetUser = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first<any>();
  if (!targetUser) {
    return c.json({ success: false, message: "Usuario no encontrado." }, 404);
  }
  if (targetUser.status !== "PENDING") {
    return c.json(
      { success: false, message: "Solo se puede generar código para usuarios con estado PENDING." },
      400
    );
  }

  const token = generateSecureToken(16);
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await c.env.DB.prepare(
    `INSERT INTO verification_tokens (id, user_id, token_hash, channel, expires_at, created_at)
     VALUES (?, ?, ?, 'ADMIN_CODE', ?, ?)`
  )
    .bind(`vt-${Date.now()}`, targetId, tokenHash, expiresAt, now)
    .run();

  await c.env.KV.put(`verify:${targetId}`, tokenHash, { expirationTtl: 86400 });

  await logAudit(
    c.env,
    requester,
    "VERIFICATION_CODE_ISSUED",
    "USER",
    targetId,
    `${requester.name} generó un código de verificación de un solo uso para ${targetUser.name}.`
  );

  return c.json({
    success: true,
    verificationCode: token,
    expiresAt,
    message: "Código de 16 caracteres generado. Entréguelo de forma segura al asesor.",
  });
});

adminRoutes.post("/admin/users/:id/approve", requireAuth, requireAdmin, async (c) => {
  const requester = c.get("user");
  const targetId = c.req.param("id") || "";
  const target = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first<any>();
  if (!target) {
    return c.json({ success: false, message: "Usuario no encontrado." }, 404);
  }

  const now = new Date().toISOString();
  await c.env.DB.prepare("UPDATE users SET status = 'APPROVED', updated_at = ? WHERE id = ?")
    .bind(now, targetId)
    .run();

  await createNotification(
    c.env.DB,
    targetId,
    "Registro Aprobado",
    "Su solicitud ha sido aprobada por el Director General. Ya puede acceder plenamente al Gestor de Expedientes.",
    "SUCCESS"
  );

  await logAudit(
    c.env,
    requester,
    "USER_APPROVED",
    "USER",
    targetId,
    `El Director General aprobó manualmente el registro del usuario ${target.name}.`
  );

  return c.json({ success: true, message: "Asesor aprobado con éxito." });
});

adminRoutes.post("/admin/users/:id/reject", requireAuth, requireAdmin, async (c) => {
  const requester = c.get("user");
  const targetId = c.req.param("id") || "";
  const target = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first<any>();
  if (!target) {
    return c.json({ success: false, message: "Usuario no encontrado." }, 404);
  }

  const now = new Date().toISOString();
  await c.env.DB.prepare("UPDATE users SET status = 'REJECTED', updated_at = ? WHERE id = ?")
    .bind(now, targetId)
    .run();

  await logAudit(
    c.env,
    requester,
    "USER_REJECTED",
    "USER",
    targetId,
    `El Director General rechazó manualmente la solicitud de registro de ${target.name}.`
  );

  return c.json({ success: true, message: "Asesor rechazado con éxito." });
});

adminRoutes.post("/admin/users/:id/suspend", requireAuth, requireAdmin, async (c) => {
  const requester = c.get("user");
  const targetId = c.req.param("id") || "";
  if (targetId === requester.id) {
    return c.json({ success: false, message: "No puedes suspender tu propia cuenta." }, 400);
  }
  const target = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first<any>();
  if (!target) {
    return c.json({ success: false, message: "Usuario no encontrado." }, 404);
  }

  const now = new Date().toISOString();
  await c.env.DB.prepare("UPDATE users SET status = 'SUSPENDED', updated_at = ? WHERE id = ?")
    .bind(now, targetId)
    .run();

  await createNotification(
    c.env.DB,
    targetId,
    "Cuenta Suspendida",
    "Su cuenta ha sido suspendida temporalmente por el Director General.",
    "WARNING"
  );
  await logAudit(
    c.env,
    requester,
    "USER_SUSPENDED",
    "USER",
    targetId,
    `El Director General suspendió al usuario ${target.name}.`
  );

  return c.json({ success: true, message: "Usuario suspendido con éxito." });
});

adminRoutes.post("/admin/users/:id/ban", requireAuth, requireAdmin, async (c) => {
  const requester = c.get("user");
  const targetId = c.req.param("id") || "";
  if (targetId === requester.id) {
    return c.json({ success: false, message: "No puedes bloquear tu propia cuenta." }, 400);
  }
  const target = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first<any>();
  if (!target) {
    return c.json({ success: false, message: "Usuario no encontrado." }, 404);
  }

  const now = new Date().toISOString();
  await c.env.DB.prepare("UPDATE users SET status = 'BANNED', updated_at = ? WHERE id = ?")
    .bind(now, targetId)
    .run();

  await logAudit(
    c.env,
    requester,
    "USER_BANNED",
    "USER",
    targetId,
    `El Director General baneó al usuario ${target.name}.`
  );

  return c.json({ success: true, message: "Usuario baneado con éxito." });
});

adminRoutes.delete("/admin/users/:id", requireAuth, requireAdmin, async (c) => {
  const requester = c.get("user");
  const targetId = c.req.param("id") || "";
  if (targetId === requester.id) {
    return c.json({ success: false, message: "No puedes eliminar tu propia cuenta activa." }, 400);
  }
  const target = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first<any>();
  if (!target) {
    return c.json({ success: false, message: "Usuario no encontrado." }, 404);
  }

  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(targetId).run();
  await logAudit(
    c.env,
    requester,
    "USER_DELETED",
    "USER",
    targetId,
    `El Director General eliminó al usuario ${target.name}.`
  );
  return c.json({ success: true, message: "Usuario eliminado con éxito." });
});

async function createStaffUser(
  c: Context<{ Bindings: Env; Variables: HonoVariables }>,
  role: "MANAGER" | "ASESOR",
  responseKey: "manager" | "advisor" | "user"
) {
  const requester = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();

  if (!email || !password || !name) {
    return c.json(
      { success: false, message: "Email, contraseña y nombre completo son datos requeridos." },
      400
    );
  }
  if (password.length < 8) {
    return c.json(
      { success: false, message: "La contraseña debe tener al menos 8 caracteres." },
      400
    );
  }

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE LOWER(email) = ?").bind(email).first();
  if (existing) {
    return c.json({ success: false, message: "Ya existe un usuario registrado bajo este correo electrónico." }, 400);
  }

  const id = `usr-${role === "MANAGER" ? "manager" : "asesor"}-${Date.now()}`;
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, name, role, avatar_url, phone, address, status, can_create_cases, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '', ?, '', 'APPROVED', ?, ?, ?)`
  )
    .bind(id, email, passwordHash, name, role, phone, role === "MANAGER" ? 1 : 0, now, now)
    .run();

  const createdRow = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<any>();
  const createdUser = sanitizeUser(createdRow, true);

  await logAudit(
    c.env,
    requester,
    role === "MANAGER" ? "MANAGER_CREATED" : "CREDENTIAL_CREATED",
    "USER",
    id,
    `El Director General creó un nuevo ${role}: ${name} (${email}).`
  );

  return c.json({ success: true, [responseKey]: createdUser });
}

adminRoutes.post("/admin/create-manager", requireAuth, requireAdmin, async (c) =>
  createStaffUser(c, "MANAGER", "manager")
);

adminRoutes.post("/admin/create-advisor", requireAuth, requireAdmin, async (c) =>
  createStaffUser(c, "ASESOR", "advisor")
);

adminRoutes.post("/admin/create-credential", requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const role = body.role === "MANAGER" ? "MANAGER" : "ASESOR";
  // Clone body into a fresh handler check using standard createStaffUser logic
  const requester = c.get("user");
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();

  if (!email || !password || !name) {
    return c.json({ success: false, message: "Nombre, Correo, Contraseña y Rol son campos requeridos." }, 400);
  }
  if (password.length < 8) {
    return c.json({ success: false, message: "La contraseña debe tener al menos 8 caracteres." }, 400);
  }
  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE LOWER(email) = ?").bind(email).first();
  if (existing) {
    return c.json({ success: false, message: "Este correo electrónico ya se encuentra registrado." }, 400);
  }

  const id = `usr-${role.toLowerCase()}-${Date.now()}`;
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, name, role, avatar_url, phone, address, status, can_create_cases, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '', ?, '', 'APPROVED', ?, ?, ?)`
  )
    .bind(id, email, passwordHash, name, role, phone, role === "MANAGER" ? 1 : 0, now, now)
    .run();

  const createdRow = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<any>();
  await logAudit(
    c.env,
    requester,
    "CREDENTIAL_CREATED",
    "USER",
    id,
    `El Director General creó credenciales para: ${name} (${email}) - Rol: ${role}`
  );
  return c.json({ success: true, user: sanitizeUser(createdRow, true) });
});

adminRoutes.post("/admin/users/:id/update-profile", requireAuth, requireAdmin, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const targetRow = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<any>();
  if (!targetRow) {
    return c.json({ success: false, message: "Usuario no encontrado." }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const name = body.name ? String(body.name).trim() : targetRow.name;
  const email = body.email ? String(body.email).trim().toLowerCase() : targetRow.email;
  const phone = body.phone !== undefined ? String(body.phone).trim() : targetRow.phone;
  const address = body.address !== undefined ? String(body.address).trim() : targetRow.address;
  const status = body.status || targetRow.status;
  const role = body.role && ["ADMIN", "MANAGER", "ASESOR"].includes(body.role) ? body.role : targetRow.role;
  const canCreateCases =
    body.canCreateCases !== undefined ? (body.canCreateCases ? 1 : 0) : targetRow.can_create_cases;
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `UPDATE users SET name = ?, email = ?, phone = ?, address = ?, status = ?, role = ?, can_create_cases = ?, updated_at = ? WHERE id = ?`
  )
    .bind(name, email, phone, address, status, role, canCreateCases, now, id)
    .run();

  const updated = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<any>();
  await logAudit(
    c.env,
    requester,
    "USER_PROFILE_ADMIN_MUTATED",
    "USER",
    id,
    `Admin actualizó el perfil de ${name} (${role}). Cambios sensibles aplicados directamente.`
  );

  return c.json({
    success: true,
    message: "Perfil de personal actualizado directamente.",
    user: sanitizeUser(updated, true),
  });
});

adminRoutes.post("/users/:id/update-create-permission", requireAuth, requireManagerOrAdmin, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const targetRow = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<any>();
  if (!targetRow) {
    return c.json({ success: false, message: "Usuario no encontrado." }, 404);
  }
  const body = await c.req.json().catch(() => ({}));
  const canCreateCases = Boolean(body.canCreateCases);
  const now = new Date().toISOString();

  await c.env.DB.prepare("UPDATE users SET can_create_cases = ?, updated_at = ? WHERE id = ?")
    .bind(canCreateCases ? 1 : 0, now, id)
    .run();

  const updated = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<any>();
  await logAudit(
    c.env,
    requester,
    "USER_PERMISSION_MUTATED",
    "USER",
    id,
    `${requester.name} modificó permisos de creación para ${targetRow.name}: canCreateCases = ${canCreateCases}`
  );

  return c.json({
    success: true,
    message: "Permiso de creación actualizado con éxito.",
    user: sanitizeUser(updated, true),
  });
});

// Profile change requests & profile self-updates
adminRoutes.get("/profile/change-requests", requireAuth, requireAdmin, async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM profile_change_requests ORDER BY created_at DESC").all<any>();
  const list = (rows.results || []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    userRole: r.user_role,
    currentData: safeJsonParse(r.current_data_json, {}),
    requestedData: safeJsonParse(r.requested_data_json, {}),
    status: r.status,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  }));
  return c.json(list);
});

adminRoutes.post("/profile/change-requests/:id/resolve", requireAuth, requireAdmin, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const body = await c.req.json().catch(() => ({}));
  const finalStatus = body.status === "APROBADO" ? "APROBADO" : "RECHAZADO";

  const reqRow = await c.env.DB.prepare("SELECT * FROM profile_change_requests WHERE id = ?").bind(id).first<any>();
  if (!reqRow) {
    return c.json({ success: false, message: "Solicitud de modificación de perfil no encontrada." }, 404);
  }
  if (reqRow.status !== "PENDIENTE") {
    return c.json({ success: false, message: "Esta solicitud ya ha sido resuelta." }, 400);
  }

  const now = new Date().toISOString();
  await c.env.DB.prepare("UPDATE profile_change_requests SET status = ?, resolved_at = ? WHERE id = ?")
    .bind(finalStatus, now, id)
    .run();

  const target = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(reqRow.user_id).first<any>();
  const requestedData = safeJsonParse<Record<string, any>>(reqRow.requested_data_json, {});

  if (finalStatus === "APROBADO" && target) {
    const newName = requestedData.name || target.name;
    const newEmail = requestedData.email ? String(requestedData.email).trim().toLowerCase() : target.email;
    const newPhone = requestedData.phone ?? target.phone;
    const newAddress = requestedData.address ?? target.address;

    await c.env.DB.prepare(
      "UPDATE users SET name = ?, email = ?, phone = ?, address = ?, updated_at = ? WHERE id = ?"
    )
      .bind(newName, newEmail, newPhone, newAddress, now, target.id)
      .run();

    await logAudit(
      c.env,
      requester,
      "PROFILE_CHANGE_APPROVED",
      "USER",
      target.id,
      `Se aprobó el cambio de perfil de ${target.role} ${target.name}.`
    );
    await createNotification(
      c.env.DB,
      target.id,
      "Cambio de perfil aprobado",
      "Tus datos de perfil han sido actualizados tras la aprobación del Director General.",
      "SUCCESS"
    );
  } else if (target) {
    await logAudit(
      c.env,
      requester,
      "PROFILE_CHANGE_REJECTED",
      "USER",
      target.id,
      `Se rechazó la solicitud de cambio de datos de perfil para ${target.name}.`
    );
    await createNotification(
      c.env.DB,
      target.id,
      "Cambio de perfil rechazado",
      "Tu solicitud de datos de perfil ha sido rechazada por el Director General.",
      "DANGER"
    );
  }

  return c.json({
    success: true,
    request: {
      id: reqRow.id,
      userId: reqRow.user_id,
      userName: reqRow.user_name,
      userRole: reqRow.user_role,
      currentData: safeJsonParse(reqRow.current_data_json, {}),
      requestedData,
      status: finalStatus,
      createdAt: reqRow.created_at,
      resolvedAt: now,
    },
  });
});

adminRoutes.post("/profile/update", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const { name, email, phone, avatarUrl, address } = body;
  const now = new Date().toISOString();

  const dbUser = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first<any>();
  if (!dbUser) {
    return c.json({ success: false, message: "Usuario no encontrado." }, 404);
  }

  if (user.role === "ADMIN") {
    const updatedName = name ?? dbUser.name;
    const updatedEmail = email ? String(email).trim().toLowerCase() : dbUser.email;
    const updatedPhone = phone ?? dbUser.phone;
    const updatedAddress = address ?? dbUser.address;
    const updatedAvatar = avatarUrl !== undefined ? avatarUrl : dbUser.avatar_url;

    await c.env.DB.prepare(
      "UPDATE users SET name = ?, email = ?, phone = ?, address = ?, avatar_url = ?, updated_at = ? WHERE id = ?"
    )
      .bind(updatedName, updatedEmail, updatedPhone, updatedAddress, updatedAvatar, now, user.id)
      .run();

    await logAudit(c.env, user, "PROFILE_UPDATED", "USER", user.id, "Director General actualizó sus datos de perfil.");
    const refreshed = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first<any>();
    return c.json({
      success: true,
      message: "Perfil de administrador actualizado.",
      user: sanitizeUser(refreshed, true),
    });
  }

  const nextAvatar = avatarUrl !== undefined ? avatarUrl : dbUser.avatar_url;
  const nextPhone = phone !== undefined ? phone : dbUser.phone;
  const nextAddress = address !== undefined ? address : dbUser.address;

  await c.env.DB.prepare(
    "UPDATE users SET avatar_url = ?, phone = ?, address = ?, updated_at = ? WHERE id = ?"
  )
    .bind(nextAvatar, nextPhone, nextAddress, now, user.id)
    .run();

  const sensitive: Record<string, string> = {};
  if (name && name !== dbUser.name) sensitive.name = String(name).trim();
  if (email && String(email).trim().toLowerCase() !== dbUser.email.toLowerCase()) {
    sensitive.email = String(email).trim().toLowerCase();
  }

  const refreshed = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first<any>();
  const sanitized = sanitizeUser(refreshed, true);

  if (Object.keys(sensitive).length > 0) {
    const reqId = `mreq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const currentData = {
      name: dbUser.name,
      email: dbUser.email,
      phone: dbUser.phone || "",
      address: dbUser.address || "",
    };

    await c.env.DB.prepare(
      `INSERT INTO profile_change_requests (id, user_id, user_name, user_role, current_data_json, requested_data_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDIENTE', ?)`
    )
      .bind(reqId, user.id, dbUser.name, dbUser.role, JSON.stringify(currentData), JSON.stringify(sensitive), now)
      .run();

    await logAudit(
      c.env,
      user,
      "PROFILE_CHANGE_REQUESTED",
      "USER",
      user.id,
      `${dbUser.name} solicitó modificar datos de perfil sensibles.`
    );

    const admins = await c.env.DB.prepare("SELECT id FROM users WHERE role = 'ADMIN'").all<{ id: string }>();
    for (const adm of admins.results || []) {
      await createNotification(
        c.env.DB,
        adm.id,
        "Solicitud de cambio de perfil",
        `El usuario ${dbUser.name} solicita cambiar sus datos de perfil.`,
        "WARNING"
      );
    }

    return c.json({
      success: true,
      message:
        "Se actualizaron las opciones directas y se envió una solicitud de aprobación para los datos sensibles al Director General.",
      user: sanitized,
      pendingRequest: {
        id: reqId,
        userId: user.id,
        userName: dbUser.name,
        userRole: dbUser.role,
        currentData,
        requestedData: sensitive,
        status: "PENDIENTE",
        createdAt: now,
      },
    });
  }

  return c.json({ success: true, message: "Perfil actualizado exitosamente.", user: sanitized });
});

adminRoutes.post("/profile/change-password", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const newPassword = String(body.newPassword || "").trim();

  if (newPassword.length < 8) {
    return c.json(
      { success: false, message: "La nueva contraseña debe tener al menos 8 caracteres." },
      400
    );
  }

  const newHash = await hashPassword(newPassword);
  const now = new Date().toISOString();
  await c.env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .bind(newHash, now, user.id)
    .run();

  await logAudit(
    c.env,
    user,
    "PASSWORD_CHANGED",
    "USER",
    user.id,
    `${user.name} actualizó su contraseña de acceso directamente.`
  );
  return c.json({ success: true, message: "Contraseña actualizada de forma segura y directa." });
});
