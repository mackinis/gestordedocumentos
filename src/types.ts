/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = "ADMIN" | "MANAGER" | "ASESOR";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  phone?: string;
  address?: string;
  status?: string;
  createdAt?: string;
  canCreateCases?: boolean;
}

export interface CaseRequest {
  id: string;
  advisorId: string;
  advisorName: string;
  title: string;
  description: string;
  templateId: string;
  status: "PENDIENTE" | "CREADO" | "RECHAZADO";
  partyCounts?: {
    compradores: number;
    vendedores: number;
    garantes: number;
  };
  createdAt: string;
}

export interface ProfileChangeRequest {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  currentData: {
    name: string;
    email: string;
    phone?: string;
    address?: string;
  };
  requestedData: {
    name: string;
    email: string;
    phone?: string;
    address?: string;
  };
  status: "PENDIENTE" | "APROBADO" | "RECHAZADO";
  createdAt: string;
  resolvedAt?: string;
}

export type CaseStatus = "ACTIVO" | "OBSERVADO" | "PENDIENTE" | "FINALIZADO";

export interface Participant {
  id: string;
  caseId: string;
  role: string; // e.g. "Cliente", "Comprador", "Vendedor", "Garante", "Apoderado"
  name: string;
  apellido: string;
  dni: string;
  cuitCuil: string;
  email: string;
  telefono: string;
  observaciones?: string;
}

export type RequirementType = "DOCUMENT" | "FORM" | "TASK";

export interface FormField {
  name: string;
  label: string;
  type: "text" | "number" | "email" | "checkbox" | "textarea";
  required: boolean;
  value?: string;
}

export interface Requirement {
  id: string;
  stageId: string;
  type: RequirementType;
  name: string;
  description?: string;
  required: boolean;
  formFields?: FormField[]; // Used if type === "FORM"
}

export interface Stage {
  id: string;
  templateId: string;
  name: string;
  description?: string;
  order: number;
  requirements: Requirement[];
}

export interface ProcessTemplate {
  id: string;
  name: string;
  category: string; // e.g. "Inmobiliaria", "Legal", "Seguros", "Financiero", "RRHH"
  description: string;
  stages: Stage[];
}

export interface Case {
  id: string;
  code: string; // unique code e.g. EXP-2026-X
  title: string;
  description: string;
  templateId: string;
  status: CaseStatus;
  currentStageId: string;
  advisorId: string; // User ID (ASESOR)
  managerId: string; // User ID (MANAGER)
  stages?: Stage[];
  stagesDetermined?: boolean;
  reviewStatus?: "REVISION_SOLICITADA" | "APROBACION_SOLICITADA" | "REVISADO" | "APROBADO" | null;
  reviewButtonBlocked?: boolean;
  reviewButtonBlockedReason?: string;
  partyCounts?: {
    compradores: number;
    vendedores: number;
    garantes: number;
  };
  adjustmentRequests?: AdjustmentRequest[];
  createdAt: string;
  updatedAt: string;
}

export interface AdjustmentRequest {
  id: string;
  caseId: string;
  type: "FORM_COUNT" | "DOCUMENT_UPLOAD";
  targetParty?: "compradores" | "vendedores" | "garantes"; // for FORM_COUNT
  action?: "ADD" | "REMOVE"; // for FORM_COUNT
  quantity?: number; // for FORM_COUNT
  requirementId?: string; // for DOCUMENT_UPLOAD
  details: string; // de que se trata / justification
  status: "PENDIENTE" | "APROBADO" | "RECHAZADO";
  requestedBy: string; // User ID
  requestedByName: string; // User Name
  createdAt: string;
  processedBy?: string;
  processedByName?: string;
  processedAt?: string;
  rejectionReason?: string;
}

export type DocStatus =
  | "PENDIENTE"
  | "CARGADO"
  | "EN_REVISION"
  | "APROBADO"
  | "RECHAZADO"
  | "VENCIDO";

export interface DocumentVersion {
  version: number;
  fileName: string;
  fileUrl: string; // Base64 mock
  uploadedAt: string;
  uploadedBy: string;
}

export interface Document {
  id: string;
  caseId: string;
  requirementId: string; // link to mandatory requirement if applicable
  name: string;
  status: DocStatus;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: string;
  uploadedAt?: string;
  uploadedBy?: string;
  version: number;
  history: DocumentVersion[];
}

export type TaskStatus = "PENDIENTE" | "EN_PROGRESO" | "COMPLETA";

export interface CaseTask {
  id: string;
  caseId: string;
  requirementId: string; // link to task requirement
  name: string;
  description?: string;
  status: TaskStatus;
  completedAt?: string;
  completedBy?: string;
  // If the task corresponds to a form requirement, we can store values in a key-value format
  formValues?: Record<string, string>;
}

export type ObservationStatus = "ABIERTA" | "RESUELTA";

export interface Observation {
  id: string;
  caseId: string;
  stageId: string;
  entityId: string; // ID of Document or Task
  entityType: "DOCUMENT" | "TASK" | "GENERAL";
  message: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  status: ObservationStatus;
  response?: string;
  respondedAt?: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: "INFO" | "SUCCESS" | "WARNING" | "DANGER";
  read: boolean;
  archived?: boolean;
  createdAt: string;
  caseId?: string;
}

export interface Attachment {
  name: string;
  fileUrl: string; // Base64 or standard URL
  fileType?: string;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  recipientId: string;
  recipientName: string;
  recipientRole: string;
  subject: string;
  body: string;
  attachments?: Attachment[];
  createdAt: string;
  read: boolean;
  senderTrash?: boolean;
  recipientTrash?: boolean;
  senderDeleted?: boolean;
  recipientDeleted?: boolean;
  parentMessageId?: string;
}

export interface MessagingChannel {
  from: UserRole;
  to: UserRole;
  enabled: boolean;
}

export interface MessagingSettings {
  allowedSenders: UserRole[];
  awaitReplyRule: boolean;
  allowedChannels: MessagingChannel[];
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string; // "DOCUMENT_UPLOADED", "STAGE_CHANGED", "CASE_CREATED", etc.
  entityType: string;
  entityId: string;
  description: string;
  createdAt: string;
}
