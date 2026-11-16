/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Hono } from "hono";
import { requireAdmin, requireAuth, requireManagerOrAdmin } from "./auth";
import { analyzeDocumentWithAI, assistFormWithAI, decodeBase64ToBytes } from "../ai";
import {
  checkAndAssignManager,
  createNotification,
  getHydratedCase,
  logAudit,
  mapCaseRow,
  safeJsonParse,
  sanitizeUser,
  syncTaskFormInstances,
} from "../db";
import type { AuthUser, Env, HonoVariables } from "../types";

export const caseRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

function canReadCase(user: AuthUser, caseRow: any): boolean {
  if (user.role === "ADMIN") return true;
  if (user.role === "MANAGER") return true; // Managers see cases overview + unassigned cases to claim
  return caseRow.advisor_id === user.id;
}

async function provisionStageTasks(
  db: D1Database,
  caseId: string,
  stage: any,
  partyCounts: any
): Promise<void> {
  for (const req of stage?.requirements || []) {
    const existing = await db
      .prepare("SELECT id FROM tasks WHERE case_id = ? AND requirement_id = ?")
      .bind(caseId, req.id)
      .first();
    if (existing) continue;

    if (req.type === "TASK") {
      await db
        .prepare(
          `INSERT INTO tasks (id, case_id, requirement_id, name, description, status, form_values_json, form_instances_json)
           VALUES (?, ?, ?, ?, ?, 'PENDIENTE', '{}', '[]')`
        )
        .bind(
          `tsk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          caseId,
          req.id,
          req.name,
          req.description || ""
        )
        .run();
    } else if (req.type === "FORM") {
      const formTask: any = { formInstances: [], formValues: {}, status: "PENDIENTE" };
      syncTaskFormInstances(partyCounts, formTask);
      await db
        .prepare(
          `INSERT INTO tasks (id, case_id, requirement_id, name, description, status, form_values_json, form_instances_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          `tsk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          caseId,
          req.id,
          req.name,
          req.description || "",
          formTask.status,
          JSON.stringify(formTask.formValues),
          JSON.stringify(formTask.formInstances)
        )
        .run();
    }
  }
}

// Case Requests (Solicitudes de Apertura de Expediente)
caseRoutes.post("/case-requests", requireAuth, async (c) => {
  const requester = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  const description = String(body.description || "");
  const templateId = String(body.templateId || "").trim();
  const partyCounts = body.partyCounts || { compradores: 0, vendedores: 0, garantes: 0 };

  if (!title || !templateId) {
    return c.json({ success: false, message: "Título y plantilla son requeridos." }, 400);
  }

  const reqId = `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO case_requests (id, advisor_id, advisor_name, title, description, template_id, status, party_counts_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, ?)`
  )
    .bind(reqId, requester.id, requester.name, title, description, templateId, JSON.stringify(partyCounts), now)
    .run();

  const staff = await c.env.DB.prepare("SELECT id FROM users WHERE role IN ('MANAGER', 'ADMIN')").all<{
    id: string;
  }>();
  for (const m of staff.results || []) {
    await createNotification(
      c.env.DB,
      m.id,
      "Nueva Solicitud de Expediente",
      `El asesor ${requester.name} ha solicitado la apertura de un nuevo expediente: "${title}".`,
      "INFO"
    );
  }

  await logAudit(
    c.env,
    requester,
    "CASE_REQUESTED",
    "CASE_REQUEST",
    reqId,
    `El asesor ${requester.name} solicitó abrir expediente: "${title}"`
  );

  return c.json({
    success: true,
    message: "Solicitud enviada con éxito.",
    request: {
      id: reqId,
      advisorId: requester.id,
      advisorName: requester.name,
      title,
      description,
      templateId,
      status: "PENDIENTE",
      partyCounts,
      createdAt: now,
    },
  });
});

caseRoutes.get("/case-requests", requireAuth, async (c) => {
  const requester = c.get("user");
  const isStaff = requester.role === "ADMIN" || requester.role === "MANAGER";
  const res = isStaff
    ? await c.env.DB.prepare("SELECT * FROM case_requests ORDER BY created_at DESC").all<any>()
    : await c.env.DB.prepare("SELECT * FROM case_requests WHERE advisor_id = ? ORDER BY created_at DESC")
        .bind(requester.id)
        .all<any>();

  return c.json(
    (res.results || []).map((r) => ({
      id: r.id,
      advisorId: r.advisor_id,
      advisorName: r.advisor_name,
      title: r.title,
      description: r.description || "",
      templateId: r.template_id,
      status: r.status,
      partyCounts: safeJsonParse(r.party_counts_json, { compradores: 0, vendedores: 0, garantes: 0 }),
      createdAt: r.created_at,
    }))
  );
});

caseRoutes.post("/case-requests/:id/resolve", requireAuth, requireManagerOrAdmin, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const body = await c.req.json().catch(() => ({}));
  const status = body.status;

  if (status !== "CREADO" && status !== "RECHAZADO") {
    return c.json({ success: false, message: "Estado de resolución inválido." }, 400);
  }

  const reqRow = await c.env.DB.prepare("SELECT * FROM case_requests WHERE id = ?").bind(id).first<any>();
  if (!reqRow) {
    return c.json({ success: false, message: "Solicitud no encontrada." }, 404);
  }

  await c.env.DB.prepare("UPDATE case_requests SET status = ? WHERE id = ?").bind(status, id).run();

  await createNotification(
    c.env.DB,
    reqRow.advisor_id,
    status === "CREADO" ? "Solicitud de Expediente Aprobada" : "Solicitud de Expediente Rechazada",
    status === "CREADO"
      ? `Tu solicitud para el expediente "${reqRow.title}" fue aprobada y creada.`
      : `Tu solicitud para el expediente "${reqRow.title}" fue rechazada por ${requester.name}.`,
    status === "CREADO" ? "SUCCESS" : "DANGER"
  );

  await logAudit(
    c.env,
    requester,
    "CASE_REQUEST_RESOLVED",
    "CASE_REQUEST",
    id,
    `El ${requester.role} ${requester.name} resolvió la solicitud de expediente "${reqRow.title}" como ${status}.`
  );

  return c.json({
    success: true,
    message: "Solicitud resuelta con éxito.",
    request: {
      id: reqRow.id,
      advisorId: reqRow.advisor_id,
      advisorName: reqRow.advisor_name,
      title: reqRow.title,
      description: reqRow.description || "",
      templateId: reqRow.template_id,
      status,
      partyCounts: safeJsonParse(reqRow.party_counts_json, { compradores: 0, vendedores: 0, garantes: 0 }),
      createdAt: reqRow.created_at,
    },
  });
});

caseRoutes.delete("/case-requests/:id", requireAuth, requireAdmin, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const reqRow = await c.env.DB.prepare("SELECT * FROM case_requests WHERE id = ?").bind(id).first<any>();
  if (!reqRow) {
    return c.json({ success: false, message: "Solicitud no encontrada." }, 404);
  }

  await c.env.DB.prepare("DELETE FROM case_requests WHERE id = ?").bind(id).run();
  await logAudit(
    c.env,
    requester,
    "CASE_REQUEST_DELETED",
    "CASE_REQUEST",
    id,
    `El Admin ${requester.name} eliminó permanentemente el registro de solicitud "${reqRow.title}".`
  );
  return c.json({ success: true, message: "Registro de solicitud eliminado permanentemente." });
});

// List cases (authenticated; ASESOR scoped strictly to own cases)
caseRoutes.get("/cases", requireAuth, async (c) => {
  const user = c.get("user");

  const [casesRes, templatesRes, usersRes, docsRes, tasksRes, obsRes, adjRes] = await Promise.all([
    user.role === "ASESOR"
      ? c.env.DB.prepare("SELECT * FROM cases WHERE advisor_id = ? ORDER BY created_at DESC")
          .bind(user.id)
          .all<any>()
      : c.env.DB.prepare("SELECT * FROM cases ORDER BY created_at DESC").all<any>(),
    c.env.DB.prepare("SELECT * FROM templates").all<any>(),
    c.env.DB.prepare("SELECT * FROM users").all<any>(),
    c.env.DB.prepare("SELECT id, case_id, requirement_id, status FROM documents").all<any>(),
    c.env.DB.prepare("SELECT id, case_id, requirement_id, status FROM tasks").all<any>(),
    c.env.DB.prepare("SELECT id, case_id, status FROM observations").all<any>(),
    c.env.DB.prepare("SELECT * FROM adjustment_requests ORDER BY created_at ASC").all<any>(),
  ]);

  const templateMap = new Map<string, any>();
  for (const t of templatesRes.results || []) {
    templateMap.set(t.id, {
      id: t.id,
      name: t.name,
      stages: safeJsonParse<any[]>(t.stages_json, []),
    });
  }

  const userMap = new Map<string, any>();
  for (const u of usersRes.results || []) {
    userMap.set(u.id, sanitizeUser(u, user.role !== "ASESOR" || u.id === user.id));
  }

  const docsByCase = new Map<string, any[]>();
  for (const d of docsRes.results || []) {
    const arr = docsByCase.get(d.case_id) || [];
    arr.push(d);
    docsByCase.set(d.case_id, arr);
  }
  const tasksByCase = new Map<string, any[]>();
  for (const t of tasksRes.results || []) {
    const arr = tasksByCase.get(t.case_id) || [];
    arr.push(t);
    tasksByCase.set(t.case_id, arr);
  }
  const obsByCase = new Map<string, any[]>();
  for (const o of obsRes.results || []) {
    const arr = obsByCase.get(o.case_id) || [];
    arr.push(o);
    obsByCase.set(o.case_id, arr);
  }
  const adjByCase = new Map<string, any[]>();
  for (const r of adjRes.results || []) {
    const arr = adjByCase.get(r.case_id) || [];
    arr.push({
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
    });
    adjByCase.set(r.case_id, arr);
  }

  const hydratedList = (casesRes.results || []).map((row) => {
    const tpl = row.template_id ? templateMap.get(row.template_id) : null;
    const rawStages = safeJsonParse<any[]>(row.stages_json, []);
    const stages = rawStages.length > 0 ? rawStages : tpl ? tpl.stages : [];
    const stagesOrdered = stages.slice().sort((a: any, b: any) => a.order - b.order);
    const currentStageId = row.current_stage_id || stagesOrdered[0]?.id || "";
    const currentIdx = stagesOrdered.findIndex((s: any) => s.id === currentStageId);
    const currentStage = stagesOrdered.find((s: any) => s.id === currentStageId) || null;

    const caseDocs = docsByCase.get(row.id) || [];
    const caseTasks = tasksByCase.get(row.id) || [];
    const caseObs = obsByCase.get(row.id) || [];

    const openObsCount = caseObs.filter((o) => o.status === "ABIERTA").length;
    let pendingReqCount = 0;
    if (currentStage?.requirements) {
      pendingReqCount = currentStage.requirements.filter((r: any) => {
        if (!r.required) return false;
        if (r.type === "DOCUMENT") {
          const d = caseDocs.find((doc) => doc.requirement_id === r.id);
          return !d || d.status !== "APROBADO";
        }
        if (r.type === "TASK" || r.type === "FORM") {
          const t = caseTasks.find((tsk) => tsk.requirement_id === r.id);
          return !t || t.status !== "COMPLETA";
        }
        return false;
      }).length;
    }

    return {
      ...mapCaseRow(row, adjByCase.get(row.id) || []),
      templateName: tpl ? tpl.name : "N/A",
      progress: {
        total: row.stages_determined ? stagesOrdered.length : 0,
        currentIdx: currentIdx + 1,
        currentName: currentStage?.name || "",
      },
      advisor: row.advisor_id ? userMap.get(row.advisor_id) || null : null,
      manager: row.manager_id && row.manager_id !== "unassigned" ? userMap.get(row.manager_id) || null : null,
      openObservationsCount: openObsCount,
      pendingRequirementsCount: pendingReqCount,
    };
  });

  return c.json(hydratedList);
});

// Get Single Case
caseRoutes.get("/cases/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id") || "";
  const row = await c.env.DB.prepare("SELECT advisor_id FROM cases WHERE id = ?").bind(id).first<any>();
  if (!row) {
    return c.json({ message: "Expediente no encontrado" }, 404);
  }
  if (!canReadCase(user, row)) {
    return c.json({ message: "No tienes acceso a este expediente." }, 403);
  }

  const hydrated = await getHydratedCase(c.env.DB, id);
  if (!hydrated) {
    return c.json({ message: "Expediente no encontrado" }, 404);
  }
  return c.json(hydrated);
});

// Timeline & Audit History
caseRoutes.get("/cases/:id/timeline-history", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id") || "";
  const caseRow = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
  if (!caseRow) {
    return c.json({ message: "Expediente no encontrado." }, 404);
  }
  if (!canReadCase(user, caseRow)) {
    return c.json({ message: "No tienes acceso a este expediente." }, 403);
  }

  const tpl = caseRow.template_id
    ? await c.env.DB.prepare("SELECT stages_json FROM templates WHERE id = ?")
        .bind(caseRow.template_id)
        .first<{ stages_json: string }>()
    : null;
  const caseStages = safeJsonParse<any[]>(caseRow.stages_json, []);
  const stages = (caseStages.length > 0 ? caseStages : safeJsonParse<any[]>(tpl?.stages_json, []))
    .slice()
    .sort((a: any, b: any) => a.order - b.order);

  const [caseLogsRes, advisorLoginsRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM audit_logs
       WHERE case_id = ? OR entity_id = ?
       ORDER BY created_at DESC`
    )
      .bind(id, id)
      .all<any>(),
    caseRow.advisor_id
      ? c.env.DB.prepare(
          "SELECT * FROM audit_logs WHERE user_id = ? AND action = 'LOGIN' ORDER BY created_at DESC LIMIT 50"
        )
          .bind(caseRow.advisor_id)
          .all<any>()
      : Promise.resolve({ results: [] }),
  ]);

  const mapLog = (l: any) => ({
    id: l.id,
    userId: l.user_id,
    userName: l.user_name,
    userRole: l.user_role,
    action: l.action,
    entityType: l.entity_type,
    entityId: l.entity_id,
    description: l.description,
    caseId: l.case_id || undefined,
    createdAt: l.created_at,
  });

  const caseLogs = (caseLogsRes.results || []).map(mapLog);
  const advisorLogins = (advisorLoginsRes.results || []).map(mapLog);

  function formatDurationSpan(ms: number): string {
    const safeMs = Math.max(0, ms);
    const seconds = Math.floor(safeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) {
      const remHours = hours % 24;
      return `${days} ${days === 1 ? "día" : "días"}${remHours > 0 ? `, ${remHours} ${remHours === 1 ? "hora" : "horas"}` : ""}`;
    }
    if (hours > 0) {
      const remMinutes = minutes % 60;
      return `${hours} ${hours === 1 ? "hora" : "horas"}${remMinutes > 0 ? `, ${remMinutes} ${remMinutes === 1 ? "minuto" : "minutos"}` : ""}`;
    }
    if (minutes > 0) {
      return `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
    }
    return "Menos de un minuto";
  }

  const stageHistory: any[] = [];
  if (stages.length > 0) {
    const transitionLogs = caseLogs
      .filter((l) => l.action === "STAGE_CHANGED" || l.action === "STAGE_RETROCEDED" || l.action === "STAGE_CHANGED_AUTOMATIC")
      .slice()
      .reverse();

    let lastTime = new Date(caseRow.created_at).getTime();
    if (Number.isNaN(lastTime)) lastTime = Date.now();
    let lastStageName = stages[0]?.name || "Etapa Inicial";

    for (const tLog of transitionLogs) {
      const tTime = new Date(tLog.createdAt).getTime();
      const diffMs = tTime - lastTime;
      stageHistory.push({
        stageName: lastStageName,
        enteredAt: new Date(lastTime).toISOString(),
        exitedAt: new Date(tTime).toISOString(),
        durationMs: diffMs,
        durationText: formatDurationSpan(diffMs),
      });
      const match = tLog.description.match(/(?:a|etapa) '([^']+)'/);
      lastStageName = match && match[1] ? match[1] : "Siguiente Etapa";
      lastTime = tTime;
    }

    const isFinished = caseRow.status === "FINALIZADO";
    const nowTime = isFinished ? new Date(caseRow.updated_at || Date.now()).getTime() : Date.now();
    const activeDiffMs = nowTime - lastTime;
    stageHistory.push({
      stageName: lastStageName,
      enteredAt: new Date(lastTime).toISOString(),
      exitedAt: isFinished ? new Date(nowTime).toISOString() : null,
      durationMs: activeDiffMs,
      durationText: formatDurationSpan(activeDiffMs),
    });
  }

  return c.json({
    caseId: id,
    code: caseRow.code,
    title: caseRow.title,
    advisorId: caseRow.advisor_id,
    status: caseRow.status,
    createdAt: caseRow.created_at,
    stageHistory,
    advisorLogins,
    allLogs: caseLogs,
  });
});

// Create Case
caseRoutes.post("/cases", requireAuth, async (c) => {
  const requester = c.get("user");
  if (requester.role === "ASESOR" && !requester.canCreateCases) {
    return c.json(
      { message: "No tiene permisos habilitados para abrir expedientes directamente. Envíe una solicitud." },
      403
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const { title, description, templateId, advisorId, managerId, participants, stagesDetermined, partyCounts } = body;

  const tpl = await c.env.DB.prepare("SELECT * FROM templates WHERE id = ?").bind(templateId).first<any>();
  const stages = safeJsonParse<any[]>(tpl?.stages_json, []);
  if (!tpl || stages.length === 0) {
    return c.json({ message: "La plantilla seleccionada no es válida o no contiene etapas." }, 400);
  }

  const countRow = await c.env.DB.prepare("SELECT COUNT(*) as total FROM cases").first<{ total: number }>();
  const codeNum = Number(countRow?.total || 0) + 1;
  const caseCode = `EXP-${new Date().getFullYear()}-${String(codeNum).padStart(3, "0")}-${Math.floor(Math.random() * 90 + 10)}`;
  const orderedStages = stages.slice().sort((a: any, b: any) => a.order - b.order);
  const firstStage = orderedStages[0];

  const caseId = `case-${Date.now()}`;
  const now = new Date().toISOString();
  const effectiveAdvisorId =
    requester.role === "ASESOR" ? requester.id : advisorId || requester.id;
  const effectiveManagerId = managerId || (requester.role === "MANAGER" ? requester.id : "unassigned");
  const normalizedCounts = partyCounts || { compradores: 0, vendedores: 0, garantes: 0 };

  await c.env.DB.prepare(
    `INSERT INTO cases (
      id, code, title, description, template_id, status, current_stage_id,
      advisor_id, manager_id, stages_json, stages_determined, review_button_blocked,
      party_counts_json, requirement_states_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'PENDIENTE', ?, ?, ?, ?, ?, 0, ?, '{}', ?, ?)`
  )
    .bind(
      caseId,
      caseCode,
      String(title || "Expediente"),
      String(description || ""),
      templateId,
      firstStage.id,
      effectiveAdvisorId,
      effectiveManagerId,
      JSON.stringify(orderedStages),
      stagesDetermined !== undefined ? (stagesDetermined ? 1 : 0) : 1,
      JSON.stringify(normalizedCounts),
      now,
      now
    )
    .run();

  if (Array.isArray(participants)) {
    for (const p of participants) {
      await c.env.DB.prepare(
        `INSERT INTO participants (id, case_id, role, name, apellido, dni, cuit_cuil, email, telefono, observaciones)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          `part-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          caseId,
          p.role || "Participante",
          p.name || "",
          p.apellido || "",
          p.dni || "",
          p.cuitCuil || "",
          p.email || "",
          p.telefono || "",
          p.observaciones || ""
        )
        .run();
    }
  }

  await provisionStageTasks(c.env.DB, caseId, firstStage, normalizedCounts);

  await createNotification(
    c.env.DB,
    effectiveAdvisorId,
    "Nuevo expediente iniciado",
    `Has iniciado el expediente ${caseCode}: ${title}. Queda a la espera de asignación de un manager.`,
    "INFO",
    caseId
  );

  const managers = await c.env.DB.prepare("SELECT id FROM users WHERE role = 'MANAGER'").all<{ id: string }>();
  for (const m of managers.results || []) {
    await createNotification(
      c.env.DB,
      m.id,
      "Expediente en espera",
      `Se ha iniciado el expediente ${caseCode}: ${title}. Está a la espera de un manager asignado.`,
      "WARNING",
      caseId
    );
  }

  await logAudit(
    c.env,
    requester,
    "CASE_CREATED",
    "CASE",
    caseId,
    `Expediente creado en espera: ${caseCode} - ${title}`,
    caseId
  );

  const created = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(caseId).first<any>();
  return c.json(mapCaseRow(created));
});

// Delete Case (Admin or Manager with access)
caseRoutes.delete("/cases/:id", requireAuth, requireManagerOrAdmin, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const caseRow = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
  if (!caseRow) {
    return c.json({ message: "Expediente no encontrado" }, 404);
  }
  if (
    requester.role === "MANAGER" &&
    caseRow.manager_id &&
    caseRow.manager_id !== "unassigned" &&
    caseRow.manager_id !== requester.id
  ) {
    return c.json({ message: "No tienes acceso para eliminar un expediente asignado a otro manager." }, 403);
  }

  // Delete stored R2 objects for this case
  const docs = await c.env.DB.prepare("SELECT id, r2_key FROM documents WHERE case_id = ?").bind(id).all<any>();
  for (const d of docs.results || []) {
    if (d.r2_key) await c.env.BUCKET.delete(d.r2_key).catch(() => {});
    const vers = await c.env.DB.prepare("SELECT r2_key FROM document_versions WHERE document_id = ?")
      .bind(d.id)
      .all<any>();
    for (const v of vers.results || []) {
      if (v.r2_key) await c.env.BUCKET.delete(v.r2_key).catch(() => {});
    }
  }

  await c.env.DB.prepare("DELETE FROM cases WHERE id = ?").bind(id).run();
  await logAudit(
    c.env,
    requester,
    "CASE_DELETED",
    "CASE",
    id,
    `Expediente eliminado: ${caseRow.code} - ${caseRow.title}`,
    id
  );
  return c.json({ success: true });
});

// Update Case
caseRoutes.post("/cases/:id/update", requireAuth, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const oldCase = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
  if (!oldCase) {
    return c.json({ message: "Expediente no encontrado." }, 404);
  }

  const access = await checkAndAssignManager(c.env, id, requester);
  if (!access.allowed) {
    return c.json({ message: access.message }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const { title, description, advisorId, managerId, status, partyCounts } = body;

  if (managerId !== undefined && managerId !== oldCase.manager_id) {
    const isAdmin = requester.role === "ADMIN";
    const isUnassigned = !oldCase.manager_id || oldCase.manager_id === "unassigned" || oldCase.manager_id === "";
    if (!isAdmin && !(isUnassigned && managerId === requester.id)) {
      return c.json(
        { message: "Solo el administrador puede cambiar el manager asignado de este expediente." },
        403
      );
    }
  }

  const updatedStages =
    body.stages !== undefined ? body.stages : safeJsonParse<any[]>(oldCase.stages_json, []);
  let updatedCurrentStageId = oldCase.current_stage_id;
  if (updatedStages.length > 0 && !updatedStages.some((s: any) => s.id === updatedCurrentStageId)) {
    updatedCurrentStageId = updatedStages[0].id;
  }

  const newPartyCounts =
    partyCounts !== undefined
      ? partyCounts
      : safeJsonParse(oldCase.party_counts_json, { compradores: 0, vendedores: 0, garantes: 0 });
  const now = new Date().toISOString();

  const nextTitle = title || oldCase.title;
  const nextDesc = description !== undefined ? description : oldCase.description;
  const nextAdvisor = advisorId || oldCase.advisor_id;
  const nextManager = managerId || oldCase.manager_id;
  const nextStatus = status || oldCase.status;
  const nextStagesDet =
    body.stagesDetermined !== undefined ? (body.stagesDetermined ? 1 : 0) : oldCase.stages_determined;

  await c.env.DB.prepare(
    `UPDATE cases SET
      title = ?, description = ?, advisor_id = ?, manager_id = ?, status = ?,
      current_stage_id = ?, stages_json = ?, stages_determined = ?, party_counts_json = ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(
      nextTitle,
      nextDesc,
      nextAdvisor,
      nextManager,
      nextStatus,
      updatedCurrentStageId,
      JSON.stringify(updatedStages),
      nextStagesDet,
      JSON.stringify(newPartyCounts),
      now,
      id
    )
    .run();

  // Sync FORM tasks with updated partyCounts
  const tasksRes = await c.env.DB.prepare("SELECT * FROM tasks WHERE case_id = ?").bind(id).all<any>();
  for (const t of tasksRes.results || []) {
    const formInstances = safeJsonParse<any[]>(t.form_instances_json, []);
    const formValues = safeJsonParse<Record<string, any>>(t.form_values_json, {});
    const reqDef = updatedStages
      .flatMap((s: any) => s.requirements || [])
      .find((r: any) => r.id === t.requirement_id);
    if (reqDef?.type === "FORM" || formInstances.length > 0) {
      const taskObj = { formInstances, formValues, status: t.status };
      syncTaskFormInstances(newPartyCounts, taskObj);
      await c.env.DB.prepare("UPDATE tasks SET form_instances_json = ?, status = ? WHERE id = ?")
        .bind(JSON.stringify(taskObj.formInstances), taskObj.status, t.id)
        .run();
    }
  }

  if (status && status !== oldCase.status) {
    await logAudit(
      c.env,
      requester,
      "CASE_STATUS_CHANGED",
      "CASE",
      id,
      `Expediente ${oldCase.code} cambió de estado: ${oldCase.status} -> ${status} (por ${requester.name})`,
      id
    );
    await createNotification(
      c.env.DB,
      nextAdvisor,
      "Estado del expediente actualizado",
      `El expediente ${oldCase.code} ahora está en estado ${status}.`,
      status === "ACTIVO" ? "SUCCESS" : "INFO",
      id
    );
  }

  if (advisorId && advisorId !== oldCase.advisor_id) {
    await createNotification(
      c.env.DB,
      advisorId,
      "Expediente Re-asignado",
      `Se te ha re-asignado el expediente ${oldCase.code}`,
      "INFO",
      id
    );
    await logAudit(
      c.env,
      requester,
      "CASE_REASSIGNED",
      "CASE",
      id,
      `Asesor modificado para ${oldCase.code}. Anterior: ${oldCase.advisor_id}, Nuevo: ${advisorId}`,
      id
    );
  }

  const refreshed = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
  return c.json(mapCaseRow(refreshed));
});

// Claim unassigned case
caseRoutes.post("/cases/:id/claim", requireAuth, requireManagerOrAdmin, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id") || "";
  const caseRow = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
  if (!caseRow) {
    return c.json({ message: "Expediente no encontrado." }, 404);
  }
  if (caseRow.manager_id && caseRow.manager_id !== "unassigned" && caseRow.manager_id !== "") {
    return c.json({ message: "Este expediente ya tiene un manager asignado." }, 400);
  }

  const now = new Date().toISOString();
  await c.env.DB.prepare("UPDATE cases SET manager_id = ?, updated_at = ? WHERE id = ?")
    .bind(user.id, now, id)
    .run();

  await createNotification(
    c.env.DB,
    caseRow.advisor_id,
    "Manager Asignado",
    `El manager ${user.name} ha tomado tu expediente ${caseRow.code}.`,
    "INFO",
    id
  );
  await logAudit(
    c.env,
    user,
    "CASE_CLAIMED",
    "CASE",
    id,
    `El manager ${user.name} reclamó el expediente: ${caseRow.code}`,
    id
  );

  const refreshed = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
  return c.json(mapCaseRow(refreshed));
});

// Participants CRUD
caseRoutes.post("/cases/:id/participants", requireAuth, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const access = await checkAndAssignManager(c.env, id, requester);
  if (!access.allowed) {
    return c.json({ message: access.message }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const pId = `part-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const newPart = {
    id: pId,
    caseId: id,
    role: body.role || "Participante",
    name: body.name || "",
    apellido: body.apellido || "",
    dni: body.dni || "",
    cuitCuil: body.cuitCuil || "",
    email: body.email || "",
    telefono: body.telefono || "",
    observaciones: body.observaciones || "",
  };

  await c.env.DB.prepare(
    `INSERT INTO participants (id, case_id, role, name, apellido, dni, cuit_cuil, email, telefono, observaciones)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      newPart.id,
      newPart.caseId,
      newPart.role,
      newPart.name,
      newPart.apellido,
      newPart.dni,
      newPart.cuitCuil,
      newPart.email,
      newPart.telefono,
      newPart.observaciones
    )
    .run();

  await logAudit(
    c.env,
    requester,
    "PARTICIPANT_ADDED",
    "PARTICIPANT",
    pId,
    `Participante agregado al expediente: ${newPart.name} ${newPart.apellido} (${newPart.role})`,
    id
  );
  return c.json(newPart);
});

caseRoutes.delete("/cases/:id/participants/:pId", requireAuth, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const pId = c.req.param("pId") || "";

  const pRow = await c.env.DB.prepare("SELECT * FROM participants WHERE id = ? AND case_id = ?")
    .bind(pId, id)
    .first<any>();
  if (!pRow) {
    return c.json({ message: "Participante no encontrado" }, 404);
  }

  const access = await checkAndAssignManager(c.env, id, requester);
  if (!access.allowed) {
    return c.json({ message: access.message }, 403);
  }

  await c.env.DB.prepare("DELETE FROM participants WHERE id = ?").bind(pId).run();
  await logAudit(
    c.env,
    requester,
    "PARTICIPANT_REMOVED",
    "PARTICIPANT",
    pId,
    `Participante removido: ${pRow.name} ${pRow.apellido}`,
    id
  );
  return c.json({ success: true });
});

// Form Fill
caseRoutes.post("/cases/:id/requirements/:reqId/form", requireAuth, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const reqId = c.req.param("reqId") || "";

  const access = await checkAndAssignManager(c.env, id, requester);
  if (!access.allowed) {
    return c.json({ message: access.message }, 403);
  }

  const caseRow = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
  if (!caseRow) {
    return c.json({ message: "Expediente no encontrado." }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const { formValues, instanceId } = body;
  const partyCounts = safeJsonParse(caseRow.party_counts_json, {
    compradores: 0,
    vendedores: 0,
    garantes: 0,
  });

  let taskRow = await c.env.DB.prepare(
    "SELECT * FROM tasks WHERE case_id = ? AND requirement_id = ?"
  )
    .bind(id, reqId)
    .first<any>();

  const now = new Date().toISOString();
  let taskObj: any;

  if (!taskRow) {
    taskObj = {
      id: `tsk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      caseId: id,
      requirementId: reqId,
      name: "Formulario",
      description: "",
      status: "PENDIENTE",
      formValues: {},
      formInstances: [],
    };
    syncTaskFormInstances(partyCounts, taskObj);
    await c.env.DB.prepare(
      `INSERT INTO tasks (id, case_id, requirement_id, name, description, status, form_values_json, form_instances_json)
       VALUES (?, ?, ?, ?, '', ?, ?, ?)`
    )
      .bind(
        taskObj.id,
        id,
        reqId,
        taskObj.name,
        taskObj.status,
        JSON.stringify(taskObj.formValues),
        JSON.stringify(taskObj.formInstances)
      )
      .run();
  } else {
    taskObj = {
      id: taskRow.id,
      caseId: taskRow.case_id,
      requirementId: taskRow.requirement_id,
      name: taskRow.name,
      description: taskRow.description || "",
      status: taskRow.status,
      completedAt: taskRow.completed_at,
      completedBy: taskRow.completed_by,
      formValues: safeJsonParse(taskRow.form_values_json, {}),
      formInstances: safeJsonParse(taskRow.form_instances_json, []),
    };
    if (taskObj.formInstances.length === 0) {
      syncTaskFormInstances(partyCounts, taskObj);
    }
  }

  if (instanceId && taskObj.formInstances.length > 0) {
    const inst = taskObj.formInstances.find((i: any) => i.id === instanceId);
    if (inst) {
      inst.status = "COMPLETA";
      inst.formValues = formValues || {};
      inst.completedBy = requester.name;
      inst.completedAt = now;
    }
    const allComplete = taskObj.formInstances.every((i: any) => i.status === "COMPLETA");
    taskObj.status = allComplete ? "COMPLETA" : "PENDIENTE";
    if (allComplete) {
      taskObj.completedAt = now;
      taskObj.completedBy = requester.name;
    }
  } else {
    taskObj.status = "COMPLETA";
    taskObj.completedAt = now;
    taskObj.completedBy = requester.name;
    taskObj.formValues = formValues || {};
  }

  await c.env.DB.prepare(
    `UPDATE tasks SET status = ?, completed_at = ?, completed_by = ?, form_values_json = ?, form_instances_json = ? WHERE id = ?`
  )
    .bind(
      taskObj.status,
      taskObj.completedAt || null,
      taskObj.completedBy || null,
      JSON.stringify(taskObj.formValues),
      JSON.stringify(taskObj.formInstances),
      taskObj.id
    )
    .run();

  if (caseRow.status === "PENDIENTE") {
    await c.env.DB.prepare("UPDATE cases SET status = 'ACTIVO', updated_at = ? WHERE id = ?")
      .bind(now, id)
      .run();
  }

  await logAudit(
    c.env,
    requester,
    "FORM_SUBMITTED",
    "TASK",
    taskObj.id,
    `Formulario completado en expediente: ${taskObj.name}`,
    id
  );
  return c.json(taskObj);
});

// AI Form Assistance (Workers AI)
caseRoutes.post("/cases/:id/requirements/:reqId/assist-form-ai", requireAuth, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const reqId = c.req.param("reqId") || "";

  const access = await checkAndAssignManager(c.env, id, requester);
  if (!access.allowed) {
    return c.json({ message: access.message }, 403);
  }

  const hydrated = await getHydratedCase(c.env.DB, id);
  if (!hydrated) {
    return c.json({ message: "Expediente no encontrado." }, 404);
  }

  const reqDef = hydrated.requirements.find((r: any) => r.id === reqId);
  const formFields = reqDef?.formFields || [];
  if (formFields.length === 0) {
    return c.json({ message: "Este requisito no posee campos de formulario configurados." }, 400);
  }

  const docsWithAnalysis = await c.env.DB.prepare(
    "SELECT name, file_name, ai_analysis_json FROM documents WHERE case_id = ? AND ai_analysis_json IS NOT NULL"
  )
    .bind(id)
    .all<any>();

  try {
    const suggestedValues = await assistFormWithAI(
      c.env,
      {
        title: hydrated.title,
        description: hydrated.description,
        participants: hydrated.participants,
        extractedDocs: (docsWithAnalysis.results || []).map((d) => ({
          name: d.name,
          fileName: d.file_name,
          analysis: safeJsonParse(d.ai_analysis_json, null),
        })),
      },
      formFields
    );
    return c.json({ success: true, suggestedValues });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        message: `Error ejecutando asistencia de formulario con Cloudflare Workers AI: ${err?.message || "servicio no disponible"}`,
      },
      502
    );
  }
});

// Task Toggle
caseRoutes.post("/cases/:id/requirements/:reqId/task", requireAuth, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const reqId = c.req.param("reqId") || "";

  const access = await checkAndAssignManager(c.env, id, requester);
  if (!access.allowed) {
    return c.json({ message: access.message }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const status = body.status || "COMPLETA";
  const now = new Date().toISOString();

  let taskRow = await c.env.DB.prepare(
    "SELECT * FROM tasks WHERE case_id = ? AND requirement_id = ?"
  )
    .bind(id, reqId)
    .first<any>();

  if (!taskRow) {
    const hydrated = await getHydratedCase(c.env.DB, id);
    const reqDef = hydrated?.currentStage?.requirements?.find((r: any) => r.id === reqId);
    const tId = `tsk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const name = reqDef ? reqDef.name : "Tarea";
    await c.env.DB.prepare(
      `INSERT INTO tasks (id, case_id, requirement_id, name, description, status, completed_at, completed_by, form_values_json, form_instances_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', '[]')`
    )
      .bind(
        tId,
        id,
        reqId,
        name,
        reqDef?.description || "",
        status,
        status === "COMPLETA" ? now : null,
        status === "COMPLETA" ? requester.name : null
      )
      .run();

    taskRow = await c.env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(tId).first<any>();
  } else {
    await c.env.DB.prepare("UPDATE tasks SET status = ?, completed_at = ?, completed_by = ? WHERE id = ?")
      .bind(
        status,
        status === "COMPLETA" ? now : null,
        status === "COMPLETA" ? requester.name : null,
        taskRow.id
      )
      .run();
    taskRow = await c.env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(taskRow.id).first<any>();
  }

  await c.env.DB.prepare(
    "UPDATE cases SET status = 'ACTIVO', updated_at = ? WHERE id = ? AND status = 'PENDIENTE'"
  )
    .bind(now, id)
    .run();

  await logAudit(
    c.env,
    requester,
    "TASK_UPDATED",
    "TASK",
    taskRow.id,
    `Estado de tarea de expediente modificado a ${status}: ${taskRow.name}`,
    id
  );

  return c.json({
    id: taskRow.id,
    caseId: taskRow.case_id,
    requirementId: taskRow.requirement_id,
    name: taskRow.name,
    description: taskRow.description || "",
    status: taskRow.status,
    completedAt: taskRow.completed_at,
    completedBy: taskRow.completed_by,
    formValues: safeJsonParse(taskRow.form_values_json, {}),
    formInstances: safeJsonParse(taskRow.form_instances_json, []),
  });
});

// Upload Document to R2 & D1 (supports JSON base64 or multipart/form-data)
caseRoutes.post("/cases/:id/requirements/:reqId/upload", requireAuth, async (c) => {
  try {
    const requester = c.get("user");
    const id = c.req.param("id") || "";
    const reqId = c.req.param("reqId") || "";

    const access = await checkAndAssignManager(c.env, id, requester);
    if (!access.allowed) {
      return c.json({ message: access.message }, 403);
    }

    const caseRow = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
    if (!caseRow) {
      return c.json({ message: "Expediente no encontrado." }, 404);
    }

    const reqStates = safeJsonParse<Record<string, any>>(caseRow.requirement_states_json, {});
    const reqState = reqStates[reqId] || {};

    let fileName = "documento.pdf";
    let fileType = "application/pdf";
    let fileSize = "N/A";
    let bytes: Uint8Array | null = null;

    const contentType = c.req.header("Content-Type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await c.req.formData();
      const file = form.get("file");
      if (file instanceof File) {
        fileName = file.name || fileName;
        fileType = file.type || fileType;
        fileSize = `${(file.size / 1024).toFixed(1)} KB`;
        bytes = new Uint8Array(await file.arrayBuffer());
      }
    } else {
      const body = await c.req.json().catch(() => ({}));
      fileName = String(body.fileName || fileName);
      fileType = String(body.fileType || fileType);
      fileSize = String(body.fileSize || fileSize);
      if (body.fileContent) {
        bytes = decodeBase64ToBytes(String(body.fileContent));
        if (!body.fileSize) {
          fileSize = `${(bytes.byteLength / 1024).toFixed(1)} KB`;
        }
      }
    }

    if (!bytes || bytes.byteLength === 0) {
      return c.json({ success: false, message: "Debe adjuntar el contenido del archivo." }, 400);
    }

    // Backend permission enforcement for ASESOR when re-uploading or restricted by uploadConfig
    const existingDoc = await c.env.DB.prepare(
      "SELECT * FROM documents WHERE case_id = ? AND requirement_id = ?"
    )
      .bind(id, reqId)
      .first<any>();

    if (requester.role === "ASESOR" && existingDoc && existingDoc.status === "APROBADO" && !reqState.uploadEnabled) {
      return c.json(
        {
          success: false,
          message: "El documento ya fue aprobado. Solicite permiso de subida al Manager para reemplazarlo.",
        },
        403
      );
    }

    const maxWeightMb = Number(reqState?.uploadConfig?.maxWeight || 15);
    if (bytes.byteLength > maxWeightMb * 1024 * 1024) {
      return c.json(
        { success: false, message: `El archivo excede el tamaño máximo permitido (${maxWeightMb} MB).` },
        400
      );
    }

    const now = new Date().toISOString();
    const docId = existingDoc ? existingDoc.id : `doc-${Date.now()}`;
    const nextVersion = existingDoc ? Number(existingDoc.version || 1) + 1 : 1;
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const r2Key = `documents/${id}/${docId}/v${nextVersion}-${safeName}`;

    await c.env.BUCKET.put(r2Key, bytes, {
      httpMetadata: { contentType: fileType },
      customMetadata: {
        caseId: id,
        docId,
        requirementId: reqId,
        version: String(nextVersion),
        uploadedBy: requester.id,
      },
    });

    const downloadUrl = `/api/documents/download/${docId}`;

    if (existingDoc) {
      await c.env.DB.prepare(
        `INSERT INTO document_versions (id, document_id, version, file_name, r2_key, file_url, uploaded_at, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          `dv-${docId}-v${existingDoc.version}`,
          docId,
          existingDoc.version,
          existingDoc.file_name || existingDoc.name,
          existingDoc.r2_key || null,
          `/api/documents/download/${docId}?version=${existingDoc.version}`,
          existingDoc.uploaded_at || now,
          existingDoc.uploaded_by || requester.name
        )
        .run();

      await c.env.DB.prepare(
        `UPDATE documents SET
          status = 'EN_REVISION',
          r2_key = ?, file_url = ?, file_name = ?, file_type = ?, file_size = ?,
          uploaded_at = ?, uploaded_by = ?, version = ?, ai_analysis_json = NULL
         WHERE id = ?`
      )
        .bind(r2Key, downloadUrl, fileName, fileType, fileSize, now, requester.name, nextVersion, docId)
        .run();
    } else {
      const stages = safeJsonParse<any[]>(caseRow.stages_json, []);
      const reqDef = stages.flatMap((s) => s.requirements || []).find((r: any) => r.id === reqId);
      const docName = reqDef ? reqDef.name : "Documento";

      await c.env.DB.prepare(
        `INSERT INTO documents (
          id, case_id, requirement_id, name, status, r2_key, file_url, file_name, file_type, file_size, uploaded_at, uploaded_by, version
        ) VALUES (?, ?, ?, ?, 'EN_REVISION', ?, ?, ?, ?, ?, ?, ?, 1)`
      )
        .bind(docId, id, reqId, docName, r2Key, downloadUrl, fileName, fileType, fileSize, now, requester.name)
        .run();
    }

    if (caseRow.status === "PENDIENTE") {
      await c.env.DB.prepare("UPDATE cases SET status = 'ACTIVO', updated_at = ? WHERE id = ?")
        .bind(now, id)
        .run();
    } else {
      await c.env.DB.prepare("UPDATE cases SET updated_at = ? WHERE id = ?").bind(now, id).run();
    }

    await c.env.DB.prepare(
      `UPDATE observations
       SET status = 'RESUELTA', response = 'Se cargó una nueva versión correctiva del documento.', responded_at = ?
       WHERE case_id = ? AND entity_id = ? AND status = 'ABIERTA'`
    )
      .bind(now, id, docId)
      .run();

    const docRow = await c.env.DB.prepare("SELECT * FROM documents WHERE id = ?").bind(docId).first<any>();

    if (caseRow.manager_id && caseRow.manager_id !== "unassigned") {
      await createNotification(
        c.env.DB,
        caseRow.manager_id,
        "Documento cargado para revisión",
        `Se ha subido una nueva versión de '${docRow.name}' para el expediente ${caseRow.code}.`,
        "INFO",
        id
      );
    }

    await logAudit(
      c.env,
      requester,
      "DOCUMENT_UPLOADED",
      "DOCUMENT",
      docId,
      `Documento cargado en R2: ${docRow.name} (V${nextVersion})`,
      id
    );

    // Enqueue background AI analysis via Cloudflare Queues (non-blocking)
    if (c.env.TASKS_QUEUE) {
      try {
        await c.env.TASKS_QUEUE.send({
          type: "DOCUMENT_ANALYZE",
          caseId: id,
          docId,
          r2Key,
          fileName,
          fileType,
          requestedBy: requester.id,
        });
      } catch {
        // Queue unavailable in isolated unit test runtime — sync analysis remains available via /analyze-ai
      }
    }

    const versRes = await c.env.DB.prepare(
      "SELECT * FROM document_versions WHERE document_id = ? ORDER BY version ASC"
    )
      .bind(docId)
      .all<any>();

    return c.json({
      id: docRow.id,
      caseId: docRow.case_id,
      requirementId: docRow.requirement_id,
      name: docRow.name,
      status: docRow.status,
      r2Key: docRow.r2_key,
      fileUrl: docRow.file_url,
      fileName: docRow.file_name,
      fileType: docRow.file_type,
      fileSize: docRow.file_size,
      uploadedAt: docRow.uploaded_at,
      uploadedBy: docRow.uploaded_by,
      version: docRow.version,
      aiAnalysis: safeJsonParse(docRow.ai_analysis_json, null),
      history: (versRes.results || []).map((v) => ({
        version: v.version,
        fileName: v.file_name,
        fileUrl: v.file_url,
        uploadedAt: v.uploaded_at,
        uploadedBy: v.uploaded_by,
      })),
    });
  } catch (err: any) {
    return c.json({ success: false, message: `Error al subir el documento: ${err.message}` }, 500);
  }
});

// Authenticated Document Download Proxy from R2
caseRoutes.get("/documents/download/:docId", requireAuth, async (c) => {
  const user = c.get("user");
  const docId = c.req.param("docId") || "";
  const versionParam = c.req.query("version");

  const docRow = await c.env.DB.prepare("SELECT * FROM documents WHERE id = ?").bind(docId).first<any>();
  if (!docRow) {
    return c.text("Documento no encontrado.", 404);
  }

  const caseRow = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?")
    .bind(docRow.case_id)
    .first<any>();
  if (!caseRow || !canReadCase(user, caseRow)) {
    return c.text("No autorizado para descargar este documento.", 403);
  }

  // Enforce advisor download permission on backend!
  if (user.role === "ASESOR") {
    const reqStates = safeJsonParse<Record<string, any>>(caseRow.requirement_states_json, {});
    const allowed = Boolean(reqStates[docRow.requirement_id]?.downloadEnabled);
    if (!allowed) {
      return c.text("La descarga de este documento no está habilitada por el Manager.", 403);
    }
  }

  let r2Key = docRow.r2_key;
  let fileName = docRow.file_name || docRow.name;
  let fileType = docRow.file_type || "application/octet-stream";

  if (versionParam) {
    const verNum = parseInt(versionParam, 10);
    if (Number.isFinite(verNum) && verNum !== docRow.version) {
      const verRow = await c.env.DB.prepare(
        "SELECT * FROM document_versions WHERE document_id = ? AND version = ?"
      )
        .bind(docId, verNum)
        .first<any>();
      if (!verRow || !verRow.r2_key) {
        return c.text("Versión del documento no encontrada.", 404);
      }
      r2Key = verRow.r2_key;
      fileName = verRow.file_name || fileName;
    }
  }

  if (!r2Key) {
    return c.text("El contenido del archivo no está disponible en R2.", 404);
  }

  const object = await c.env.BUCKET.get(r2Key);
  if (!object) {
    return c.text("Archivo no encontrado en Cloudflare R2.", 404);
  }

  const headers = new Headers();
  headers.set("Content-Type", fileType || object.httpMetadata?.contentType || "application/pdf");
  headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { status: 200, headers });
});

// Synchronous AI Document Analysis Endpoint (Workers AI)
caseRoutes.post("/cases/:id/documents/:docId/analyze-ai", requireAuth, async (c) => {
  const user = c.get("user");
  const caseId = c.req.param("id") || "";
  const docId = c.req.param("docId") || "";

  const access = await checkAndAssignManager(c.env, caseId, user);
  if (!access.allowed) {
    return c.json({ message: access.message }, 403);
  }

  const docRow = await c.env.DB.prepare("SELECT * FROM documents WHERE id = ? AND case_id = ?")
    .bind(docId, caseId)
    .first<any>();
  if (!docRow || !docRow.r2_key) {
    return c.json({ message: "Documento o archivo R2 no encontrado." }, 404);
  }

  const obj = await c.env.BUCKET.get(docRow.r2_key);
  if (!obj) {
    return c.json({ message: "No se encontró el archivo en Cloudflare R2." }, 404);
  }

  try {
    const bytes = new Uint8Array(await obj.arrayBuffer());
    const analysis = await analyzeDocumentWithAI(
      c.env,
      docRow.file_name || docRow.name,
      docRow.file_type || "application/pdf",
      bytes,
      docRow.name
    );

    await c.env.DB.prepare("UPDATE documents SET ai_analysis_json = ? WHERE id = ?")
      .bind(JSON.stringify(analysis), docId)
      .run();

    await logAudit(
      c.env,
      user,
      "DOCUMENT_AI_ANALYZED",
      "DOCUMENT",
      docId,
      `Análisis IA ejecutado para '${docRow.name}' (${analysis.modelUsed}).`,
      caseId
    );

    return c.json({ success: true, analysis });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        message: `Error ejecutando Cloudflare Workers AI sobre el documento: ${err?.message || "servicio no disponible"}`,
      },
      502
    );
  }
});

// Approve Document
caseRoutes.post("/cases/:id/requirements/:reqId/approve", requireAuth, requireManagerOrAdmin, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const reqId = c.req.param("reqId") || "";

  const access = await checkAndAssignManager(c.env, id, requester);
  if (!access.allowed) {
    return c.json({ message: access.message }, 403);
  }

  const doc = await c.env.DB.prepare("SELECT * FROM documents WHERE case_id = ? AND requirement_id = ?")
    .bind(id, reqId)
    .first<any>();
  if (!doc) {
    return c.json({ message: "Documento no encontrado para autorizar." }, 404);
  }

  await c.env.DB.prepare("UPDATE documents SET status = 'APROBADO' WHERE id = ?").bind(doc.id).run();

  const caseRow = await c.env.DB.prepare("SELECT code, advisor_id FROM cases WHERE id = ?")
    .bind(id)
    .first<any>();
  if (caseRow) {
    await createNotification(
      c.env.DB,
      caseRow.advisor_id,
      "Requisito Documental Aprobado",
      `El documento '${doc.name}' fue aprobado en el expediente ${caseRow.code}.`,
      "SUCCESS",
      id
    );
  }

  await logAudit(
    c.env,
    requester,
    "DOCUMENT_APPROVED",
    "DOCUMENT",
    doc.id,
    `Documento aprobado para legajo: ${doc.name}`,
    id
  );
  return c.json({
    id: doc.id,
    caseId: doc.case_id,
    requirementId: doc.requirement_id,
    name: doc.name,
    status: "APROBADO",
    fileUrl: doc.file_url,
    fileName: doc.file_name,
    fileType: doc.file_type,
    fileSize: doc.file_size,
    uploadedAt: doc.uploaded_at,
    uploadedBy: doc.uploaded_by,
    version: doc.version,
  });
});

// Reject Document
caseRoutes.post("/cases/:id/requirements/:reqId/reject", requireAuth, requireManagerOrAdmin, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const reqId = c.req.param("reqId") || "";

  const access = await checkAndAssignManager(c.env, id, requester);
  if (!access.allowed) {
    return c.json({ message: access.message }, 403);
  }

  const doc = await c.env.DB.prepare("SELECT * FROM documents WHERE case_id = ? AND requirement_id = ?")
    .bind(id, reqId)
    .first<any>();
  if (!doc) {
    return c.json({ message: "Documento no encontrado para rechazar." }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const reason =
    String(body.reason || "").trim() ||
    "El documento no cumple con los requisitos mínimos de legibilidad u originalidad.";
  const now = new Date().toISOString();

  await c.env.DB.prepare("UPDATE documents SET status = 'RECHAZADO' WHERE id = ?").bind(doc.id).run();

  const caseRow = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
  const obsId = `obs-${Date.now()}`;
  const obs = {
    id: obsId,
    caseId: id,
    stageId: caseRow?.current_stage_id || "",
    entityId: doc.id,
    entityType: "DOCUMENT" as const,
    message: reason,
    authorId: requester.id,
    authorName: requester.name,
    createdAt: now,
    status: "ABIERTA" as const,
  };

  await c.env.DB.prepare(
    `INSERT INTO observations (id, case_id, stage_id, entity_id, entity_type, message, author_id, author_name, created_at, status)
     VALUES (?, ?, ?, ?, 'DOCUMENT', ?, ?, ?, ?, 'ABIERTA')`
  )
    .bind(obs.id, id, obs.stageId, obs.entityId, obs.message, obs.authorId, obs.authorName, obs.createdAt)
    .run();

  if (caseRow) {
    await c.env.DB.prepare("UPDATE cases SET status = 'OBSERVADO', updated_at = ? WHERE id = ?")
      .bind(now, id)
      .run();
    await createNotification(
      c.env.DB,
      caseRow.advisor_id,
      "Requisito Documental Rechazado",
      `El documento '${doc.name}' fue RECHAZADO: ${reason}. Se requiere corregir observaciones.`,
      "DANGER",
      id
    );
  }

  await logAudit(
    c.env,
    requester,
    "DOCUMENT_REJECTED",
    "DOCUMENT",
    doc.id,
    `Documento rechazado: ${doc.name}. Motivo: ${reason}`,
    id
  );

  return c.json({
    doc: {
      id: doc.id,
      caseId: doc.case_id,
      requirementId: doc.requirement_id,
      name: doc.name,
      status: "RECHAZADO",
      fileUrl: doc.file_url,
      fileName: doc.file_name,
      fileType: doc.file_type,
      fileSize: doc.file_size,
      uploadedAt: doc.uploaded_at,
      uploadedBy: doc.uploaded_by,
      version: doc.version,
    },
    observation: obs,
  });
});

// Toggle Download Permission
caseRoutes.post(
  "/cases/:id/requirements/:reqId/toggle-download",
  requireAuth,
  requireManagerOrAdmin,
  async (c) => {
    const requester = c.get("user");
    const id = c.req.param("id") || "";
    const reqId = c.req.param("reqId") || "";
    const body = await c.req.json().catch(() => ({}));
    const downloadEnabled = Boolean(body.downloadEnabled);

    const caseRow = await c.env.DB.prepare("SELECT requirement_states_json FROM cases WHERE id = ?")
      .bind(id)
      .first<any>();
    if (!caseRow) {
      return c.json({ message: "Expediente no encontrado." }, 404);
    }

    const reqStates = safeJsonParse<Record<string, any>>(caseRow.requirement_states_json, {});
    reqStates[reqId] = reqStates[reqId] || {};
    reqStates[reqId].downloadEnabled = downloadEnabled;

    await c.env.DB.prepare("UPDATE cases SET requirement_states_json = ?, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify(reqStates), new Date().toISOString(), id)
      .run();

    await logAudit(
      c.env,
      requester,
      "DOWNLOAD_PERMISSION_TOGGLED",
      "CASE",
      id,
      `Permiso de descarga del requisito ${reqId} cambiado a: ${downloadEnabled}`,
      id
    );
    return c.json({ success: true, downloadEnabled });
  }
);

// Request Upload Permission
caseRoutes.post("/cases/:id/requirements/:reqId/request-upload", requireAuth, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const reqId = c.req.param("reqId") || "";
  const body = await c.req.json().catch(() => ({}));
  const reason = String(body.reason || "No especificado");

  const caseRow = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
  if (!caseRow) {
    return c.json({ message: "Expediente no encontrado." }, 404);
  }

  const reqStates = safeJsonParse<Record<string, any>>(caseRow.requirement_states_json, {});
  reqStates[reqId] = reqStates[reqId] || {};
  reqStates[reqId].uploadRequestStatus = "SOLICITADO";
  reqStates[reqId].uploadRequestReason = reason;

  await c.env.DB.prepare("UPDATE cases SET requirement_states_json = ?, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(reqStates), new Date().toISOString(), id)
    .run();

  if (caseRow.manager_id && caseRow.manager_id !== "unassigned") {
    await createNotification(
      c.env.DB,
      caseRow.manager_id,
      "Solicitud de Permiso de Subida",
      `El asesor solicita habilitar la subida para el requisito del expediente ${caseRow.code}. Detalle: ${reason}`,
      "WARNING",
      id
    );
  }

  await logAudit(
    c.env,
    requester,
    "UPLOAD_PERMISSION_REQUESTED",
    "CASE",
    id,
    `Solicitó permiso de subida para el requisito ${reqId}. Detalle: ${reason}`,
    id
  );
  return c.json({ success: true, uploadRequestStatus: "SOLICITADO", uploadRequestReason: reason });
});

// Configure Upload Permission (Manager/Admin)
caseRoutes.post(
  "/cases/:id/requirements/:reqId/configure-upload",
  requireAuth,
  requireManagerOrAdmin,
  async (c) => {
    const requester = c.get("user");
    const id = c.req.param("id") || "";
    const reqId = c.req.param("reqId") || "";
    const body = await c.req.json().catch(() => ({}));
    const uploadEnabled = Boolean(body.uploadEnabled);
    const maxCount = Number(body.maxCount) || 1;
    const fileType = String(body.fileType || "all");
    const maxWeight = Number(body.maxWeight) || 5;

    const caseRow = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
    if (!caseRow) {
      return c.json({ message: "Expediente no encontrado." }, 404);
    }

    const reqStates = safeJsonParse<Record<string, any>>(caseRow.requirement_states_json, {});
    reqStates[reqId] = reqStates[reqId] || {};
    reqStates[reqId].uploadEnabled = uploadEnabled;
    reqStates[reqId].uploadRequestStatus = uploadEnabled ? "APROBADO" : "RECHAZADO";
    reqStates[reqId].uploadConfig = { maxCount, fileType, maxWeight };

    await c.env.DB.prepare("UPDATE cases SET requirement_states_json = ?, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify(reqStates), new Date().toISOString(), id)
      .run();

    await createNotification(
      c.env.DB,
      caseRow.advisor_id,
      uploadEnabled ? "Permiso de Subida Otorgado" : "Permiso de Subida Denegado",
      uploadEnabled
        ? `Se ha habilitado la subida para un requisito en el expediente ${caseRow.code}. Límites: ${maxCount} archivo(s), Tipo: ${fileType}, Máx: ${maxWeight}MB.`
        : `Se ha denegado la solicitud de subida para un requisito en el expediente ${caseRow.code}.`,
      uploadEnabled ? "SUCCESS" : "DANGER",
      id
    );

    await logAudit(
      c.env,
      requester,
      "UPLOAD_PERMISSION_CONFIGURED",
      "CASE",
      id,
      `Configuró permiso de subida para requisito ${reqId}. Habilitado: ${uploadEnabled}`,
      id
    );

    return c.json({
      success: true,
      uploadEnabled,
      uploadRequestStatus: reqStates[reqId].uploadRequestStatus,
      uploadConfig: reqStates[reqId].uploadConfig,
    });
  }
);

// Adjustment Requests
caseRoutes.post("/cases/:id/adjustment-requests", requireAuth, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const body = await c.req.json().catch(() => ({}));

  const caseRow = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
  if (!caseRow) {
    return c.json({ message: "Expediente no encontrado." }, 404);
  }

  const adjId = `adj-${Date.now()}`;
  const now = new Date().toISOString();
  const qty = body.quantity !== undefined ? Number(body.quantity) : null;

  await c.env.DB.prepare(
    `INSERT INTO adjustment_requests (
      id, case_id, type, target_party, action, quantity, requirement_id, details, status, requested_by, requested_by_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, ?, ?)`
  )
    .bind(
      adjId,
      id,
      body.type,
      body.targetParty || null,
      body.action || null,
      qty,
      body.requirementId || null,
      String(body.details || ""),
      requester.id,
      requester.name,
      now
    )
    .run();

  if (caseRow.manager_id && caseRow.manager_id !== "unassigned") {
    await createNotification(
      c.env.DB,
      caseRow.manager_id,
      "Nueva Solicitud de Ajuste",
      `El asesor ${requester.name} ha solicitado una modificación en el expediente ${caseRow.code}: ${body.details}`,
      "INFO",
      id
    );
  }

  await logAudit(
    c.env,
    requester,
    "ADJUSTMENT_REQUEST_CREATED",
    "CASE",
    id,
    `Solicitó ajuste en expediente: ${body.details}`,
    id
  );

  return c.json({
    success: true,
    request: {
      id: adjId,
      caseId: id,
      type: body.type,
      targetParty: body.targetParty,
      action: body.action,
      quantity: qty ?? undefined,
      requirementId: body.requirementId,
      details: body.details,
      status: "PENDIENTE",
      requestedBy: requester.id,
      requestedByName: requester.name,
      createdAt: now,
    },
  });
});

caseRoutes.post(
  "/cases/:id/adjustment-requests/:reqId/approve",
  requireAuth,
  requireManagerOrAdmin,
  async (c) => {
    const requester = c.get("user");
    const id = c.req.param("id") || "";
    const reqId = c.req.param("reqId") || "";

    const access = await checkAndAssignManager(c.env, id, requester);
    if (!access.allowed) {
      return c.json({ message: access.message }, 403);
    }

    const caseRow = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
    if (!caseRow) return c.json({ message: "Expediente no encontrado." }, 404);

    const adjRow = await c.env.DB.prepare(
      "SELECT * FROM adjustment_requests WHERE id = ? AND case_id = ?"
    )
      .bind(reqId, id)
      .first<any>();
    if (!adjRow) return c.json({ message: "Solicitud de ajuste no encontrada." }, 404);

    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `UPDATE adjustment_requests SET status = 'APROBADO', processed_by = ?, processed_by_name = ?, processed_at = ? WHERE id = ?`
    )
      .bind(requester.id, requester.name, now, reqId)
      .run();

    let partyCounts = safeJsonParse(caseRow.party_counts_json, {
      compradores: 1,
      vendedores: 1,
      garantes: 0,
    });
    const reqStates = safeJsonParse<Record<string, any>>(caseRow.requirement_states_json, {});

    if (adjRow.type === "FORM_COUNT" && adjRow.target_party) {
      const party = adjRow.target_party as keyof typeof partyCounts;
      const qty = Number(adjRow.quantity || 1);
      if (adjRow.action === "ADD") {
        partyCounts[party] = (partyCounts[party] || 0) + qty;
      } else if (adjRow.action === "REMOVE") {
        partyCounts[party] = Math.max(0, (partyCounts[party] || 0) - qty);
      }

      await c.env.DB.prepare("UPDATE cases SET party_counts_json = ?, updated_at = ? WHERE id = ?")
        .bind(JSON.stringify(partyCounts), now, id)
        .run();

      const tasksRes = await c.env.DB.prepare("SELECT * FROM tasks WHERE case_id = ?").bind(id).all<any>();
      const stages = safeJsonParse<any[]>(caseRow.stages_json, []);
      for (const t of tasksRes.results || []) {
        const reqDef = stages.flatMap((s) => s.requirements || []).find((r: any) => r.id === t.requirement_id);
        const formInstances = safeJsonParse<any[]>(t.form_instances_json, []);
        if (reqDef?.type === "FORM" || formInstances.length > 0) {
          const taskObj = {
            formInstances,
            formValues: safeJsonParse(t.form_values_json, {}),
            status: t.status,
          };
          syncTaskFormInstances(partyCounts, taskObj);
          await c.env.DB.prepare("UPDATE tasks SET form_instances_json = ?, status = ? WHERE id = ?")
            .bind(JSON.stringify(taskObj.formInstances), taskObj.status, t.id)
            .run();
        }
      }
    } else if (adjRow.type === "DOCUMENT_UPLOAD" && adjRow.requirement_id) {
      reqStates[adjRow.requirement_id] = reqStates[adjRow.requirement_id] || {};
      reqStates[adjRow.requirement_id].uploadRequestStatus = "APROBADO";
      reqStates[adjRow.requirement_id].uploadEnabled = true;
      reqStates[adjRow.requirement_id].uploadConfig = {
        maxCount: 5,
        fileType: "all",
        maxWeight: 10,
      };
      await c.env.DB.prepare("UPDATE cases SET requirement_states_json = ?, updated_at = ? WHERE id = ?")
        .bind(JSON.stringify(reqStates), now, id)
        .run();
    }

    await createNotification(
      c.env.DB,
      caseRow.advisor_id,
      "Solicitud de Ajuste Aprobada",
      `Su solicitud de ajuste para ${adjRow.type === "FORM_COUNT" ? "formularios" : "documentos"} ha sido aprobada.`,
      "SUCCESS",
      id
    );
    await logAudit(
      c.env,
      requester,
      "ADJUSTMENT_REQUEST_APPROVED",
      "CASE",
      id,
      `Aprobó solicitud de ajuste: ${adjRow.details}`,
      id
    );

    return c.json({
      success: true,
      request: {
        id: adjRow.id,
        caseId: id,
        type: adjRow.type,
        targetParty: adjRow.target_party,
        action: adjRow.action,
        quantity: adjRow.quantity,
        requirementId: adjRow.requirement_id,
        details: adjRow.details,
        status: "APROBADO",
        processedBy: requester.id,
        processedByName: requester.name,
        processedAt: now,
      },
      partyCounts,
    });
  }
);

caseRoutes.post(
  "/cases/:id/adjustment-requests/:reqId/reject",
  requireAuth,
  requireManagerOrAdmin,
  async (c) => {
    const requester = c.get("user");
    const id = c.req.param("id") || "";
    const reqId = c.req.param("reqId") || "";
    const body = await c.req.json().catch(() => ({}));
    const rejectionReason = String(body.rejectionReason || "Denegado por el manager.");

    const access = await checkAndAssignManager(c.env, id, requester);
    if (!access.allowed) {
      return c.json({ message: access.message }, 403);
    }

    const caseRow = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
    if (!caseRow) return c.json({ message: "Expediente no encontrado." }, 404);

    const adjRow = await c.env.DB.prepare(
      "SELECT * FROM adjustment_requests WHERE id = ? AND case_id = ?"
    )
      .bind(reqId, id)
      .first<any>();
    if (!adjRow) return c.json({ message: "Solicitud de ajuste no encontrada." }, 404);

    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `UPDATE adjustment_requests SET status = 'RECHAZADO', processed_by = ?, processed_by_name = ?, processed_at = ?, rejection_reason = ? WHERE id = ?`
    )
      .bind(requester.id, requester.name, now, rejectionReason, reqId)
      .run();

    if (adjRow.type === "DOCUMENT_UPLOAD" && adjRow.requirement_id) {
      const reqStates = safeJsonParse<Record<string, any>>(caseRow.requirement_states_json, {});
      reqStates[adjRow.requirement_id] = reqStates[adjRow.requirement_id] || {};
      reqStates[adjRow.requirement_id].uploadRequestStatus = "RECHAZADO";
      reqStates[adjRow.requirement_id].uploadEnabled = false;
      await c.env.DB.prepare("UPDATE cases SET requirement_states_json = ?, updated_at = ? WHERE id = ?")
        .bind(JSON.stringify(reqStates), now, id)
        .run();
    }

    await createNotification(
      c.env.DB,
      caseRow.advisor_id,
      "Solicitud de Ajuste Rechazada",
      `Su solicitud de ajuste ha sido rechazada: ${rejectionReason}`,
      "DANGER",
      id
    );
    await logAudit(
      c.env,
      requester,
      "ADJUSTMENT_REQUEST_REJECTED",
      "CASE",
      id,
      `Rechazó solicitud de ajuste: ${adjRow.details}. Motivo: ${rejectionReason}`,
      id
    );

    return c.json({
      success: true,
      request: {
        id: adjRow.id,
        caseId: id,
        type: adjRow.type,
        status: "RECHAZADO",
        processedBy: requester.id,
        processedByName: requester.name,
        processedAt: now,
        rejectionReason,
      },
    });
  }
);

// Observations
caseRoutes.post("/cases/:id/observations", requireAuth, requireManagerOrAdmin, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const access = await checkAndAssignManager(c.env, id, requester);
  if (!access.allowed) {
    return c.json({ message: access.message }, 403);
  }

  const caseRow = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
  if (!caseRow) return c.json({ message: "Expediente no encontrado." }, 404);

  const body = await c.req.json().catch(() => ({}));
  const message = String(body.message || "");
  const entityType = ["DOCUMENT", "TASK", "GENERAL"].includes(body.entityType) ? body.entityType : "GENERAL";
  const entityId = String(body.entityId || "general");
  const bloquearRevision = body.bloquearRevision === true;
  const now = new Date().toISOString();

  const obsId = `obs-${Date.now()}`;
  await c.env.DB.prepare(
    `INSERT INTO observations (id, case_id, stage_id, entity_id, entity_type, message, author_id, author_name, created_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ABIERTA')`
  )
    .bind(obsId, id, caseRow.current_stage_id || "", entityId, entityType, message, requester.id, requester.name, now)
    .run();

  if (bloquearRevision) {
    await c.env.DB.prepare(
      "UPDATE cases SET status = 'OBSERVADO', review_button_blocked = 1, review_button_blocked_reason = ?, updated_at = ? WHERE id = ?"
    )
      .bind(message || "Observaciones pendientes en la etapa actual.", now, id)
      .run();
  } else {
    await c.env.DB.prepare("UPDATE cases SET status = 'OBSERVADO', updated_at = ? WHERE id = ?")
      .bind(now, id)
      .run();
  }

  await createNotification(
    c.env.DB,
    caseRow.advisor_id,
    "Nueva Observación Registrada",
    `Nueva indicación de ${requester.name}: ${message}${bloquearRevision ? " (Botón de revisión bloqueado)" : ""}`,
    "WARNING",
    id
  );
  await logAudit(
    c.env,
    requester,
    "OBSERVATION_CREATED",
    "OBSERVATION",
    obsId,
    `Observación agregada manualmente: ${message}`,
    id
  );

  return c.json({
    id: obsId,
    caseId: id,
    stageId: caseRow.current_stage_id || "",
    entityId,
    entityType,
    message,
    authorId: requester.id,
    authorName: requester.name,
    createdAt: now,
    status: "ABIERTA",
  });
});

caseRoutes.post("/cases/:id/observations/:obsId/resolve", requireAuth, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const obsId = c.req.param("obsId") || "";

  const access = await checkAndAssignManager(c.env, id, requester);
  if (!access.allowed) {
    return c.json({ message: access.message }, 403);
  }

  const obsRow = await c.env.DB.prepare("SELECT * FROM observations WHERE id = ? AND case_id = ?")
    .bind(obsId, id)
    .first<any>();
  if (!obsRow) {
    return c.json({ message: "Observación no encontrada." }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const response = String(body.response || "Respondido por asesor.");
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    "UPDATE observations SET status = 'RESUELTA', response = ?, responded_at = ? WHERE id = ?"
  )
    .bind(response, now, obsId)
    .run();

  const [openObsRes, rejDocsRes, caseRow] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) as total FROM observations WHERE case_id = ? AND status = 'ABIERTA'")
      .bind(id)
      .first<{ total: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as total FROM documents WHERE case_id = ? AND status = 'RECHAZADO'")
      .bind(id)
      .first<{ total: number }>(),
    c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>(),
  ]);

  if (Number(openObsRes?.total || 0) === 0 && Number(rejDocsRes?.total || 0) === 0 && caseRow) {
    await c.env.DB.prepare("UPDATE cases SET status = 'ACTIVO', updated_at = ? WHERE id = ?")
      .bind(now, id)
      .run();
  }

  if (caseRow && caseRow.manager_id && caseRow.manager_id !== "unassigned") {
    await createNotification(
      c.env.DB,
      caseRow.manager_id,
      "Observación Respondida",
      `El asesor respondió la observación sobre el expediente ${caseRow.code}.`,
      "SUCCESS",
      id
    );
  }

  await logAudit(
    c.env,
    requester,
    "OBSERVATION_RESOLVED",
    "OBSERVATION",
    obsId,
    `Observación marcada como resuelta. Respuesta: ${response}`,
    id
  );

  return c.json({
    id: obsRow.id,
    caseId: obsRow.case_id,
    stageId: obsRow.stage_id || "",
    entityId: obsRow.entity_id || "general",
    entityType: obsRow.entity_type,
    message: obsRow.message,
    authorId: obsRow.author_id,
    authorName: obsRow.author_name,
    createdAt: obsRow.created_at,
    status: "RESUELTA",
    response,
    respondedAt: now,
  });
});

// Stage Review Lifecycle
caseRoutes.post("/cases/:id/request-review", requireAuth, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const body = await c.req.json().catch(() => ({}));
  const type = body.type;

  const caseRow = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
  if (!caseRow) return c.json({ message: "Expediente no encontrado." }, 404);
  if (!canReadCase(requester, caseRow)) {
    return c.json({ message: "No tienes acceso a este expediente." }, 403);
  }

  if (caseRow.review_button_blocked) {
    return c.json(
      {
        error: true,
        message:
          "Las solicitudes de revisión están bloqueadas temporalmente para este expediente por observaciones pendientes de cumplir.",
      },
      400
    );
  }

  const nextReviewStatus = type === "REVISION_SOLA" ? "REVISION_SOLICITADA" : "APROBACION_SOLICITADA";
  const now = new Date().toISOString();

  await c.env.DB.prepare("UPDATE cases SET review_status = ?, updated_at = ? WHERE id = ?")
    .bind(nextReviewStatus, now, id)
    .run();

  if (caseRow.manager_id && caseRow.manager_id !== "unassigned") {
    await createNotification(
      c.env.DB,
      caseRow.manager_id,
      "Solicitud de Revisión de Etapa",
      `El asesor ${requester.name} ha solicitado la ${type === "REVISION_SOLA" ? "revisión" : "revisión y aprobación"} de la etapa actual en el expediente ${caseRow.code}.`,
      "INFO",
      id
    );
  }

  await logAudit(
    c.env,
    requester,
    "REVIEW_REQUESTED",
    "CASE",
    id,
    `Solicitó revisión de etapa: ${type}`,
    id
  );
  const refreshed = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
  return c.json({ success: true, case: mapCaseRow(refreshed) });
});

caseRoutes.post("/cases/:id/cancel-review", requireAuth, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const caseRow = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
  if (!caseRow) return c.json({ message: "Expediente no encontrado." }, 404);
  if (!canReadCase(requester, caseRow)) {
    return c.json({ message: "No tienes acceso a este expediente." }, 403);
  }

  const prevStatus = caseRow.review_status;
  const now = new Date().toISOString();
  await c.env.DB.prepare("UPDATE cases SET review_status = NULL, updated_at = ? WHERE id = ?")
    .bind(now, id)
    .run();

  if (caseRow.manager_id && caseRow.manager_id !== "unassigned") {
    await createNotification(
      c.env.DB,
      caseRow.manager_id,
      "Solicitud de Revisión Cancelada",
      `El asesor ${requester.name} ha cancelado la solicitud de revisión activa en el expediente ${caseRow.code}.`,
      "INFO",
      id
    );
  }

  await logAudit(
    c.env,
    requester,
    "REVIEW_CANCELED",
    "CASE",
    id,
    `Canceló la solicitud de revisión (Estado previo: ${prevStatus})`,
    id
  );
  const refreshed = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
  return c.json({ success: true, case: mapCaseRow(refreshed) });
});

caseRoutes.post("/cases/:id/toggle-review-block", requireAuth, requireManagerOrAdmin, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const access = await checkAndAssignManager(c.env, id, requester);
  if (!access.allowed) return c.json({ message: access.message }, 403);

  const body = await c.req.json().catch(() => ({}));
  const blocked = Boolean(body.blocked);
  const reason = String(body.reason || "Observaciones pendientes en la etapa actual.");
  const now = new Date().toISOString();

  const caseRow = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
  if (!caseRow) return c.json({ message: "Expediente no encontrado." }, 404);

  if (blocked) {
    await c.env.DB.prepare(
      "UPDATE cases SET review_button_blocked = 1, review_button_blocked_reason = ?, review_status = NULL, updated_at = ? WHERE id = ?"
    )
      .bind(reason, now, id)
      .run();
  } else {
    await c.env.DB.prepare(
      "UPDATE cases SET review_button_blocked = 0, review_button_blocked_reason = NULL, updated_at = ? WHERE id = ?"
    )
      .bind(now, id)
      .run();
  }

  await createNotification(
    c.env.DB,
    caseRow.advisor_id,
    blocked ? "Solicitudes de Revisión Bloqueadas" : "Solicitudes de Revisión Habilitadas",
    blocked
      ? `El manager/director ha bloqueado tus solicitudes de revisión en el expediente ${caseRow.code}. Motivo: ${reason}`
      : `El manager/director ha habilitado tus solicitudes de revisión en el expediente ${caseRow.code}.`,
    blocked ? "DANGER" : "SUCCESS",
    id
  );

  await logAudit(
    c.env,
    requester,
    blocked ? "REVIEW_BLOCKED" : "REVIEW_UNBLOCKED",
    "CASE",
    id,
    blocked ? `Bloqueó botón de revisión. Motivo: ${reason}` : "Desbloqueó botón de revisión",
    id
  );

  const refreshed = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
  return c.json({ success: true, case: mapCaseRow(refreshed) });
});

caseRoutes.post("/cases/:id/resolve-review", requireAuth, requireManagerOrAdmin, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const access = await checkAndAssignManager(c.env, id, requester);
  if (!access.allowed) return c.json({ message: access.message }, 403);

  const body = await c.req.json().catch(() => ({}));
  const action = body.action;
  const now = new Date().toISOString();

  const caseRow = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
  if (!caseRow) return c.json({ message: "Expediente no encontrado." }, 404);
  const prevStatus = caseRow.review_status;

  if (action === "APROBAR") {
    if (prevStatus === "APROBACION_SOLICITADA") {
      const hydrated = await getHydratedCase(c.env.DB, id);
      if (hydrated?.currentStage) {
        const stagesOrdered = hydrated.stages.slice().sort((a: any, b: any) => a.order - b.order);
        const currentIdx = stagesOrdered.findIndex((s: any) => s.id === hydrated.currentStage.id);

        if (currentIdx === stagesOrdered.length - 1) {
          await c.env.DB.prepare(
            "UPDATE cases SET status = 'FINALIZADO', review_status = 'APROBADO', review_button_blocked = 0, updated_at = ? WHERE id = ?"
          )
            .bind(now, id)
            .run();
          await logAudit(
            c.env,
            requester,
            "CASE_FINISHED",
            "CASE",
            id,
            `Expediente finalizado con aprobación de etapa: ${caseRow.code}`,
            id
          );
          const refreshed = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
          return c.json({ success: true, finished: true, case: mapCaseRow(refreshed) });
        }

        const nextStage = stagesOrdered[currentIdx + 1];
        await c.env.DB.prepare(
          "UPDATE cases SET current_stage_id = ?, status = 'ACTIVO', review_status = NULL, review_button_blocked = 0, review_button_blocked_reason = NULL, updated_at = ? WHERE id = ?"
        )
          .bind(nextStage.id, now, id)
          .run();

        await provisionStageTasks(c.env.DB, id, nextStage, hydrated.partyCounts);

        await createNotification(
          c.env.DB,
          caseRow.advisor_id,
          "Expediente Aprobado y Avanzado de Etapa",
          `El manager aprobó la etapa actual. El expediente ${caseRow.code} avanzó a la etapa: '${nextStage.name}' de forma automática.`,
          "SUCCESS",
          id
        );
        await logAudit(
          c.env,
          requester,
          "STAGE_CHANGED_AUTOMATIC",
          "CASE",
          id,
          `Aprobó revisión y avanzó automáticamente a etapa '${nextStage.name}'`,
          id
        );
        const refreshed = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
        return c.json({ success: true, advanced: true, case: mapCaseRow(refreshed) });
      }
    }

    await c.env.DB.prepare(
      "UPDATE cases SET review_status = 'REVISADO', review_button_blocked = 0, review_button_blocked_reason = NULL, updated_at = ? WHERE id = ?"
    )
      .bind(now, id)
      .run();
    await createNotification(
      c.env.DB,
      caseRow.advisor_id,
      "Revisión de Etapa Aprobada",
      `El manager aprobó la revisión de la etapa actual en el expediente ${caseRow.code}.`,
      "SUCCESS",
      id
    );
    await logAudit(
      c.env,
      requester,
      "REVIEW_APPROVED",
      "CASE",
      id,
      `Aprobó revisión de la etapa actual (sin avance automático).`,
      id
    );
  } else {
    await c.env.DB.prepare(
      "UPDATE cases SET review_status = NULL, status = 'OBSERVADO', review_button_blocked = 1, review_button_blocked_reason = 'Revisión rechazada por observaciones pendientes.', updated_at = ? WHERE id = ?"
    )
      .bind(now, id)
      .run();
    await createNotification(
      c.env.DB,
      caseRow.advisor_id,
      "Revisión de Etapa Rechazada / Observada",
      `Se ha rechazado la revisión de la etapa en el expediente ${caseRow.code}. El botón de revisión ha sido bloqueado hasta que corrijas las observaciones.`,
      "DANGER",
      id
    );
    await logAudit(
      c.env,
      requester,
      "REVIEW_REJECTED",
      "CASE",
      id,
      `Rechazó revisión de etapa y bloqueó botón de revisión.`,
      id
    );
  }

  const refreshed = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
  return c.json({ success: true, case: mapCaseRow(refreshed) });
});

// Stage Advance with Strict Blocking Checks
caseRoutes.post("/cases/:id/stage/advance", requireAuth, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const access = await checkAndAssignManager(c.env, id, requester);
  if (!access.allowed) return c.json({ message: access.message }, 403);

  const hydrated = await getHydratedCase(c.env.DB, id);
  if (!hydrated || !hydrated.currentStage) {
    return c.json({ message: "No se pudo hidratar la información del expediente." }, 404);
  }

  const { currentStage, requirements, observations } = hydrated;
  const stagesOrdered = hydrated.stages.slice().sort((a: any, b: any) => a.order - b.order);
  const currentIdx = stagesOrdered.findIndex((s: any) => s.id === currentStage.id);
  const now = new Date().toISOString();

  // Check stage requirements even on last stage before finalizing
  const missingDocs = requirements.filter((r: any) => r.required && r.type === "DOCUMENT" && !r.document);
  const rejectedDocs = requirements.filter((r: any) => r.document && r.document.status === "RECHAZADO");
  const reviewingDocs = requirements.filter((r: any) => r.document && r.document.status === "EN_REVISION");
  const pendingTasks = requirements.filter(
    (r: any) => r.required && (r.type === "TASK" || r.type === "FORM") && (!r.task || r.task.status !== "COMPLETA")
  );
  const openObs = observations.filter((o: any) => o.status === "ABIERTA");

  if (missingDocs.length > 0 || rejectedDocs.length > 0 || pendingTasks.length > 0 || openObs.length > 0) {
    return c.json(
      {
        error: true,
        code: "BLOCK_ADVANCE_REQUIREMENTS_PENDING",
        message: "No es posible avanzar el expediente. Existen requisitos pendientes en la etapa actual.",
        details: {
          missingDocs: missingDocs.map((doc: any) => doc.name),
          rejectedDocs: rejectedDocs.map((doc: any) => doc.name),
          reviewingDocs: reviewingDocs.map((doc: any) => doc.name),
          pendingTasks: pendingTasks.map((t: any) => t.name),
          openObservations: openObs.map((o: any) => o.message),
        },
      },
      400
    );
  }

  if (reviewingDocs.length > 0) {
    return c.json(
      {
        error: true,
        code: "BLOCK_ADVANCE_REVISION_PENDING",
        message:
          "No es posible avanzar el expediente. Hay documentos cargados pendientes de revisión y aprobación por el Manager.",
        details: {
          reviewingDocs: reviewingDocs.map((doc: any) => doc.name),
        },
      },
      400
    );
  }

  if (currentIdx === stagesOrdered.length - 1) {
    await c.env.DB.prepare("UPDATE cases SET status = 'FINALIZADO', updated_at = ? WHERE id = ?")
      .bind(now, id)
      .run();
    await logAudit(
      c.env,
      requester,
      "CASE_FINISHED",
      "CASE",
      id,
      `Expediente finalizado con éxito: ${hydrated.code}`,
      id
    );
    return c.json({ success: true, finished: true, currentStageId: hydrated.currentStageId });
  }

  const nextStage = stagesOrdered[currentIdx + 1];
  await c.env.DB.prepare(
    "UPDATE cases SET current_stage_id = ?, status = 'ACTIVO', review_status = NULL, updated_at = ? WHERE id = ?"
  )
    .bind(nextStage.id, now, id)
    .run();

  await provisionStageTasks(c.env.DB, id, nextStage, hydrated.partyCounts);

  await createNotification(
    c.env.DB,
    hydrated.advisorId,
    "Expediente Avanzado de Etapa",
    `El expediente ${hydrated.code} avanzó a la etapa: '${nextStage.name}'`,
    "SUCCESS",
    id
  );
  await logAudit(
    c.env,
    requester,
    "STAGE_CHANGED",
    "CASE",
    id,
    `Avanzó etapa de '${currentStage.name}' a '${nextStage.name}'`,
    id
  );

  const refreshed = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
  return c.json({ success: true, case: mapCaseRow(refreshed), nextStage });
});

caseRoutes.post("/cases/:id/stage/retrocede", requireAuth, requireManagerOrAdmin, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const access = await checkAndAssignManager(c.env, id, requester);
  if (!access.allowed) return c.json({ message: access.message }, 403);

  const hydrated = await getHydratedCase(c.env.DB, id);
  if (!hydrated || !hydrated.currentStage) {
    return c.json({ message: "Error al cargar legajo." }, 404);
  }

  const stagesOrdered = hydrated.stages.slice().sort((a: any, b: any) => a.order - b.order);
  const currentIdx = stagesOrdered.findIndex((s: any) => s.id === hydrated.currentStage.id);
  if (currentIdx === 0) {
    return c.json({ message: "Se encuentra en la primera etapa." }, 400);
  }

  const prevStage = stagesOrdered[currentIdx - 1];
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "UPDATE cases SET current_stage_id = ?, status = 'ACTIVO', updated_at = ? WHERE id = ?"
  )
    .bind(prevStage.id, now, id)
    .run();

  await createNotification(
    c.env.DB,
    hydrated.advisorId,
    "Expediente Regresó de Etapa",
    `El expediente ${hydrated.code} retrocedió a la etapa: '${prevStage.name}'`,
    "WARNING",
    id
  );
  await logAudit(
    c.env,
    requester,
    "STAGE_RETROCEDED",
    "CASE",
    id,
    `Retrocedió etapa de '${hydrated.currentStage.name}' a '${prevStage.name}'`,
    id
  );

  const refreshed = await c.env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first<any>();
  return c.json({ success: true, case: mapCaseRow(refreshed), prevStage });
});
