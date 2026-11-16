import { ensureDatabaseReady } from './startup-migrations';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Hono } from "hono";
import { authRoutes } from "./routes/auth";
import { adminRoutes } from "./routes/admin";
import { caseRoutes } from "./routes/cases";
import { templateRoutes } from "./routes/templates";
import { communicationRoutes } from "./routes/communications";
import { handleQueueBatch } from "./queue";
import type { Env, HonoVariables, QueueTaskMessage } from "./types";

const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
// Gate every API call until the bundled D1 schema is ready.
app.use('/api/*', async (c, next) => {
  try {
    await ensureDatabaseReady(c.env.DB);
  } catch (error) {
    console.error('Automatic D1 initialization failed:', error);
    return c.json({ message: 'Estamos trabajando en la base de datos. Aguarde.', error: 'database_initializing' }, 503, { 'Retry-After': '5' });
  }
  await next();
});


app.onError((err, c) => {
  console.error("[Worker Error]", err);
  if (c.req.path.startsWith("/api/")) {
    return c.json(
      {
        success: false,
        error: true,
        message: err?.message || "Error interno en el Worker de Cloudflare.",
      },
      500
    );
  }
  return c.text("Error interno del servidor.", 500);
});

// Native Cloudflare Worker Health Check (verifies D1 + KV + R2 bindings)
app.get("/api/health", async (c) => {
  const checks: Record<string, string> = {
    worker: "ok",
    d1: "unknown",
    kv: "unknown",
    r2: "unknown",
    ai: c.env.AI ? "bound" : "missing",
  };

  try {
    await c.env.DB.prepare("SELECT 1").first();
    checks.d1 = "ok";
  } catch (err: any) {
    checks.d1 = `error: ${err?.message || "failed"}`;
  }

  try {
    await c.env.KV.get("health:ping");
    checks.kv = "ok";
  } catch (err: any) {
    checks.kv = `error: ${err?.message || "failed"}`;
  }

  try {
    await c.env.BUCKET.list({ limit: 1 });
    checks.r2 = "ok";
  } catch (err: any) {
    checks.r2 = `error: ${err?.message || "failed"}`;
  }

  // The startup gate requires D1 only. KV and R2 remain diagnostic checks.
  const databaseReady = checks.d1 === "ok";
  return c.json({ ok: databaseReady, status: databaseReady ? "ok" : "degraded", checks }, databaseReady ? 200 : 503);
});

// Register API route modules
app.route("/api/auth", authRoutes);
app.route("/api", adminRoutes);
app.route("/api", caseRoutes);
app.route("/api", templateRoutes);
app.route("/api", communicationRoutes);

app.all("/api/*", (c) => {
  return c.json({ success: false, message: "Ruta API no encontrada." }, 404);
});

// Serve Static Assets SPA fallback when Assets binding is present
app.all("*", async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text("Static Assets binding (ASSETS) no disponible.", 404);
});

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<QueueTaskMessage>, env: Env): Promise<void> {
    await handleQueueBatch(batch, env);
  },
};
