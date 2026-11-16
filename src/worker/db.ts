/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AuthUser, Env } from "./types";

export const DEFAULT_MESSAGING_SETTINGS = {
  allowedSenders: ["ADMIN", "MANAGER", "ASESOR"],
  awaitReplyRule: false,
  allowedChannels: [
    { from: "ASESOR", to: "ASESOR", enabled: true },
    { from: "ASESOR", to: "MANAGER", enabled: true },
    { from: "ASESOR", to: "ADMIN", enabled: true },
    { from: "MANAGER", to: "MANAGER", enabled: true },
    { from: "MANAGER", to: "ASESOR", enabled: true },
    { from: "MANAGER", to: "ADMIN", enabled: true },
    { from: "ADMIN", to: "ASESOR", enabled: true },
    { from: "ADMIN", to: "MANAGER", enabled: true },
    { from: "ADMIN", to: "ADMIN", enabled: true },
  ],
};

export const DEFAULT_SETTINGS: Record<string, any> = {
  verificationChannel: "ADMIN_CODE",
  messageTemplate: "Hola {{name}}, tu token de verificación es: {{token}}",
  commercialFocus: "general",
  allowAdvisorViewProductivity: false,
  customTexts: {},
  messagingSettings: DEFAULT_MESSAGING_SETTINGS,
};

export function rowToUser(row: any): AuthUser & { passwordHash?: string } {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    avatarUrl: row.avatar_url || "",
    phone: row.phone || "",
    address: row.address || "",
    status: row.status,
    canCreateCases: Boolean(row.can_create_cases),
    createdAt: row.created_at,
    passwordHash: row.password_hash,
  };
}

export function sanitizeUser(rowOrUser: any, includeContactDetails = true): AuthUser {
  const u = rowOrUser.password_hash !== undefined ? rowToUser(rowOrUser) : rowOrUser;
  const safe: AuthUser = {
    id: u.id,
    email: includeContactDetails ? u.email : "",
    name: u.name,
    role: u.role,
    avatarUrl: u.avatarUrl || "",
    phone: includeContactDetails ? u.phone || "" : "",
    address: includeContactDetails ? u.address || "" : "",
    status: u.status,
    canCreateCases: Boolean(u.canCreateCases),
    createdAt: u.createdAt,
  };
  return safe;
}

export async function getSystemSettings(db: D1Database, kv?: KVNamespace): Promise<Record<string, any>> {
  if (kv) {
    const cached = await kv.get("cache:system_settings");
    if (cached) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(cached) };
      } catch {
        // ignore invalid cache
      }
    }
  }
  const row = await db
    .prepare("SELECT value_json FROM settings WHERE key = ?")
    .bind("global")
    .first<{ value_json: string }>();

  let parsed = {};
  if (row?.value_json) {
    try {
      parsed = JSON.parse(row.value_json);
    } catch {
      parsed = {};
    }
  }
  const merged = {
    ...DEFAULT_SETTINGS,
    ...parsed,
    messagingSettings: {
      ...DEFAULT_MESSAGING_SETTINGS,
      ...((parsed as any).messagingSettings || {}),
    },
  };
  if (kv) {
    await kv.put("cache:system_settings", JSON.stringify(merged), { expirationTtl: 300 });
  }
  return merged;
}

export async function saveSystemSettings(
  db: D1Database,
  settings: Record<string, any>,
  kv?: KVNamespace
): Promise<Record<string, any>> {
  const now = new Date().toISOString();
  // Strip any legacy external provider keys if posted by older client state
  const cleaned = { ...settings };
  delete cleaned.resendApiKey;
  delete cleaned.resendFromEmail;
  delete cleaned.twilioSid;
  delete cleaned.twilioAuthToken;
  delete cleaned.twilioFromNumber;

  await db
    .prepare(
      `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
    )
    .bind("global", JSON.stringify(cleaned), now)
    .run();

  if (kv) {
    await kv.delete("cache:system_settings");
    await kv.delete("cache:public_settings");
  }
  return cleaned;
}

export async function createNotification(
  db: D1Database,
  userId: string,
  title: string,
  message: string,
  type: "INFO" | "SUCCESS" | "WARNING" | "DANGER",
  caseId?: string | null
): Promise<void> {
  if (!userId || userId === "unassigned") return;
  const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  await db
    .prepare(
      `INSERT INTO notifications (id, user_id, title, message, type, read, archived, created_at, case_id)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`
    )
    .bind(id, userId, title, message, type, new Date().toISOString(), caseId || null)
    .run();
}

export async function logAudit(
  env: Env,
  user: { id: string; name?: string; role?: string } | string,
  action: string,
  entityType: string,
  entityId: string,
  description: string,
  explicitCaseId?: string
): Promise<void> {
  let userId = typeof user === "string" ? user : user.id;
  let userName = typeof user === "string" ? "Sistema" : user.name || "Sistema";
  let userRole = typeof user === "string" ? "ADMIN" : user.role || "ADMIN";

  if (typeof user === "string") {
    const u = await env.DB.prepare("SELECT name, role FROM users WHERE id = ?")
      .bind(user)
      .first<{ name: string; role: string }>();
    if (u) {
      userName = u.name;
      userRole = u.role;
    }
  }

  let caseId = explicitCaseId || null;
  if (!caseId) {
    if (entityType === "CASE") {
      caseId = entityId;
    } else if (entityType === "TASK") {
      const t = await env.DB.prepare("SELECT case_id FROM tasks WHERE id = ?")
        .bind(entityId)
        .first<{ case_id: string }>();
      caseId = t?.case_id || null;
    } else if (entityType === "DOCUMENT") {
      const d = await env.DB.prepare("SELECT case_id FROM documents WHERE id = ?")
        .bind(entityId)
        .first<{ case_id: string }>();
      caseId = d?.case_id || null;
    } else if (entityType === "OBSERVATION") {
      const o = await env.DB.prepare("SELECT case_id FROM observations WHERE id = ?")
        .bind(entityId)
        .first<{ case_id: string }>();
      caseId = o?.case_id || null;
    } else if (entityType === "PARTICIPANT") {
      const p = await env.DB.prepare("SELECT case_id FROM participants WHERE id = ?")
        .bind(entityId)
        .first<{ case_id: string }>();
      caseId = p?.case_id || null;
    }
  }

  const auditId = `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  await env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, user_name, user_role, action, entity_type, entity_id, description, case_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      auditId,
      userId,
      userName,
      userRole,
      action,
      entityType,
      entityId,
      description,
      caseId,
      new Date().toISOString()
    )
    .run();
}

export function syncTaskFormInstances(partyCountsRaw: any, task: any): void {
  if (!task.formInstances) {
    task.formInstances = [];
  }
  const counts = partyCountsRaw || { compradores: 0, vendedores: 0, garantes: 0 };
  const totalCounts =
    (counts.compradores || 0) + (counts.vendedores || 0) + (counts.garantes || 0);

  const targetInstances: { role: string; index: number }[] = [];
  if (totalCounts === 0) {
    targetInstances.push({ role: "General", index: 1 });
  } else {
    for (let i = 1; i <= (counts.compradores || 0); i++) {
      targetInstances.push({ role: "Comprador", index: i });
    }
    for (let i = 1; i <= (counts.vendedores || 0); i++) {
      targetInstances.push({ role: "Vendedor", index: i });
    }
    for (let i = 1; i <= (counts.garantes || 0); i++) {
      targetInstances.push({ role: "Garante", index: i });
    }
  }

  const newInstances: any[] = [];
  targetInstances.forEach((target) => {
    const existing = task.formInstances.find(
      (inst: any) => inst.role === target.role && inst.index === target.index
    );
    if (existing) {
      newInstances.push(existing);
    } else {
      newInstances.push({
        id: `inst-${target.role}-${target.index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: target.role,
        index: target.index,
        status: "PENDIENTE",
        formValues: {},
      });
    }
  });

  task.formInstances = newInstances;
  const allComplete = task.formInstances.every((inst: any) => inst.status === "COMPLETA");
  task.status = allComplete ? "COMPLETA" : "PENDIENTE";
}

export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function mapCaseRow(row: any, adjustmentRequests: any[] = []) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description || "",
    templateId: row.template_id,
    status: row.status,
    currentStageId: row.current_stage_id,
    advisorId: row.advisor_id,
    managerId: row.manager_id || "unassigned",
    stages: safeJsonParse<any[]>(row.stages_json, []),
    stagesDetermined: Boolean(row.stages_determined),
    reviewStatus: row.review_status || null,
    reviewButtonBlocked: Boolean(row.review_button_blocked),
    reviewButtonBlockedReason: row.review_button_blocked_reason || undefined,
    partyCounts: safeJsonParse(row.party_counts_json, { compradores: 0, vendedores: 0, garantes: 0 }),
    requirementStates: safeJsonParse(row.requirement_states_json, {}),
    adjustmentRequests,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function checkAndAssignManager(
  env: Env,
  caseId: string,
  user: AuthUser
): Promise<{ allowed: boolean; message?: string }> {
  const caseRow = await env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(caseId).first<any>();
  if (!caseRow) {
    return { allowed: false, message: "Expediente no encontrado." };
  }

  if (user.role === "ADMIN") {
    return { allowed: true };
  }

  if (user.role === "ASESOR") {
    if (caseRow.advisor_id !== user.id) {
      return { allowed: false, message: "No tienes acceso a este expediente." };
    }
    return { allowed: true };
  }

  if (user.role === "MANAGER") {
    if (!caseRow.manager_id || caseRow.manager_id === "unassigned" || caseRow.manager_id === "") {
      const now = new Date().toISOString();
      await env.DB.prepare("UPDATE cases SET manager_id = ?, updated_at = ? WHERE id = ?")
        .bind(user.id, now, caseId)
        .run();
      await logAudit(
        env,
        user,
        "CASE_ASSIGNED",
        "CASE",
        caseId,
        `El manager ${user.name} se auto-asignó al responder el expediente ${caseRow.code}`,
        caseId
      );
      await createNotification(
        env.DB,
        caseRow.advisor_id,
        "Manager Asignado",
        `El manager ${user.name} ha tomado tu expediente ${caseRow.code}.`,
        "INFO",
        caseId
      );
      return { allowed: true };
    }

    if (caseRow.manager_id !== user.id) {
      const assigned = await env.DB.prepare("SELECT name FROM users WHERE id = ?")
        .bind(caseRow.manager_id)
        .first<{ name: string }>();
      return {
        allowed: false,
        message: `Este expediente está asignado al manager ${assigned ? assigned.name : "otro manager"} y no puedes intervenir.`,
      };
    }
  }

  return { allowed: true };
}

export async function getHydratedCase(db: D1Database, caseId: string): Promise<any | null> {
  const caseRow = await db.prepare("SELECT * FROM cases WHERE id = ?").bind(caseId).first<any>();
  if (!caseRow) return null;

  const tplRow = caseRow.template_id
    ? await db.prepare("SELECT * FROM templates WHERE id = ?").bind(caseRow.template_id).first<any>()
    : null;

  const template = tplRow
    ? {
        id: tplRow.id,
        name: tplRow.name,
        category: tplRow.category,
        description: tplRow.description || "",
        createdBy: tplRow.created_by,
        isPublic: Boolean(tplRow.is_public),
        stages: safeJsonParse<any[]>(tplRow.stages_json, []),
      }
    : null;

  const caseStages = safeJsonParse<any[]>(caseRow.stages_json, []);
  const stages = caseStages.length > 0 ? caseStages : template ? template.stages : [];
  const currentStage = stages.find((s: any) => s.id === caseRow.current_stage_id) || stages[0] || null;

  const [participantsRes, documentsRes, versionsRes, tasksRes, observationsRes, adjRes] =
    await Promise.all([
      db.prepare("SELECT * FROM participants WHERE case_id = ?").bind(caseId).all<any>(),
      db.prepare("SELECT * FROM documents WHERE case_id = ?").bind(caseId).all<any>(),
      db
        .prepare(
          `SELECT dv.* FROM document_versions dv
           INNER JOIN documents d ON d.id = dv.document_id
           WHERE d.case_id = ? ORDER BY dv.version ASC`
        )
        .bind(caseId)
        .all<any>(),
      db.prepare("SELECT * FROM tasks WHERE case_id = ?").bind(caseId).all<any>(),
      db.prepare("SELECT * FROM observations WHERE case_id = ? ORDER BY created_at DESC").bind(caseId).all<any>(),
      db.prepare("SELECT * FROM adjustment_requests WHERE case_id = ? ORDER BY created_at ASC").bind(caseId).all<any>(),
    ]);

  const versionsByDoc = new Map<string, any[]>();
  for (const v of versionsRes.results || []) {
    const arr = versionsByDoc.get(v.document_id) || [];
    arr.push({
      version: v.version,
      fileName: v.file_name,
      r2Key: v.r2_key,
      fileUrl: v.file_url,
      uploadedAt: v.uploaded_at,
      uploadedBy: v.uploaded_by,
    });
    versionsByDoc.set(v.document_id, arr);
  }

  const docs = (documentsRes.results || []).map((d) => ({
    id: d.id,
    caseId: d.case_id,
    requirementId: d.requirement_id,
    name: d.name,
    status: d.status,
    r2Key: d.r2_key,
    fileUrl: d.file_url,
    fileName: d.file_name,
    fileType: d.file_type,
    fileSize: d.file_size,
    uploadedAt: d.uploaded_at,
    uploadedBy: d.uploaded_by,
    version: d.version,
    aiAnalysis: safeJsonParse(d.ai_analysis_json, null),
    history: versionsByDoc.get(d.id) || [],
  }));

  const tasks = (tasksRes.results || []).map((t) => ({
    id: t.id,
    caseId: t.case_id,
    requirementId: t.requirement_id,
    name: t.name,
    description: t.description || "",
    status: t.status,
    completedAt: t.completed_at,
    completedBy: t.completed_by,
    formValues: safeJsonParse(t.form_values_json, {}),
    formInstances: safeJsonParse(t.form_instances_json, []),
  }));

  const partyCounts = safeJsonParse(caseRow.party_counts_json, {
    compradores: 0,
    vendedores: 0,
    garantes: 0,
  });
  const requirementStates = safeJsonParse<Record<string, any>>(caseRow.requirement_states_json, {});

  const requirementsHydrated: any[] = [];
  if (currentStage && currentStage.requirements) {
    for (const req of currentStage.requirements) {
      const existingDoc = docs.find((d) => d.requirementId === req.id) || null;
      let existingTask = tasks.find((t) => t.requirementId === req.id) || null;

      if (!existingTask && req.type === "TASK") {
        const newTaskId = `tsk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        existingTask = {
          id: newTaskId,
          caseId,
          requirementId: req.id,
          name: req.name,
          description: req.description || "",
          status: "PENDIENTE",
          completedAt: null,
          completedBy: null,
          formValues: {},
          formInstances: [],
        };
        await db
          .prepare(
            `INSERT INTO tasks (id, case_id, requirement_id, name, description, status, form_values_json, form_instances_json)
             VALUES (?, ?, ?, ?, ?, 'PENDIENTE', '{}', '[]')`
          )
          .bind(newTaskId, caseId, req.id, req.name, req.description || "")
          .run();
      } else if (!existingTask && req.type === "FORM") {
        const newTaskId = `tsk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        existingTask = {
          id: newTaskId,
          caseId,
          requirementId: req.id,
          name: req.name,
          description: req.description || "",
          status: "PENDIENTE",
          completedAt: null,
          completedBy: null,
          formValues: {},
          formInstances: [],
        };
        syncTaskFormInstances(partyCounts, existingTask);
        await db
          .prepare(
            `INSERT INTO tasks (id, case_id, requirement_id, name, description, status, form_values_json, form_instances_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            newTaskId,
            caseId,
            req.id,
            req.name,
            req.description || "",
            existingTask.status,
            JSON.stringify(existingTask.formValues),
            JSON.stringify(existingTask.formInstances)
          )
          .run();
      }

      const caseStates = requirementStates[req.id] || {};
      requirementsHydrated.push({
        ...req,
        document: existingDoc,
        task: existingTask,
        downloadEnabled: typeof caseStates.downloadEnabled === "boolean" ? caseStates.downloadEnabled : false,
        uploadEnabled: typeof caseStates.uploadEnabled === "boolean" ? caseStates.uploadEnabled : false,
        uploadRequestStatus: caseStates.uploadRequestStatus || null,
        uploadRequestReason: caseStates.uploadRequestReason || null,
        uploadConfig: caseStates.uploadConfig || null,
      });
    }
  }

  const adjRequests = (adjRes.results || []).map((r) => ({
    id: r.id,
    caseId: r.case_id,
    type: r.type,
    targetParty: r.target_party || undefined,
    action: r.action || undefined,
    quantity: r.quantity ?? undefined,
    requirementId: r.requirement_id || undefined,
    details: r.details,
    status: r.status,
    requestedBy: r.requested_by,
    requestedByName: r.requested_by_name,
    createdAt: r.created_at,
    processedBy: r.processed_by || undefined,
    processedByName: r.processed_by_name || undefined,
    processedAt: r.processed_at || undefined,
    rejectionReason: r.rejection_reason || undefined,
  }));

  const participants = (participantsRes.results || []).map((p) => ({
    id: p.id,
    caseId: p.case_id,
    role: p.role,
    name: p.name,
    apellido: p.apellido || "",
    dni: p.dni || "",
    cuitCuil: p.cuit_cuil || "",
    email: p.email || "",
    telefono: p.telefono || "",
    observaciones: p.observaciones || "",
  }));

  const observations = (observationsRes.results || []).map((o) => ({
    id: o.id,
    caseId: o.case_id,
    stageId: o.stage_id || "",
    entityId: o.entity_id || "general",
    entityType: o.entity_type,
    message: o.message,
    authorId: o.author_id,
    authorName: o.author_name,
    createdAt: o.created_at,
    status: o.status,
    response: o.response || undefined,
    respondedAt: o.responded_at || undefined,
  }));

  return {
    ...mapCaseRow(caseRow, adjRequests),
    template,
    stages,
    currentStage,
    participants,
    requirements: requirementsHydrated,
    observations,
  };
}
