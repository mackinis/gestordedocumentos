/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = "ADMIN" | "MANAGER" | "ASESOR";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  phone?: string;
  address?: string;
  status: string;
  canCreateCases: boolean;
  createdAt?: string;
}

export interface SessionPayload {
  sub: string;
  jti: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export type QueueTaskMessage =
  | {
      type: "DOCUMENT_ANALYZE";
      caseId: string;
      docId: string;
      r2Key: string;
      fileName: string;
      fileType: string;
      requestedBy: string;
    }
  | {
      type: "NOTIFICATION_FANOUT";
      userIds: string[];
      title: string;
      message: string;
      notifType: "INFO" | "SUCCESS" | "WARNING" | "DANGER";
      caseId?: string;
    }
  | {
      type: "AUDIT_ENRICH";
      auditId: string;
      action: string;
      entityType: string;
      entityId: string;
    };

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  KV: KVNamespace;
  AI: Ai;
  TASKS_QUEUE?: Queue<QueueTaskMessage>;
  ASSETS: Fetcher;
  SEND_EMAIL?: {
    send: (message: unknown) => Promise<void>;
  };
  APP_ENV?: string;
  VERIFICATION_MODE?: string;
  SESSION_SECRET?: string;
  BOOTSTRAP_ADMIN_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}

export interface HonoVariables {
  user: AuthUser;
  sessionId: string;
}
