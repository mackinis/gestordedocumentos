/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { analyzeDocumentWithAI } from "./ai";
import { createNotification, logAudit } from "./db";
import type { Env, QueueTaskMessage } from "./types";

export async function handleQueueBatch(
  batch: MessageBatch<QueueTaskMessage>,
  env: Env
): Promise<void> {
  for (const msg of batch.messages) {
    const payload = msg.body;
    try {
      if (payload.type === "DOCUMENT_ANALYZE") {
        const obj = await env.BUCKET.get(payload.r2Key);
        if (!obj) {
          msg.ack();
          continue;
        }
        const docRow = await env.DB.prepare("SELECT name, case_id FROM documents WHERE id = ?")
          .bind(payload.docId)
          .first<{ name: string; case_id: string }>();
        const reqName = docRow?.name || payload.fileName;

        const buffer = await obj.arrayBuffer();
        const analysis = await analyzeDocumentWithAI(
          env,
          payload.fileName,
          payload.fileType,
          new Uint8Array(buffer),
          reqName
        );

        await env.DB.prepare("UPDATE documents SET ai_analysis_json = ? WHERE id = ?")
          .bind(JSON.stringify(analysis), payload.docId)
          .run();

        const caseRow = await env.DB.prepare("SELECT code, manager_id, advisor_id FROM cases WHERE id = ?")
          .bind(payload.caseId)
          .first<{ code: string; manager_id: string; advisor_id: string }>();

        if (caseRow && caseRow.manager_id && caseRow.manager_id !== "unassigned") {
          await createNotification(
            env.DB,
            caseRow.manager_id,
            "Análisis IA Completado",
            `Workers AI finalizó el análisis preliminar de '${reqName}' en el expediente ${caseRow.code}.`,
            "INFO",
            payload.caseId
          );
        }

        await logAudit(
          env,
          payload.requestedBy,
          "DOCUMENT_AI_ANALYZED",
          "DOCUMENT",
          payload.docId,
          `Análisis automático completado por Cloudflare Workers AI (${analysis.modelUsed}) para '${reqName}'.`,
          payload.caseId
        );
        msg.ack();
      } else if (payload.type === "NOTIFICATION_FANOUT") {
        for (const userId of payload.userIds) {
          await createNotification(
            env.DB,
            userId,
            payload.title,
            payload.message,
            payload.notifType,
            payload.caseId || null
          );
        }
        msg.ack();
      } else if (payload.type === "AUDIT_ENRICH") {
        // Hook disponible para enriquecimiento futuro de auditoría asíncrona en D1
        msg.ack();
      } else {
        msg.ack();
      }
    } catch (err: any) {
      console.error(`[Queue Error] Fallo procesando mensaje ${payload.type}:`, err?.message || err);
      // En entorno local sin sesión remota de Workers AI no reintentar indefinidamente
      const errMsg = String(err?.message || "").toLowerCase();
      if (errMsg.includes("not logged in") || errMsg.includes("authentication") || errMsg.includes("remote")) {
        msg.ack();
      } else {
        msg.retry();
      }
    }
  }
}
