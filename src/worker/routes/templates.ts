/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Hono } from "hono";
import { requireAuth, requireManagerOrAdmin } from "./auth";
import {
  decodeBase64ToBytes,
  generateCustomTabContentWithAI,
  generateTemplateWithAI,
  parsePdfTemplateWithAI,
} from "../ai";
import { getHydratedCase, logAudit, safeJsonParse } from "../db";
import type { Env, HonoVariables } from "../types";

export const templateRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

function mapTemplateRow(t: any) {
  return {
    id: t.id,
    name: t.name,
    category: t.category,
    description: t.description || "",
    createdBy: t.created_by,
    isPublic: Boolean(t.is_public),
    stages: safeJsonParse<any[]>(t.stages_json, []),
    createdAt: t.created_at,
  };
}

templateRoutes.get("/templates", requireAuth, async (c) => {
  const user = c.get("user");
  const rows = await c.env.DB.prepare("SELECT * FROM templates ORDER BY created_at DESC").all<any>();
  const all = (rows.results || []).map(mapTemplateRow);
  if (user.role === "ADMIN") {
    return c.json(all);
  }
  return c.json(all.filter((t) => t.isPublic || t.createdBy === user.id));
});

templateRoutes.post("/templates", requireAuth, requireManagerOrAdmin, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const { name, category, description, stages, isPublic } = body;

  if (!name || !Array.isArray(stages) || stages.length === 0) {
    return c.json({ message: "Nombre y al menos una etapa son obligatorios." }, 400);
  }

  const tplId = `tpl-${Date.now()}`;
  const now = new Date().toISOString();
  const normalizedStages = stages.map((s: any, idx: number) => {
    const stageId = s.id || `stg-${Date.now()}-${idx}`;
    return {
      id: stageId,
      templateId: tplId,
      name: s.name || `Etapa ${idx + 1}`,
      description: s.description || "",
      order: idx + 1,
      requirements: (s.requirements || []).map((r: any, rIdx: number) => ({
        id: r.id || `req-${Date.now()}-${idx}-${rIdx}`,
        stageId,
        type: r.type || "DOCUMENT",
        name: r.name || `Requisito ${rIdx + 1}`,
        description: r.description || "",
        required: r.required === undefined ? true : Boolean(r.required),
        formFields: Array.isArray(r.formFields) ? r.formFields : [],
      })),
    };
  });

  const publicFlag = isPublic === undefined ? 1 : isPublic ? 1 : 0;

  await c.env.DB.prepare(
    `INSERT INTO templates (id, name, category, description, created_by, is_public, stages_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      tplId,
      String(name).trim(),
      String(category || "General").trim(),
      String(description || ""),
      user.id,
      publicFlag,
      JSON.stringify(normalizedStages),
      now
    )
    .run();

  await logAudit(
    c.env,
    user,
    "TEMPLATE_CREATED",
    "TEMPLATE",
    tplId,
    `Plantilla de proceso creada por ${user.name}: ${name} (${category || "General"}) [Pública: ${Boolean(publicFlag)}]`
  );

  return c.json({
    id: tplId,
    name: String(name).trim(),
    category: String(category || "General").trim(),
    description: String(description || ""),
    createdBy: user.id,
    isPublic: Boolean(publicFlag),
    stages: normalizedStages,
    createdAt: now,
  });
});

templateRoutes.delete("/templates/:id", requireAuth, requireManagerOrAdmin, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id") || "";
  const existing = await c.env.DB.prepare("SELECT * FROM templates WHERE id = ?").bind(id).first<any>();
  if (!existing) {
    return c.json({ message: "Plantilla no encontrada" }, 404);
  }
  if (user.role !== "ADMIN" && existing.created_by && existing.created_by !== user.id) {
    return c.json({ message: "Solo puedes eliminar plantillas creadas por ti o como Director General." }, 403);
  }

  await c.env.DB.prepare("DELETE FROM templates WHERE id = ?").bind(id).run();
  await logAudit(
    c.env,
    user,
    "TEMPLATE_DELETED",
    "TEMPLATE",
    id,
    `Plantilla de proceso eliminada: ${existing.name}`
  );
  return c.json({ success: true });
});

templateRoutes.post("/templates/generate-ai", requireAuth, requireManagerOrAdmin, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const sector = String(body.sector || "General");
    const requirementsDescription = String(body.requirementsDescription || "");

    const template = await generateTemplateWithAI(c.env, sector, requirementsDescription);
    return c.json(template);
  } catch (err: any) {
    return c.json(
      {
        error: true,
        message: `No se pudo generar la plantilla con Cloudflare Workers AI: ${err?.message || "servicio no disponible"}. Verifique la conexión del Worker con Cloudflare AI.`,
      },
      502
    );
  }
});

templateRoutes.post("/templates/parse-pdf", requireAuth, requireManagerOrAdmin, async (c) => {
  try {
    const contentType = c.req.header("Content-Type") || "";
    let fileName = "plantilla.pdf";
    let mimeType = "application/pdf";
    let bytes: Uint8Array | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await c.req.formData();
      const file = form.get("file");
      if (file instanceof File) {
        fileName = file.name || fileName;
        mimeType = file.type || mimeType;
        bytes = new Uint8Array(await file.arrayBuffer());
      }
    } else {
      const body = await c.req.json().catch(() => ({}));
      fileName = String(body.fileName || fileName);
      mimeType = String(body.fileType || mimeType);
      if (body.fileContent) {
        bytes = decodeBase64ToBytes(String(body.fileContent));
      }
    }

    if (!bytes || bytes.length === 0) {
      return c.json({ error: true, message: "No se proporcionó contenido de archivo." }, 400);
    }

    const result = await parsePdfTemplateWithAI(c.env, fileName, bytes, mimeType);
    // ManagerDashboard expects top-level { name, category, description, stages }
    return c.json(result.template);
  } catch (err: any) {
    return c.json(
      {
        error: true,
        message: err?.message || "No se pudo analizar el PDF mediante Cloudflare Workers AI.",
      },
      502
    );
  }
});

// Custom Dynamic Tabs & AI content
templateRoutes.get("/custom-tabs", requireAuth, async (c) => {
  const [tabsRes, itemsRes] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM custom_tabs ORDER BY created_at ASC").all<any>(),
    c.env.DB.prepare("SELECT * FROM custom_tab_items ORDER BY created_at ASC").all<any>(),
  ]);

  const itemsByTab = new Map<string, any[]>();
  for (const item of itemsRes.results || []) {
    const arr = itemsByTab.get(item.tab_id) || [];
    arr.push({
      id: item.id,
      title: item.title,
      content: item.content,
      createdAt: item.created_at,
    });
    itemsByTab.set(item.tab_id, arr);
  }

  const list = (tabsRes.results || []).map((t) => ({
    id: t.id,
    name: t.name,
    icon: t.icon || "Layout",
    createdAt: t.created_at,
    items: itemsByTab.get(t.id) || [],
  }));
  return c.json(list);
});

templateRoutes.post("/custom-tabs", requireAuth, requireManagerOrAdmin, async (c) => {
  const requester = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const icon = String(body.icon || "Layout");

  if (!name) {
    return c.json({ message: "El nombre de la solapa es obligatorio." }, 400);
  }

  const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    "INSERT INTO custom_tabs (id, name, icon, created_at) VALUES (?, ?, ?, ?)"
  )
    .bind(id, name, icon, now)
    .run();

  await logAudit(
    c.env,
    requester,
    "CUSTOM_TAB_CREATED",
    "CUSTOM_TAB",
    id,
    `Solapa personalizada creada por ${requester.name}: ${name}`
  );

  return c.json({ id, name, icon, createdAt: now, items: [] });
});

templateRoutes.delete("/custom-tabs/:id", requireAuth, requireManagerOrAdmin, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const existing = await c.env.DB.prepare("SELECT * FROM custom_tabs WHERE id = ?").bind(id).first<any>();
  if (!existing) {
    return c.json({ message: "Solapa no encontrada." }, 404);
  }
  await c.env.DB.prepare("DELETE FROM custom_tabs WHERE id = ?").bind(id).run();
  await logAudit(
    c.env,
    requester,
    "CUSTOM_TAB_DELETED",
    "CUSTOM_TAB",
    id,
    `Solapa personalizada eliminada por ${requester.name}`
  );
  return c.json({ success: true, message: "Solapa eliminada con éxito." });
});

templateRoutes.post("/custom-tabs/:id/items", requireAuth, requireManagerOrAdmin, async (c) => {
  const requester = c.get("user");
  const tabId = c.req.param("id") || "";
  const tabRow = await c.env.DB.prepare("SELECT * FROM custom_tabs WHERE id = ?").bind(tabId).first<any>();
  if (!tabRow) {
    return c.json({ message: "Solapa no encontrada." }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  let finalTitle = String(body.title || "").trim();
  let finalContent = String(body.content || "");
  const useAi = Boolean(body.useAi);
  const aiPrompt = String(body.aiPrompt || finalTitle || "");

  if (useAi) {
    if (!aiPrompt.trim()) {
      return c.json({ message: "Debe especificar un tema o instrucción para Cloudflare Workers AI." }, 400);
    }
    try {
      const generated = await generateCustomTabContentWithAI(c.env, aiPrompt.trim());
      if (generated.title) finalTitle = generated.title;
      if (generated.content) finalContent = generated.content;
    } catch (aiErr: any) {
      return c.json(
        {
          message: `No se pudo generar el contenido con Cloudflare Workers AI: ${aiErr?.message || "servicio no disponible"}.`,
        },
        502
      );
    }
  }

  if (!finalTitle) {
    return c.json({ message: "El título de la sección es obligatorio." }, 400);
  }

  const itemId = `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "INSERT INTO custom_tab_items (id, tab_id, title, content, created_at) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(itemId, tabId, finalTitle, finalContent, now)
    .run();

  await logAudit(
    c.env,
    requester,
    "CUSTOM_TAB_ITEM_CREATED",
    "CUSTOM_TAB",
    tabId,
    `Sección "${finalTitle}" agregada en la solapa "${tabRow.name}"`
  );

  const itemsRes = await c.env.DB.prepare(
    "SELECT * FROM custom_tab_items WHERE tab_id = ? ORDER BY created_at ASC"
  )
    .bind(tabId)
    .all<any>();

  const tab = {
    id: tabRow.id,
    name: tabRow.name,
    icon: tabRow.icon || "Layout",
    createdAt: tabRow.created_at,
    items: (itemsRes.results || []).map((i) => ({
      id: i.id,
      title: i.title,
      content: i.content,
      createdAt: i.created_at,
    })),
  };

  return c.json({
    success: true,
    tab,
    item: { id: itemId, title: finalTitle, content: finalContent, createdAt: now },
  });
});

templateRoutes.delete("/custom-tabs/:tabId/items/:itemId", requireAuth, requireManagerOrAdmin, async (c) => {
  const requester = c.get("user");
  const tabId = c.req.param("tabId") || "";
  const itemId = c.req.param("itemId") || "";

  const tabRow = await c.env.DB.prepare("SELECT * FROM custom_tabs WHERE id = ?").bind(tabId).first<any>();
  if (!tabRow) {
    return c.json({ message: "Solapa no encontrada." }, 404);
  }
  const existingItem = await c.env.DB.prepare(
    "SELECT id FROM custom_tab_items WHERE id = ? AND tab_id = ?"
  )
    .bind(itemId, tabId)
    .first();
  if (!existingItem) {
    return c.json({ message: "Sección no encontrada en la solapa." }, 404);
  }

  await c.env.DB.prepare("DELETE FROM custom_tab_items WHERE id = ? AND tab_id = ?").bind(itemId, tabId).run();
  await logAudit(
    c.env,
    requester,
    "CUSTOM_TAB_ITEM_DELETED",
    "CUSTOM_TAB",
    tabId,
    `Sección eliminada de la solapa "${tabRow.name}"`
  );

  const itemsRes = await c.env.DB.prepare(
    "SELECT * FROM custom_tab_items WHERE tab_id = ? ORDER BY created_at ASC"
  )
    .bind(tabId)
    .all<any>();

  return c.json({
    success: true,
    tab: {
      id: tabRow.id,
      name: tabRow.name,
      icon: tabRow.icon || "Layout",
      createdAt: tabRow.created_at,
      items: (itemsRes.results || []).map((i) => ({
        id: i.id,
        title: i.title,
        content: i.content,
        createdAt: i.created_at,
      })),
    },
  });
});

// Dashboard Stats
templateRoutes.get("/dashboard/stats", requireAuth, async (c) => {
  const [casesRes, advisorsRes, obsRes, templatesRes] = await Promise.all([
    c.env.DB.prepare("SELECT id, status, advisor_id, template_id, current_stage_id FROM cases").all<any>(),
    c.env.DB.prepare("SELECT id, name, avatar_url FROM users WHERE role = 'ASESOR'").all<any>(),
    c.env.DB.prepare("SELECT * FROM observations ORDER BY created_at DESC LIMIT 5").all<any>(),
    c.env.DB.prepare("SELECT id, name, stages_json FROM templates").all<any>(),
  ]);

  const cases = casesRes.results || [];
  const active = cases.filter((x) => x.status === "ACTIVO").length;
  const pending = cases.filter((x) => x.status === "PENDIENTE").length;
  const observed = cases.filter((x) => x.status === "OBSERVADO").length;
  const finished = cases.filter((x) => x.status === "FINALIZADO").length;
  const total = cases.length;

  const casesByAdvisor = (advisorsRes.results || []).map((u) => {
    const myCases = cases.filter((x) => x.advisor_id === u.id);
    const completed = myCases.filter((x) => x.status === "FINALIZADO").length;
    const obsCount = myCases.filter((x) => x.status === "OBSERVADO").length;
    return {
      id: u.id,
      name: u.name,
      avatarUrl: u.avatar_url || "",
      totalCount: myCases.length,
      completedCount: completed,
      observedCount: obsCount,
      activeCount: myCases.length - completed,
    };
  });

  const recentObservations = (obsRes.results || []).map((o) => ({
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
  }));

  const stageDistribution = (templatesRes.results || []).map((tpl) => {
    const stages = safeJsonParse<any[]>(tpl.stages_json, []);
    const casesOfTpl = cases.filter((x) => x.template_id === tpl.id);
    return {
      templateName: tpl.name,
      distribution: stages.map((stg) => ({
        stageName: stg.name,
        count: casesOfTpl.filter((x) => x.current_stage_id === stg.id).length,
      })),
    };
  });

  return c.json({
    active,
    pending,
    observed,
    finished,
    total,
    casesByAdvisor,
    recentObservations,
    stageDistribution,
  });
});

// Pending Approvals calculation
templateRoutes.get("/dashboard/pending-approvals", requireAuth, async (c) => {
  const user = c.get("user");
  const isManager = user.role === "MANAGER";

  const [docsRes, adjRes, caseReqRes, userRegRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT d.id, c.manager_id FROM documents d
       INNER JOIN cases c ON c.id = d.case_id
       WHERE d.status = 'EN_REVISION'`
    ).all<any>(),
    c.env.DB.prepare(
      `SELECT ar.id, c.manager_id FROM adjustment_requests ar
       INNER JOIN cases c ON c.id = ar.case_id
       WHERE ar.status = 'PENDIENTE'`
    ).all<any>(),
    c.env.DB.prepare("SELECT COUNT(*) as total FROM case_requests WHERE status = 'PENDIENTE'").first<{
      total: number;
    }>(),
    c.env.DB.prepare(
      "SELECT COUNT(*) as total FROM users WHERE status IN ('VERIFIED_PENDING_APPROVAL', 'PENDING')"
    ).first<{ total: number }>(),
  ]);

  const managerVisible = (managerId: string | null) =>
    !isManager || managerId === user.id || !managerId || managerId === "unassigned";

  const docsCount = (docsRes.results || []).filter((d) => managerVisible(d.manager_id)).length;
  const adjCount = (adjRes.results || []).filter((a) => managerVisible(a.manager_id)).length;
  const caseReqCount = Number(caseReqRes?.total || 0);
  const userRegCount = Number(userRegRes?.total || 0);
  const totalCount = docsCount + adjCount + caseReqCount + userRegCount;

  return c.json({
    count: totalCount,
    hasPending: totalCount > 0,
    details: {
      documents: docsCount,
      adjustments: adjCount,
      caseRequests: caseReqCount,
      userRegistrations: userRegCount,
    },
  });
});

// Audit Logs list
templateRoutes.get("/audit-logs", requireAuth, async (c) => {
  const user = c.get("user");
  let rows: any[];

  if (user.role === "ADMIN") {
    const res = await c.env.DB.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 300").all<any>();
    rows = res.results || [];
  } else if (user.role === "MANAGER") {
    const res = await c.env.DB.prepare(
      `SELECT a.* FROM audit_logs a
       LEFT JOIN cases c ON c.id = a.case_id
       WHERE a.user_id = ? OR a.case_id IS NULL OR c.manager_id = ? OR c.manager_id = 'unassigned' OR c.manager_id IS NULL
       ORDER BY a.created_at DESC LIMIT 250`
    )
      .bind(user.id, user.id)
      .all<any>();
    rows = res.results || [];
  } else {
    const res = await c.env.DB.prepare(
      `SELECT a.* FROM audit_logs a
       LEFT JOIN cases c ON c.id = a.case_id
       WHERE a.user_id = ? OR c.advisor_id = ?
       ORDER BY a.created_at DESC LIMIT 200`
    )
      .bind(user.id, user.id)
      .all<any>();
    rows = res.results || [];
  }

  return c.json(
    rows.map((l) => ({
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
    }))
  );
});

export { getHydratedCase };
