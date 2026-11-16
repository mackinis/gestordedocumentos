/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Context } from "hono";
import type { Env, SessionPayload, UserRole } from "./types";

const SESSION_COOKIE_NAME = "gd_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const PBKDF2_ITERATIONS = 100_000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(new Uint8Array(digest));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(new Uint8Array(derivedBits))}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !storedHash.startsWith("pbkdf2$")) {
    return false;
  }
  const parts = storedHash.split("$");
  if (parts.length !== 4) return false;
  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 10_000) return false;

  const salt = fromHex(parts[2]);
  const expected = fromHex(parts[3]);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    expected.length * 8
  );
  return constantTimeEqual(new Uint8Array(derivedBits), expected);
}

export function generateSecureToken(length = 16): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*-_";
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  return result;
}

export async function getSessionSecret(env: Env, requestUrl: string): Promise<string> {
  if (env.SESSION_SECRET && env.SESSION_SECRET.trim().length >= 16) {
    return env.SESSION_SECRET.trim();
  }
  const url = new URL(requestUrl);
  const isLocal =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "0.0.0.0" ||
    env.APP_ENV === "development";

  if (!isLocal) {
    throw new Error("SESSION_SECRET no configurado en los secretos del Worker de Cloudflare.");
  }

  // Ephemeral random secret persisted only in local KV for dev sessions
  const cached = await env.KV.get("system:dev_session_secret");
  if (cached) return cached;
  const generated = toHex(crypto.getRandomValues(new Uint8Array(32)));
  await env.KV.put("system:dev_session_secret", generated);
  return generated;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signSessionToken(payload: SessionPayload, secret: string): Promise<string> {
  const encodedPayload = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encodedPayload));
  return `${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token: string, secret: string): Promise<SessionPayload | null> {
  if (!token || !token.includes(".")) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, encodedSig] = parts;

  try {
    const key = await importHmacKey(secret);
    const sigBytes = fromBase64Url(encodedSig);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(encodedPayload)
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedPayload))) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.sub || !payload.jti || !payload.exp || payload.exp < now) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function createUserSession(
  env: Env,
  userId: string,
  role: UserRole,
  requestUrl: string
): Promise<{ token: string; jti: string; maxAge: number }> {
  const secret = await getSessionSecret(env, requestUrl);
  const now = Math.floor(Date.now() / 1000);
  const jti = crypto.randomUUID();
  const payload: SessionPayload = {
    sub: userId,
    jti,
    role,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const token = await signSessionToken(payload, secret);

  await env.KV.put(
    `session:${jti}`,
    JSON.stringify({ userId, role, createdAt: new Date().toISOString() }),
    { expirationTtl: SESSION_TTL_SECONDS }
  );

  return { token, jti, maxAge: SESSION_TTL_SECONDS };
}

export async function revokeUserSession(env: Env, jti: string): Promise<void> {
  if (!jti) return;
  await env.KV.delete(`session:${jti}`);
}

export function extractSessionToken(c: Context): string | null {
  const cookieHeader = c.req.header("Cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";");
    for (const part of cookies) {
      const idx = part.indexOf("=");
      if (idx === -1) continue;
      const name = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      if (name === SESSION_COOKIE_NAME && val) {
        return decodeURIComponent(val);
      }
    }
  }
  const auth = c.req.header("Authorization");
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}

export function buildSessionCookieHeader(token: string, requestUrl: string, maxAge = SESSION_TTL_SECONDS): string {
  const isHttps = new URL(requestUrl).protocol === "https:";
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (isHttps) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function buildClearSessionCookieHeader(requestUrl: string): string {
  const isHttps = new URL(requestUrl).protocol === "https:";
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isHttps) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const fullKey = `rl:${key}`;
  const raw = await kv.get(fullKey);
  const current = raw ? parseInt(raw, 10) || 0 : 0;
  if (current >= maxAttempts) {
    return { allowed: false, remaining: 0 };
  }
  await kv.put(fullKey, String(current + 1), { expirationTtl: windowSeconds });
  return { allowed: true, remaining: Math.max(0, maxAttempts - current - 1) };
}

export async function verifyTurnstileToken(
  env: Env,
  token: string | undefined,
  remoteIp?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    // Turnstile not configured in environment variables/secrets; skip strict remote check
    return { ok: true };
  }
  if (!token || !token.trim()) {
    return { ok: false, error: "Debe completar la verificación de seguridad de Cloudflare Turnstile." };
  }

  const formData = new URLSearchParams();
  formData.append("secret", secret);
  formData.append("response", token.trim());
  if (remoteIp) {
    formData.append("remoteip", remoteIp);
  }

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
    });
    const outcome = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!outcome.success) {
      return {
        ok: false,
        error: `Verificación Turnstile fallida (${(outcome["error-codes"] || ["invalid"]).join(", ")}).`,
      };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: `Error validando Cloudflare Turnstile: ${err?.message || "red"}` };
  }
}
