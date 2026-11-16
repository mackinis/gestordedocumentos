/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Script seguro de respaldo, exportación y migración desde JSON local / exportación Firestore
 * hacia Cloudflare D1 (SQL) y Cloudflare R2 (archivos binarios).
 *
 * IMPORTANTE:
 * - Este script NUNCA modifica ni elimina /data/db.json.
 * - Crea una copia de respaldo con marca de tiempo en /backups/ antes de procesar.
 * - Genera /migrations/0002_seed_migrated_data.sql (idempotente con INSERT OR IGNORE).
 * - Extrae adjuntos base64 a /r2-migration-staging/objects/... y genera manifest + script de subida R2.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const inputIdx = args.indexOf("--input");
const inputPath = inputIdx >= 0 && args[inputIdx + 1]
  ? path.resolve(ROOT, args[inputIdx + 1])
  : path.resolve(ROOT, "data/db.json");

if (!fs.existsSync(inputPath)) {
  console.error(`Error: no se encontró el archivo fuente en ${inputPath}`);
  process.exit(1);
}

const rawJson = fs.readFileSync(inputPath, "utf8");
const db = JSON.parse(rawJson);

// 1. Respaldo inmutable antes de cualquier transformación
const backupsDir = path.resolve(ROOT, "backups");
fs.mkdirSync(backupsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(backupsDir, `db.backup-${stamp}.json`);
fs.writeFileSync(backupPath, rawJson, "utf8");

// 2. Preparar directorio de staging para R2
const r2StagingDir = path.resolve(ROOT, "r2-migration-staging");
const r2ObjectsDir = path.join(r2StagingDir, "objects");
fs.mkdirSync(r2ObjectsDir, { recursive: true });
const r2Manifest = [];

function hashPasswordNode(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.pbkdf2Sync(String(password), salt, 100_000, 32, "sha256");
  return `pbkdf2$100000$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function sqlVal(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "NULL";
  if (typeof val === "boolean") return val ? "1" : "0";
  return `'${String(val).replace(/'/g, "''")}'`;
}

function sanitizeFileSegment(name) {
  return String(name || "archivo")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "archivo";
}

function extractBase64ToR2(dataUrlOrUrl, r2Key, fallbackType = "application/octet-stream") {
  if (!dataUrlOrUrl || typeof dataUrlOrUrl !== "string") return null;
  if (!dataUrlOrUrl.startsWith("data:")) return null;

  const commaIdx = dataUrlOrUrl.indexOf(",");
  if (commaIdx < 0) return null;

  const header = dataUrlOrUrl.slice(5, commaIdx);
  const contentType = header.split(";")[0] || fallbackType;
  const base64Body = dataUrlOrUrl.slice(commaIdx + 1);
  const buffer = Buffer.from(base64Body, "base64");

  const localRelPath = path.join("objects", r2Key);
  const localFullPath = path.join(r2StagingDir, localRelPath);
  fs.mkdirSync(path.dirname(localFullPath), { recursive: true });
  fs.writeFileSync(localFullPath, buffer);

  r2Manifest.push({
    r2Key,
    localPath: path.relative(ROOT, localFullPath),
    contentType,
    bytes: buffer.length
  });

  return { r2Key, contentType, bytes: buffer.length };
}

const sqlLines = [
  "-- Migración de datos generada automáticamente por scripts/migrate-from-json.mjs",
  `-- Fuente: ${path.relative(ROOT, inputPath)}`,
  `-- Generado: ${new Date().toISOString()}`,
  "-- Respetar integridad referencial: usar wrangler d1 execute / migrations apply.",
  ""
];

const nowIso = new Date().toISOString();
let legacyWeakPasswordCount = 0;

// 3. Usuarios
for (const u of db.users || []) {
  let pwdHash = u.passwordHash;
  if (!pwdHash || !String(pwdHash).startsWith("pbkdf2$")) {
    const plain = u.password || crypto.randomBytes(18).toString("base64url");
    if (u.password && ["admin123", "password123", "123456"].includes(String(u.password))) {
      legacyWeakPasswordCount++;
    }
    pwdHash = hashPasswordNode(plain);
  }
  const role = ["ADMIN", "MANAGER", "ASESOR"].includes(u.role) ? u.role : "ASESOR";
  const status = ["PENDING", "VERIFIED_PENDING_APPROVAL", "APPROVED", "REJECTED", "SUSPENDED", "BANNED"].includes(u.status)
    ? u.status
    : "APPROVED";

  sqlLines.push(
    `INSERT OR IGNORE INTO users (id, email, password_hash, name, role, avatar_url, phone, address, status, can_create_cases, created_at, updated_at) VALUES (${[
      sqlVal(u.id),
      sqlVal(String(u.email || "").toLowerCase()),
      sqlVal(pwdHash),
      sqlVal(u.name || "Usuario"),
      sqlVal(role),
      sqlVal(u.avatarUrl || null),
      sqlVal(u.phone || ""),
      sqlVal(u.address || ""),
      sqlVal(status),
      sqlVal(Boolean(u.canCreateCases)),
      sqlVal(u.createdAt || nowIso),
      sqlVal(u.updatedAt || nowIso)
    ].join(", ")});`
  );
}

// 4. Plantillas
for (const tpl of db.templates || []) {
  sqlLines.push(
    `INSERT OR IGNORE INTO templates (id, name, category, description, created_by, is_public, stages_json, created_at) VALUES (${[
      sqlVal(tpl.id),
      sqlVal(tpl.name || "Plantilla"),
      sqlVal(tpl.category || "General"),
      sqlVal(tpl.description || ""),
      sqlVal(tpl.createdBy || null),
      sqlVal(tpl.isPublic !== false),
      sqlVal(JSON.stringify(tpl.stages || [])),
      sqlVal(tpl.createdAt || nowIso)
    ].join(", ")});`
  );
}

// 5. Expedientes
for (const c of db.cases || []) {
  const status = ["ACTIVO", "OBSERVADO", "PENDIENTE", "FINALIZADO"].includes(c.status) ? c.status : "PENDIENTE";
  sqlLines.push(
    `INSERT OR IGNORE INTO cases (id, code, title, description, template_id, status, current_stage_id, advisor_id, manager_id, stages_json, stages_determined, review_status, review_button_blocked, review_button_blocked_reason, party_counts_json, requirement_states_json, created_at, updated_at) VALUES (${[
      sqlVal(c.id),
      sqlVal(c.code || `EXP-${c.id}`),
      sqlVal(c.title || "Expediente"),
      sqlVal(c.description || ""),
      sqlVal(c.templateId || null),
      sqlVal(status),
      sqlVal(c.currentStageId || null),
      sqlVal(c.advisorId || null),
      sqlVal(c.managerId || "unassigned"),
      sqlVal(JSON.stringify(c.stages || [])),
      sqlVal(c.stagesDetermined !== false),
      sqlVal(c.reviewStatus || null),
      sqlVal(Boolean(c.reviewButtonBlocked)),
      sqlVal(c.reviewButtonBlockedReason || null),
      sqlVal(JSON.stringify(c.partyCounts || { compradores: 0, vendedores: 0, garantes: 0 })),
      sqlVal(JSON.stringify(c.requirementStates || {})),
      sqlVal(c.createdAt || nowIso),
      sqlVal(c.updatedAt || c.createdAt || nowIso)
    ].join(", ")});`
  );
}

// 6. Participantes
for (const p of db.participants || []) {
  sqlLines.push(
    `INSERT OR IGNORE INTO participants (id, case_id, role, name, apellido, dni, cuit_cuil, email, telefono, observaciones) VALUES (${[
      sqlVal(p.id),
      sqlVal(p.caseId),
      sqlVal(p.role || "Participante"),
      sqlVal(p.name || ""),
      sqlVal(p.apellido || ""),
      sqlVal(p.dni || ""),
      sqlVal(p.cuitCuil || ""),
      sqlVal(p.email || ""),
      sqlVal(p.telefono || ""),
      sqlVal(p.observaciones || "")
    ].join(", ")});`
  );
}

// 7. Documentos y versiones -> R2
for (const doc of db.documents || []) {
  const version = Number(doc.version || 1);
  const safeName = sanitizeFileSegment(doc.fileName || doc.name);
  let r2Key = doc.r2Key || null;
  let fileUrl = doc.fileUrl || null;

  if (doc.fileUrl && String(doc.fileUrl).startsWith("data:")) {
    r2Key = `cases/${doc.caseId}/${doc.id}/v${version}-${safeName}`;
    extractBase64ToR2(doc.fileUrl, r2Key, doc.fileType || "application/octet-stream");
    fileUrl = `/api/documents/download/${doc.id}`;
  }

  const docStatus = ["PENDIENTE", "CARGADO", "EN_REVISION", "APROBADO", "RECHAZADO", "VENCIDO"].includes(doc.status)
    ? doc.status
    : "PENDIENTE";

  sqlLines.push(
    `INSERT OR IGNORE INTO documents (id, case_id, requirement_id, name, status, r2_key, file_url, file_name, file_type, file_size, uploaded_at, uploaded_by, version, ai_analysis_json) VALUES (${[
      sqlVal(doc.id),
      sqlVal(doc.caseId),
      sqlVal(doc.requirementId),
      sqlVal(doc.name || "Documento"),
      sqlVal(docStatus),
      sqlVal(r2Key),
      sqlVal(fileUrl),
      sqlVal(doc.fileName || null),
      sqlVal(doc.fileType || null),
      sqlVal(doc.fileSize || null),
      sqlVal(doc.uploadedAt || null),
      sqlVal(doc.uploadedBy || null),
      sqlVal(version),
      sqlVal(doc.aiAnalysis ? JSON.stringify(doc.aiAnalysis) : null)
    ].join(", ")});`
  );

  for (const h of doc.history || []) {
    const hVer = Number(h.version || 1);
    const hName = sanitizeFileSegment(h.fileName || doc.fileName || doc.name);
    let hR2Key = h.r2Key || null;
    let hUrl = h.fileUrl || null;
    if (h.fileUrl && String(h.fileUrl).startsWith("data:")) {
      hR2Key = `cases/${doc.caseId}/${doc.id}/v${hVer}-${hName}`;
      extractBase64ToR2(h.fileUrl, hR2Key, doc.fileType || "application/octet-stream");
      hUrl = `/api/documents/download/${doc.id}?version=${hVer}`;
    }
    sqlLines.push(
      `INSERT OR IGNORE INTO document_versions (id, document_id, version, file_name, r2_key, file_url, uploaded_at, uploaded_by) VALUES (${[
        sqlVal(`${doc.id}-v${hVer}`),
        sqlVal(doc.id),
        sqlVal(hVer),
        sqlVal(h.fileName || hName),
        sqlVal(hR2Key),
        sqlVal(hUrl),
        sqlVal(h.uploadedAt || doc.uploadedAt || nowIso),
        sqlVal(h.uploadedBy || doc.uploadedBy || null)
      ].join(", ")});`
    );
  }
}

// 8. Tareas / Formularios
for (const t of db.tasks || []) {
  const tStatus = ["PENDIENTE", "EN_PROGRESO", "COMPLETA"].includes(t.status) ? t.status : "PENDIENTE";
  sqlLines.push(
    `INSERT OR IGNORE INTO tasks (id, case_id, requirement_id, name, description, status, completed_at, completed_by, form_values_json, form_instances_json) VALUES (${[
      sqlVal(t.id),
      sqlVal(t.caseId),
      sqlVal(t.requirementId),
      sqlVal(t.name || "Tarea"),
      sqlVal(t.description || ""),
      sqlVal(tStatus),
      sqlVal(t.completedAt || null),
      sqlVal(t.completedBy || null),
      sqlVal(JSON.stringify(t.formValues || {})),
      sqlVal(JSON.stringify(t.formInstances || []))
    ].join(", ")});`
  );
}

// 9. Observaciones
for (const o of db.observations || []) {
  const eType = ["DOCUMENT", "TASK", "GENERAL"].includes(o.entityType) ? o.entityType : "GENERAL";
  const oStatus = ["ABIERTA", "RESUELTA"].includes(o.status) ? o.status : "ABIERTA";
  sqlLines.push(
    `INSERT OR IGNORE INTO observations (id, case_id, stage_id, entity_id, entity_type, message, author_id, author_name, created_at, status, response, responded_at) VALUES (${[
      sqlVal(o.id),
      sqlVal(o.caseId),
      sqlVal(o.stageId || ""),
      sqlVal(o.entityId || "general"),
      sqlVal(eType),
      sqlVal(o.message || ""),
      sqlVal(o.authorId || null),
      sqlVal(o.authorName || "Sistema"),
      sqlVal(o.createdAt || nowIso),
      sqlVal(oStatus),
      sqlVal(o.response || null),
      sqlVal(o.respondedAt || null)
    ].join(", ")});`
  );
}

// 10. Notificaciones
for (const n of db.notifications || []) {
  const nType = ["INFO", "SUCCESS", "WARNING", "DANGER"].includes(n.type) ? n.type : "INFO";
  sqlLines.push(
    `INSERT OR IGNORE INTO notifications (id, user_id, title, message, type, read, archived, created_at, case_id) VALUES (${[
      sqlVal(n.id),
      sqlVal(n.userId),
      sqlVal(n.title || "Notificación"),
      sqlVal(n.message || ""),
      sqlVal(nType),
      sqlVal(Boolean(n.read)),
      sqlVal(Boolean(n.archived)),
      sqlVal(n.createdAt || nowIso),
      sqlVal(n.caseId || null)
    ].join(", ")});`
  );
}

// 11. Mensajería interna (extrae adjuntos base64 hacia R2)
for (const m of db.messages || []) {
  const migratedAttachments = [];
  for (let i = 0; i < (m.attachments || []).length; i++) {
    const att = m.attachments[i];
    if (att?.url && String(att.url).startsWith("data:")) {
      const r2Key = `messages/${m.id}/${i}-${sanitizeFileSegment(att.name)}`;
      extractBase64ToR2(att.url, r2Key, att.type || "application/octet-stream");
      migratedAttachments.push({
        name: att.name,
        type: att.type,
        size: att.size,
        r2Key,
        url: `/api/messages/attachments/${m.id}/${i}`
      });
    } else if (att) {
      migratedAttachments.push(att);
    }
  }
  sqlLines.push(
    `INSERT OR IGNORE INTO messages (id, sender_id, sender_name, sender_role, recipient_id, recipient_name, recipient_role, subject, body, attachments_json, created_at, read, sender_trash, recipient_trash, sender_deleted, recipient_deleted, parent_message_id) VALUES (${[
      sqlVal(m.id),
      sqlVal(m.senderId),
      sqlVal(m.senderName || ""),
      sqlVal(m.senderRole || "ASESOR"),
      sqlVal(m.recipientId),
      sqlVal(m.recipientName || ""),
      sqlVal(m.recipientRole || "ASESOR"),
      sqlVal(m.subject || "(Sin asunto)"),
      sqlVal(m.body || ""),
      sqlVal(JSON.stringify(migratedAttachments)),
      sqlVal(m.createdAt || nowIso),
      sqlVal(Boolean(m.read)),
      sqlVal(Boolean(m.senderTrash)),
      sqlVal(Boolean(m.recipientTrash)),
      sqlVal(Boolean(m.senderDeleted)),
      sqlVal(Boolean(m.recipientDeleted)),
      sqlVal(m.parentMessageId || null)
    ].join(", ")});`
  );
}

// 12. Auditorías
for (const log of db.auditLogs || []) {
  sqlLines.push(
    `INSERT OR IGNORE INTO audit_logs (id, user_id, user_name, user_role, action, entity_type, entity_id, description, case_id, created_at) VALUES (${[
      sqlVal(log.id),
      sqlVal(log.userId || "system"),
      sqlVal(log.userName || "Sistema"),
      sqlVal(log.userRole || "ADMIN"),
      sqlVal(log.action || "EVENT"),
      sqlVal(log.entityType || "SYSTEM"),
      sqlVal(log.entityId || "unknown"),
      sqlVal(log.description || ""),
      sqlVal(log.caseId || null),
      sqlVal(log.createdAt || nowIso)
    ].join(", ")});`
  );
}

// 13. Solicitudes de perfil, expedientes y ajustes
for (const pr of db.profileRequests || []) {
  const pStatus = ["PENDIENTE", "APROBADO", "RECHAZADO"].includes(pr.status) ? pr.status : "PENDIENTE";
  sqlLines.push(
    `INSERT OR IGNORE INTO profile_change_requests (id, user_id, user_name, user_role, current_data_json, requested_data_json, status, created_at, resolved_at) VALUES (${[
      sqlVal(pr.id),
      sqlVal(pr.userId),
      sqlVal(pr.userName || ""),
      sqlVal(pr.userRole || "ASESOR"),
      sqlVal(JSON.stringify(pr.currentData || {})),
      sqlVal(JSON.stringify(pr.requestedData || {})),
      sqlVal(pStatus),
      sqlVal(pr.createdAt || nowIso),
      sqlVal(pr.resolvedAt || null)
    ].join(", ")});`
  );
}

for (const cr of db.caseRequests || []) {
  const cStatus = ["PENDIENTE", "CREADO", "RECHAZADO"].includes(cr.status) ? cr.status : "PENDIENTE";
  sqlLines.push(
    `INSERT OR IGNORE INTO case_requests (id, advisor_id, advisor_name, title, description, template_id, status, party_counts_json, created_at) VALUES (${[
      sqlVal(cr.id),
      sqlVal(cr.advisorId),
      sqlVal(cr.advisorName || ""),
      sqlVal(cr.title || "Solicitud"),
      sqlVal(cr.description || ""),
      sqlVal(cr.templateId || ""),
      sqlVal(cStatus),
      sqlVal(JSON.stringify(cr.partyCounts || { compradores: 0, vendedores: 0, garantes: 0 })),
      sqlVal(cr.createdAt || nowIso)
    ].join(", ")});`
  );
}

for (const ar of db.adjustmentRequests || []) {
  const aStatus = ["PENDIENTE", "APROBADO", "RECHAZADO"].includes(ar.status) ? ar.status : "PENDIENTE";
  sqlLines.push(
    `INSERT OR IGNORE INTO adjustment_requests (id, case_id, type, target_party, action, quantity, requirement_id, details, status, requested_by, requested_by_name, created_at, processed_by, processed_by_name, processed_at, rejection_reason) VALUES (${[
      sqlVal(ar.id),
      sqlVal(ar.caseId),
      sqlVal(ar.type === "DOCUMENT_UPLOAD" ? "DOCUMENT_UPLOAD" : "FORM_COUNT"),
      sqlVal(ar.targetParty || null),
      sqlVal(ar.action || null),
      sqlVal(ar.quantity ?? null),
      sqlVal(ar.requirementId || null),
      sqlVal(ar.details || ""),
      sqlVal(aStatus),
      sqlVal(ar.requestedBy || ""),
      sqlVal(ar.requestedByName || ""),
      sqlVal(ar.createdAt || nowIso),
      sqlVal(ar.processedBy || null),
      sqlVal(ar.processedByName || null),
      sqlVal(ar.processedAt || null),
      sqlVal(ar.rejectionReason || null)
    ].join(", ")});`
  );
}

// 14. Solapas personalizadas
for (const tab of db.customTabs || []) {
  sqlLines.push(
    `INSERT OR IGNORE INTO custom_tabs (id, name, icon, created_at) VALUES (${[
      sqlVal(tab.id),
      sqlVal(tab.name || "Solapa"),
      sqlVal(tab.icon || "Layout"),
      sqlVal(tab.createdAt || nowIso)
    ].join(", ")});`
  );
  for (const item of tab.items || []) {
    sqlLines.push(
      `INSERT OR IGNORE INTO custom_tab_items (id, tab_id, title, content, created_at) VALUES (${[
        sqlVal(item.id),
        sqlVal(tab.id),
        sqlVal(item.title || ""),
        sqlVal(item.content || ""),
        sqlVal(item.createdAt || nowIso)
      ].join(", ")});`
    );
  }
}

// 15. Configuraciones saneadas (eliminando llaves heredadas de Resend y Twilio)
if (db.settings) {
  const sanitizedSettings = {
    verificationChannel:
      db.settings.verificationChannel === "CF_SEND_EMAIL" || db.settings.verificationChannel === "DIRECT_APPROVAL"
        ? db.settings.verificationChannel
        : "ADMIN_CODE",
    messageTemplate: db.settings.messageTemplate || "Hola {{name}}, tu código de verificación es: {{token}}",
    commercialFocus: db.settings.commercialFocus || "general",
    allowAdvisorViewProductivity: Boolean(db.settings.allowAdvisorViewProductivity),
    customCategories: db.settings.customCategories || undefined,
    customTexts: db.settings.customTexts || undefined,
    messagingSettings: db.settings.messagingSettings || undefined
  };
  sqlLines.push(
    `INSERT OR IGNORE INTO settings (key, value_json, updated_at) VALUES ('system_settings', ${sqlVal(JSON.stringify(sanitizedSettings))}, ${sqlVal(nowIso)});`
  );
}

const seedSqlPath = path.resolve(ROOT, "migrations/0002_seed_migrated_data.sql");
fs.writeFileSync(seedSqlPath, sqlLines.join("\n") + "\n", "utf8");

fs.writeFileSync(path.join(r2StagingDir, "manifest.json"), JSON.stringify(r2Manifest, null, 2), "utf8");

const uploadScriptLines = [
  "#!/usr/bin/env bash",
  "set -euo pipefail",
  'BUCKET_NAME="${1:-gestor-documentos-files}"',
  'MODE_FLAG="${2:---remote}" # usar --local para pruebas locales o --remote para producción',
  ""
];
for (const entry of r2Manifest) {
  uploadScriptLines.push(
    `npx wrangler r2 object put "$BUCKET_NAME/${entry.r2Key}" --file "${entry.localPath}" --content-type "${entry.contentType}" $MODE_FLAG`
  );
}
const uploadScriptPath = path.join(r2StagingDir, "upload-r2.sh");
fs.writeFileSync(uploadScriptPath, uploadScriptLines.join("\n") + "\n", { mode: 0o755 });

console.log("=========================================================");
console.log("Respaldo y exportación para Cloudflare D1 + R2 completada");
console.log("=========================================================");
console.log(`Archivo origen (sin modificar): ${path.relative(ROOT, inputPath)}`);
console.log(`Respaldo inmutable creado:      ${path.relative(ROOT, backupPath)}`);
console.log(`Migración SQL idempotente:      ${path.relative(ROOT, seedSqlPath)}`);
console.log(`Objetos binarios para R2:       ${r2Manifest.length} (${path.relative(ROOT, r2StagingDir)})`);
if (legacyWeakPasswordCount > 0) {
  console.warn(`ADVERTENCIA DE SEGURIDAD: Se hashearon ${legacyWeakPasswordCount} credenciales heredadas débiles con PBKDF2-SHA256. Cámbielas tras verificar la migración.`);
}
console.log("\nSiguientes pasos recomendados:");
console.log("1. Aplicar esquema inicial en D1: npx wrangler d1 migrations apply gestor-documentos-db --local (o --remote)");
console.log("2. Importar datos migrados en D1: npx wrangler d1 execute gestor-documentos-db --local --file=migrations/0002_seed_migrated_data.sql");
if (r2Manifest.length > 0) {
  console.log("3. Subir objetos extraídos a R2:  bash r2-migration-staging/upload-r2.sh gestor-documentos-files --remote");
}
