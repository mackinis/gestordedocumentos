/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Hono } from "hono";
import { requireAdmin, requireAuth } from "./auth";
import { decodeBase64ToBytes } from "../ai";
import { getSystemSettings, safeJsonParse, saveSystemSettings } from "../db";
import type { Env, HonoVariables } from "../types";

export const communicationRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

function mapMessageRow(m: any) {
  return {
    id: m.id,
    senderId: m.sender_id,
    senderName: m.sender_name,
    senderRole: m.sender_role,
    recipientId: m.recipient_id,
    recipientName: m.recipient_name,
    recipientRole: m.recipient_role,
    subject: m.subject,
    body: m.body,
    attachments: safeJsonParse<any[]>(m.attachments_json, []),
    createdAt: m.created_at,
    read: Boolean(m.read),
    senderTrash: Boolean(m.sender_trash),
    recipientTrash: Boolean(m.recipient_trash),
    senderDeleted: Boolean(m.sender_deleted),
    recipientDeleted: Boolean(m.recipient_deleted),
    parentMessageId: m.parent_message_id || null,
  };
}

function mapNotificationRow(n: any) {
  return {
    id: n.id,
    userId: n.user_id,
    title: n.title,
    message: n.message,
    type: n.type,
    read: Boolean(n.read),
    archived: Boolean(n.archived),
    createdAt: n.created_at,
    caseId: n.case_id || undefined,
  };
}

// Notifications
communicationRoutes.get("/notifications", requireAuth, async (c) => {
  const requester = c.get("user");
  let rows: any[] = [];

  if (requester.role === "ADMIN") {
    const res = await c.env.DB.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 300").all<any>();
    rows = res.results || [];
  } else if (requester.role === "MANAGER") {
    const res = await c.env.DB.prepare(
      `SELECT n.* FROM notifications n
       LEFT JOIN users u ON u.id = n.user_id
       WHERE n.user_id = ? OR u.role = 'ASESOR'
       ORDER BY n.created_at DESC LIMIT 250`
    )
      .bind(requester.id)
      .all<any>();
    rows = res.results || [];
  } else {
    const res = await c.env.DB.prepare(
      "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 200"
    )
      .bind(requester.id)
      .all<any>();
    rows = res.results || [];
  }

  return c.json(rows.map(mapNotificationRow));
});

communicationRoutes.post("/notifications/read-all", requireAuth, async (c) => {
  const requester = c.get("user");
  if (requester.role === "ADMIN") {
    await c.env.DB.prepare("UPDATE notifications SET read = 1").run();
  } else if (requester.role === "MANAGER") {
    await c.env.DB.prepare(
      `UPDATE notifications SET read = 1
       WHERE user_id = ? OR user_id IN (SELECT id FROM users WHERE role = 'ASESOR')`
    )
      .bind(requester.id)
      .run();
  } else {
    await c.env.DB.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").bind(requester.id).run();
  }
  return c.json({ success: true });
});

communicationRoutes.post("/notifications/:id/read", requireAuth, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const row = await c.env.DB.prepare("SELECT * FROM notifications WHERE id = ?").bind(id).first<any>();
  if (!row) {
    return c.json({ message: "Notificación no encontrada" }, 404);
  }
  if (requester.role !== "ADMIN" && row.user_id !== requester.id) {
    const targetUser = await c.env.DB.prepare("SELECT role FROM users WHERE id = ?")
      .bind(row.user_id)
      .first<{ role: string }>();
    if (!(requester.role === "MANAGER" && targetUser?.role === "ASESOR")) {
      return c.json({ message: "No autorizado" }, 403);
    }
  }
  await c.env.DB.prepare("UPDATE notifications SET read = 1 WHERE id = ?").bind(id).run();
  return c.json(mapNotificationRow({ ...row, read: 1 }));
});

communicationRoutes.post("/notifications/:id/archive", requireAuth, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const body = await c.req.json().catch(() => ({}));
  const archived = body.archived !== undefined ? Boolean(body.archived) : true;

  const row = await c.env.DB.prepare("SELECT * FROM notifications WHERE id = ?").bind(id).first<any>();
  if (!row) {
    return c.json({ message: "Notificación no encontrada" }, 404);
  }
  if (requester.role !== "ADMIN" && row.user_id !== requester.id) {
    const targetUser = await c.env.DB.prepare("SELECT role FROM users WHERE id = ?")
      .bind(row.user_id)
      .first<{ role: string }>();
    if (!(requester.role === "MANAGER" && targetUser?.role === "ASESOR")) {
      return c.json({ message: "No autorizado" }, 403);
    }
  }

  await c.env.DB.prepare("UPDATE notifications SET archived = ? WHERE id = ?")
    .bind(archived ? 1 : 0, id)
    .run();
  return c.json(mapNotificationRow({ ...row, archived: archived ? 1 : 0 }));
});

communicationRoutes.delete("/notifications/:id", requireAuth, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const row = await c.env.DB.prepare("SELECT * FROM notifications WHERE id = ?").bind(id).first<any>();
  if (!row) {
    return c.json({ message: "Notificación no encontrada" }, 404);
  }

  let allowed = requester.role === "ADMIN" || row.user_id === requester.id;
  if (!allowed && requester.role === "MANAGER") {
    const targetUser = await c.env.DB.prepare("SELECT role FROM users WHERE id = ?")
      .bind(row.user_id)
      .first<{ role: string }>();
    if (targetUser?.role === "ASESOR") allowed = true;
  }
  if (!allowed) {
    return c.json({ message: "No autorizado para eliminar esta notificación" }, 403);
  }

  await c.env.DB.prepare("DELETE FROM notifications WHERE id = ?").bind(id).run();
  return c.json({ success: true, id });
});

// Messaging Settings (Admin only)
communicationRoutes.get("/admin/messaging-settings", requireAuth, requireAdmin, async (c) => {
  const settings = await getSystemSettings(c.env.DB, c.env.KV);
  return c.json(settings.messagingSettings);
});

communicationRoutes.post("/admin/messaging-settings", requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const current = await getSystemSettings(c.env.DB, c.env.KV);

  const nextMessaging = {
    allowedSenders: body.allowedSenders || current.messagingSettings.allowedSenders,
    awaitReplyRule:
      body.awaitReplyRule !== undefined
        ? Boolean(body.awaitReplyRule)
        : current.messagingSettings.awaitReplyRule,
    allowedChannels: body.allowedChannels || current.messagingSettings.allowedChannels,
  };

  await saveSystemSettings(
    c.env.DB,
    { ...current, messagingSettings: nextMessaging },
    c.env.KV
  );
  return c.json({ success: true, messagingSettings: nextMessaging });
});

// Messages
communicationRoutes.get("/messages", requireAuth, async (c) => {
  const requester = c.get("user");
  const box = c.req.query("box") || "inbox";
  let rows: any[] = [];

  if (box === "sent") {
    const res = await c.env.DB.prepare(
      "SELECT * FROM messages WHERE sender_id = ? AND sender_trash = 0 AND sender_deleted = 0 ORDER BY created_at DESC LIMIT 200"
    )
      .bind(requester.id)
      .all<any>();
    rows = res.results || [];
  } else if (box === "trash") {
    const res = await c.env.DB.prepare(
      `SELECT * FROM messages
       WHERE (sender_id = ? AND sender_trash = 1 AND sender_deleted = 0)
          OR (recipient_id = ? AND recipient_trash = 1 AND recipient_deleted = 0)
       ORDER BY created_at DESC LIMIT 200`
    )
      .bind(requester.id, requester.id)
      .all<any>();
    rows = res.results || [];
  } else {
    const res = await c.env.DB.prepare(
      "SELECT * FROM messages WHERE recipient_id = ? AND recipient_trash = 0 AND recipient_deleted = 0 ORDER BY created_at DESC LIMIT 200"
    )
      .bind(requester.id)
      .all<any>();
    rows = res.results || [];
  }

  return c.json(rows.map(mapMessageRow));
});

communicationRoutes.post("/messages", requireAuth, async (c) => {
  const requester = c.get("user");
  const settings = await getSystemSettings(c.env.DB, c.env.KV);
  const mSettings = settings.messagingSettings;

  if (!mSettings.allowedSenders.includes(requester.role)) {
    return c.json({ message: "Tu rol no tiene permitido enviar mensajes en la plataforma." }, 403);
  }

  const bodyJson = await c.req.json().catch(() => ({}));
  const recipientId = String(bodyJson.recipientId || "");
  const subject = String(bodyJson.subject || "(Sin Asunto)");
  const body = String(bodyJson.body || "");
  const rawAttachments = Array.isArray(bodyJson.attachments) ? bodyJson.attachments : [];
  const parentMessageId = bodyJson.parentMessageId ? String(bodyJson.parentMessageId) : null;

  const recipient = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(recipientId)
    .first<any>();
  if (!recipient) {
    return c.json({ message: "El usuario destinatario no existe." }, 404);
  }

  const channel = (mSettings.allowedChannels || []).find(
    (ch: any) => ch.from === requester.role && ch.to === recipient.role
  );
  if (!channel || !channel.enabled) {
    return c.json(
      {
        message: `La mensajería entre el rol ${requester.role} y ${recipient.role} no está habilitada.`,
      },
      403
    );
  }

  if (mSettings.awaitReplyRule) {
    const latest = await c.env.DB.prepare(
      `SELECT sender_id FROM messages
       WHERE sender_deleted = 0 AND recipient_deleted = 0
         AND ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))
       ORDER BY created_at DESC LIMIT 1`
    )
      .bind(requester.id, recipientId, recipientId, requester.id)
      .first<{ sender_id: string }>();

    if (latest && latest.sender_id === requester.id) {
      return c.json(
        {
          message:
            "Norma de Respuesta Requerida activa: Debes esperar a recibir una respuesta de este usuario antes de poder enviarle otro mensaje.",
        },
        400
      );
    }
  }

  const msgId = `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const now = new Date().toISOString();
  const storedAttachments: any[] = [];

  for (let idx = 0; idx < rawAttachments.length; idx++) {
    const att = rawAttachments[idx];
    const safeName = String(att.name || `adjunto-${idx}`).replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileType = String(att.type || "application/octet-stream");
    const size = String(att.size || "");
    const rawUrl = String(att.fileUrl || "");

    if (rawUrl.startsWith("data:")) {
      const bytes = decodeBase64ToBytes(rawUrl);
      const r2Key = `messages/${msgId}/${idx}-${safeName}`;
      await c.env.BUCKET.put(r2Key, bytes, {
        httpMetadata: { contentType: fileType },
        customMetadata: { msgId, uploadedBy: requester.id },
      });
      storedAttachments.push({
        name: att.name || safeName,
        type: fileType,
        size,
        r2Key,
        fileUrl: `/api/messages/${msgId}/attachments/${idx}`,
      });
    } else {
      storedAttachments.push({
        name: att.name || safeName,
        type: fileType,
        size,
        fileUrl: rawUrl,
      });
    }
  }

  await c.env.DB.prepare(
    `INSERT INTO messages (
      id, sender_id, sender_name, sender_role,
      recipient_id, recipient_name, recipient_role,
      subject, body, attachments_json, created_at,
      read, sender_trash, recipient_trash, sender_deleted, recipient_deleted, parent_message_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?)`
  )
    .bind(
      msgId,
      requester.id,
      requester.name,
      requester.role,
      recipient.id,
      recipient.name,
      recipient.role,
      subject,
      body,
      JSON.stringify(storedAttachments),
      now,
      parentMessageId
    )
    .run();

  await c.env.DB.prepare(
    `INSERT INTO notifications (id, user_id, title, message, type, read, archived, created_at, case_id)
     VALUES (?, ?, ?, ?, 'INFO', 0, 0, ?, NULL)`
  )
    .bind(
      `not-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      recipient.id,
      `Nuevo mensaje de ${requester.name}`,
      `Has recibido un nuevo mensaje: "${subject}"`,
      now
    )
    .run();

  return c.json(
    {
      id: msgId,
      senderId: requester.id,
      senderName: requester.name,
      senderRole: requester.role,
      recipientId: recipient.id,
      recipientName: recipient.name,
      recipientRole: recipient.role,
      subject,
      body,
      attachments: storedAttachments,
      createdAt: now,
      read: false,
      senderTrash: false,
      recipientTrash: false,
      senderDeleted: false,
      recipientDeleted: false,
      parentMessageId,
    },
    201
  );
});

// Download R2 message attachment with strict sender/recipient authorization
communicationRoutes.get("/messages/:id/attachments/:idx", requireAuth, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const idx = parseInt(c.req.param("idx") || "-1", 10);

  const row = await c.env.DB.prepare("SELECT * FROM messages WHERE id = ?").bind(id).first<any>();
  if (!row) {
    return c.text("Mensaje no encontrado", 404);
  }
  if (
    requester.role !== "ADMIN" &&
    row.sender_id !== requester.id &&
    row.recipient_id !== requester.id
  ) {
    return c.text("No autorizado", 403);
  }

  const attachments = safeJsonParse<any[]>(row.attachments_json, []);
  const att = Number.isFinite(idx) ? attachments[idx] : undefined;
  if (!att || !att.r2Key) {
    return c.text("Adjunto no encontrado", 404);
  }

  const obj = await c.env.BUCKET.get(att.r2Key);
  if (!obj) {
    return c.text("Archivo no encontrado en R2", 404);
  }

  const headers = new Headers();
  headers.set("Content-Type", att.type || obj.httpMetadata?.contentType || "application/octet-stream");
  headers.set(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(att.name || "adjunto")}"`
  );
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(obj.body, { status: 200, headers });
});

communicationRoutes.post("/messages/:id/read", requireAuth, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const row = await c.env.DB.prepare("SELECT * FROM messages WHERE id = ?").bind(id).first<any>();
  if (!row) {
    return c.json({ message: "Mensaje no encontrado" }, 404);
  }
  if (requester.role !== "ADMIN" && row.recipient_id !== requester.id && row.sender_id !== requester.id) {
    return c.json({ message: "No autorizado" }, 403);
  }
  await c.env.DB.prepare("UPDATE messages SET read = 1 WHERE id = ?").bind(id).run();
  return c.json(mapMessageRow({ ...row, read: 1 }));
});

communicationRoutes.post("/messages/:id/trash", requireAuth, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const row = await c.env.DB.prepare("SELECT * FROM messages WHERE id = ?").bind(id).first<any>();
  if (!row) {
    return c.json({ message: "Mensaje no encontrado" }, 404);
  }

  const sTrash = row.sender_id === requester.id ? 1 : row.sender_trash;
  const rTrash = row.recipient_id === requester.id ? 1 : row.recipient_trash;

  await c.env.DB.prepare("UPDATE messages SET sender_trash = ?, recipient_trash = ? WHERE id = ?")
    .bind(sTrash, rTrash, id)
    .run();

  return c.json(mapMessageRow({ ...row, sender_trash: sTrash, recipient_trash: rTrash }));
});

communicationRoutes.post("/messages/:id/restore", requireAuth, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const row = await c.env.DB.prepare("SELECT * FROM messages WHERE id = ?").bind(id).first<any>();
  if (!row) {
    return c.json({ message: "Mensaje no encontrado" }, 404);
  }

  const sTrash = row.sender_id === requester.id ? 0 : row.sender_trash;
  const rTrash = row.recipient_id === requester.id ? 0 : row.recipient_trash;

  await c.env.DB.prepare("UPDATE messages SET sender_trash = ?, recipient_trash = ? WHERE id = ?")
    .bind(sTrash, rTrash, id)
    .run();

  return c.json(mapMessageRow({ ...row, sender_trash: sTrash, recipient_trash: rTrash }));
});

communicationRoutes.delete("/messages/:id", requireAuth, async (c) => {
  const requester = c.get("user");
  const id = c.req.param("id") || "";
  const row = await c.env.DB.prepare("SELECT * FROM messages WHERE id = ?").bind(id).first<any>();
  if (!row) {
    return c.json({ message: "Mensaje no encontrado" }, 404);
  }

  const sDel = row.sender_id === requester.id ? 1 : row.sender_deleted;
  const rDel = row.recipient_id === requester.id ? 1 : row.recipient_deleted;

  await c.env.DB.prepare("UPDATE messages SET sender_deleted = ?, recipient_deleted = ? WHERE id = ?")
    .bind(sDel, rDel, id)
    .run();

  return c.json({ success: true });
});
