/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { unstable_startWorker } from "wrangler";

const ROOT = process.cwd();
let worker;
let persistDir;

// Helper to parse Set-Cookie header into a single Cookie header string
function extractSessionCookie(res) {
  const setCookie =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie")]
        : [];
  const match = setCookie
    .map((s) => s.split(";")[0])
    .find((kv) => kv.startsWith("gd_session="));
  return match || "";
}

before(async () => {
  persistDir = fs.mkdtempSync(path.join(os.tmpdir(), "gd-cf-test-"));

  // Ensure ./dist exists for Static Assets testing
  assert.ok(fs.existsSync(path.join(ROOT, "dist/index.html")), "dist/index.html debe existir (ejecute npm run build)");

  // Initialize isolated D1 schema cleanly (only 0001_initial_schema.sql)
  execFileSync(
    "npx",
    [
      "--no-install",
      "wrangler",
      "d1",
      "execute",
      "gestor-documentos-db",
      "--local",
      "--persist-to",
      persistDir,
      "--file",
      path.join(ROOT, "migrations/0001_initial_schema.sql")
    ],
    { cwd: ROOT, stdio: "pipe" }
  );

  worker = await unstable_startWorker({
    config: path.join(ROOT, "wrangler.jsonc"),
    bindings: {
      APP_ENV: { type: "plain_text", value: "test" },
      VERIFICATION_MODE: { type: "plain_text", value: "ADMIN_CODE" },
      SESSION_SECRET: { type: "plain_text", value: "test-session-secret-0123456789abcdef" },
      BOOTSTRAP_ADMIN_SECRET: { type: "plain_text", value: "bootstrap-test-key" }
    },
    dev: {
      remote: false,
      persist: persistDir,
      server: { port: 0, hostname: "127.0.0.1" },
      inspector: false
    }
  });
});

after(async () => {
  if (worker) {
    await worker.dispose();
  }
  if (persistDir && fs.existsSync(persistDir)) {
    fs.rmSync(persistDir, { recursive: true, force: true });
  }
});

test("Flujo completo 100% Cloudflare Worker: Static Assets, Setup Admin, Auth Cookie/KV, Registro+Código 16c, RBAC, D1 Expedientes, R2 Upload/Download y Workers AI", async () => {
  // 0. Static Assets SPA delivery (single Worker serves both frontend & API)
  const rootAssetRes = await worker.fetch("http://localhost/");
  assert.equal(rootAssetRes.status, 200);
  const rootHtml = await rootAssetRes.text();
  assert.ok(rootHtml.includes("<div id=\"root\"></div>"));

  // 1. Health check (D1 + KV + R2)
  const healthRes = await worker.fetch("http://localhost/api/health");
  assert.equal(healthRes.status, 200);
  const healthJson = await healthRes.json();
  assert.equal(healthJson.ok, true);
  assert.equal(healthJson.checks.d1, "ok");
  assert.equal(healthJson.checks.kv, "ok");
  assert.equal(healthJson.checks.r2, "ok");

  // 2. Setup status before initial admin
  const setupStatus1 = await worker.fetch("http://localhost/api/auth/setup-status");
  assert.equal(setupStatus1.status, 200);
  const statusData1 = await setupStatus1.json();
  assert.equal(statusData1.needsSetup, true);
  assert.equal(statusData1.requiresBootstrapSecret, true);

  // 3. Reject wrong bootstrap secret
  const badSetup = await worker.fetch("http://localhost/api/auth/setup-admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Director Test",
      email: "admin@empresa.test",
      password: "AdminPassword!2026",
      setupSecret: "wrong-secret"
    })
  });
  assert.equal(badSetup.status, 403);

  // 4. Create initial admin securely & receive HttpOnly session cookie
  const goodSetup = await worker.fetch("http://localhost/api/auth/setup-admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Director Test",
      email: "admin@empresa.test",
      password: "AdminPassword!2026",
      phone: "+541155550000",
      setupSecret: "bootstrap-test-key"
    })
  });
  assert.equal(goodSetup.status, 200);
  const adminSetupJson = await goodSetup.json();
  assert.equal(adminSetupJson.success, true);
  assert.equal(adminSetupJson.user.role, "ADMIN");
  let adminCookie = extractSessionCookie(goodSetup);
  assert.ok(adminCookie.startsWith("gd_session="));

  // 5. Second setup-admin call must be permanently blocked (403)
  const secondSetup = await worker.fetch("http://localhost/api/auth/setup-admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Otro Admin",
      email: "otro@empresa.test",
      password: "OtroPassword!2026",
      setupSecret: "bootstrap-test-key"
    })
  });
  assert.equal(secondSetup.status, 403);

  // 6. Verify /api/auth/me & /api/auth/logout (KV revocation)
  const meRes = await worker.fetch("http://localhost/api/auth/me", {
    headers: { Cookie: adminCookie }
  });
  assert.equal(meRes.status, 200);
  const meJson = await meRes.json();
  assert.equal(meJson.email, "admin@empresa.test");

  const logoutRes = await worker.fetch("http://localhost/api/auth/logout", {
    method: "POST",
    headers: { Cookie: adminCookie }
  });
  assert.equal(logoutRes.status, 200);

  const meAfterLogout = await worker.fetch("http://localhost/api/auth/me", {
    headers: { Cookie: adminCookie }
  });
  assert.equal(meAfterLogout.status, 401);

  // 7. Re-login as Admin
  const adminLogin = await worker.fetch("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@empresa.test",
      password: "AdminPassword!2026"
    })
  });
  assert.equal(adminLogin.status, 200);
  adminCookie = extractSessionCookie(adminLogin);
  assert.ok(adminCookie.startsWith("gd_session="));

  // 8. Register advisor -> issue 16-char code -> verify-token -> admin approve
  const regAdvisor = await worker.fetch("http://localhost/api/auth/register-advisor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Asesora Laura",
      email: "laura@empresa.test",
      password: "LauraPassword!2026",
      phone: "+541144449999"
    })
  });
  assert.equal(regAdvisor.status, 200);
  const regJson = await regAdvisor.json();
  assert.equal(regJson.verificationMode, "ADMIN_CODE");
  const advisorId = regJson.userId;

  const issueRes = await worker.fetch(`http://localhost/api/admin/users/${advisorId}/issue-verification-code`, {
    method: "POST",
    headers: { Cookie: adminCookie }
  });
  assert.equal(issueRes.status, 200);
  const issueJson = await issueRes.json();
  assert.equal(issueJson.verificationCode.length, 16);

  const verifyRes = await worker.fetch("http://localhost/api/auth/verify-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: advisorId,
      token: issueJson.verificationCode
    })
  });
  assert.equal(verifyRes.status, 200);

  const approveRes = await worker.fetch(`http://localhost/api/admin/users/${advisorId}/approve`, {
    method: "POST",
    headers: { Cookie: adminCookie }
  });
  assert.equal(approveRes.status, 200);

  // 9. Advisor login + RBAC check (403 on admin endpoints)
  const advisorLogin = await worker.fetch("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "laura@empresa.test",
      password: "LauraPassword!2026"
    })
  });
  assert.equal(advisorLogin.status, 200);
  const advisorCookie = extractSessionCookie(advisorLogin);

  const forbiddenAdmin = await worker.fetch("http://localhost/api/admin/settings", {
    headers: { Cookie: advisorCookie }
  });
  assert.equal(forbiddenAdmin.status, 403);

  // 10. Create Template & Case in D1 (Admin) assigned to Advisor
  const tplRes = await worker.fetch("http://localhost/api/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      name: "Compraventa Test",
      category: "Inmobiliaria",
      description: "Proceso de prueba D1",
      stages: [
        {
          id: "stg-test-1",
          name: "Etapa 1: Documentación",
          description: "Carga inicial",
          order: 1,
          requirements: [
            {
              id: "req-doc-1",
              type: "DOCUMENT",
              name: "DNI Comprador",
              description: "Archivo legible",
              required: true
            }
          ]
        }
      ]
    })
  });
  assert.equal(tplRes.status, 200);
  const tplJson = await tplRes.json();

  const caseRes = await worker.fetch("http://localhost/api/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      title: "Expediente Test R2+D1",
      description: "Verificación de persistencia",
      templateId: tplJson.id,
      advisorId
    })
  });
  assert.equal(caseRes.status, 200);
  const caseJson = await caseRes.json();
  assert.ok(caseJson.id);

  // 11. Upload file to R2 via /api/cases/:id/requirements/:reqId/upload
  const sampleText = "Documento de identidad de prueba para R2 - Titular: Laura Test";
  const base64File = Buffer.from(sampleText, "utf8").toString("base64");
  const uploadRes = await worker.fetch(`http://localhost/api/cases/${caseJson.id}/requirements/req-doc-1/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: advisorCookie },
    body: JSON.stringify({
      fileName: "dni_laura.txt",
      fileType: "text/plain",
      fileSize: "1 KB",
      fileContent: `data:text/plain;base64,${base64File}`
    })
  });
  assert.equal(uploadRes.status, 200);
  const uploadedDoc = await uploadRes.json();
  assert.ok(uploadedDoc.r2Key);
  assert.equal(uploadedDoc.fileUrl, `/api/documents/download/${uploadedDoc.id}`);

  // 12. R2 Authenticated Download Proxy enforces downloadEnabled for ASESOR, allows ADMIN
  const blockedDownload = await worker.fetch(`http://localhost${uploadedDoc.fileUrl}`, {
    headers: { Cookie: advisorCookie }
  });
  assert.equal(blockedDownload.status, 403);

  const adminDownload = await worker.fetch(`http://localhost${uploadedDoc.fileUrl}`, {
    headers: { Cookie: adminCookie }
  });
  assert.equal(adminDownload.status, 200);
  assert.equal(await adminDownload.text(), sampleText);

  const enableDownload = await worker.fetch(
    `http://localhost/api/cases/${caseJson.id}/requirements/req-doc-1/toggle-download`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ downloadEnabled: true })
    }
  );
  assert.equal(enableDownload.status, 200);

  const allowedDownload = await worker.fetch(`http://localhost${uploadedDoc.fileUrl}`, {
    headers: { Cookie: advisorCookie }
  });
  assert.equal(allowedDownload.status, 200);
  assert.equal(await allowedDownload.text(), sampleText);

  // 13. SPA fallback serves index.html cleanly for client routes
  const spaRes = await worker.fetch("http://localhost/expedientes");
  assert.equal(spaRes.status, 200);
  const spaHtml = await spaRes.text();
  assert.ok(spaHtml.includes("<div id=\"root\"></div>"));

  // 14. Verify Workers AI endpoints never return mocked fake success when offline/unauthenticated
  const aiGenRes = await worker.fetch("http://localhost/api/templates/generate-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ sector: "Inmobiliaria", requirementsDescription: "Contrato simple" })
  });
  if (aiGenRes.status === 200) {
    const aiData = await aiGenRes.json();
    assert.ok(Array.isArray(aiData.stages) && aiData.stages.length > 0);
  } else {
    // Offline / unauthenticated Wrangler environment must explicitly return non-200 error, never fake AI JSON
    assert.equal(aiGenRes.status, 502);
    const errBody = await aiGenRes.json();
    assert.equal(errBody.error, true);
    assert.ok(typeof errBody.message === "string" && errBody.message.length > 0);
  }

  const aiDocRes = await worker.fetch(`http://localhost/api/cases/${caseJson.id}/documents/${uploadedDoc.id}/analyze-ai`, {
    method: "POST",
    headers: { Cookie: adminCookie }
  });
  if (aiDocRes.status === 200) {
    const aiDocData = await aiDocRes.json();
    assert.equal(aiDocData.success, true);
    assert.ok(aiDocData.analysis);
  } else {
    assert.equal(aiDocRes.status, 502);
    const errDocBody = await aiDocRes.json();
    assert.equal(errDocBody.success, false);
    assert.ok(typeof errDocBody.message === "string" && errDocBody.message.length > 0);
  }
});
