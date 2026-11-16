-- Migration 0001: Initial Cloudflare D1 schema for Gestor de Documentos
-- Note: D1 enforces foreign keys per connection; indexes are created for all query and relation paths.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'ASESOR')),
  avatar_url TEXT,
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VERIFIED_PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUSPENDED', 'BANNED')),
  can_create_cases INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);

CREATE TABLE IF NOT EXISTS verification_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  channel TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verification_tokens_user_id ON verification_tokens(user_id);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  is_public INTEGER NOT NULL DEFAULT 1,
  stages_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_templates_created_by ON templates(created_by);
CREATE INDEX IF NOT EXISTS idx_templates_public ON templates(is_public);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  template_id TEXT REFERENCES templates(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('ACTIVO', 'OBSERVADO', 'PENDIENTE', 'FINALIZADO')),
  current_stage_id TEXT,
  advisor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  manager_id TEXT,
  stages_json TEXT NOT NULL DEFAULT '[]',
  stages_determined INTEGER NOT NULL DEFAULT 1,
  review_status TEXT,
  review_button_blocked INTEGER NOT NULL DEFAULT 0,
  review_button_blocked_reason TEXT,
  party_counts_json TEXT NOT NULL DEFAULT '{"compradores":0,"vendedores":0,"garantes":0}',
  requirement_states_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cases_code ON cases(code);
CREATE INDEX IF NOT EXISTS idx_cases_advisor_id ON cases(advisor_id);
CREATE INDEX IF NOT EXISTS idx_cases_manager_id ON cases(manager_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  apellido TEXT DEFAULT '',
  dni TEXT DEFAULT '',
  cuit_cuil TEXT DEFAULT '',
  email TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  observaciones TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_participants_case_id ON participants(case_id);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE', 'CARGADO', 'EN_REVISION', 'APROBADO', 'RECHAZADO', 'VENCIDO')),
  r2_key TEXT,
  file_url TEXT,
  file_name TEXT,
  file_type TEXT,
  file_size TEXT,
  uploaded_at TEXT,
  uploaded_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  ai_analysis_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_documents_case_req ON documents(case_id, requirement_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  r2_key TEXT,
  file_url TEXT,
  uploaded_at TEXT NOT NULL,
  uploaded_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_document_versions_doc_id ON document_versions(document_id, version);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE', 'EN_PROGRESO', 'COMPLETA')),
  completed_at TEXT,
  completed_by TEXT,
  form_values_json TEXT NOT NULL DEFAULT '{}',
  form_instances_json TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_tasks_case_req ON tasks(case_id, requirement_id);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  stage_id TEXT DEFAULT '',
  entity_id TEXT DEFAULT 'general',
  entity_type TEXT NOT NULL DEFAULT 'GENERAL' CHECK (entity_type IN ('DOCUMENT', 'TASK', 'GENERAL')),
  message TEXT NOT NULL,
  author_id TEXT,
  author_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ABIERTA' CHECK (status IN ('ABIERTA', 'RESUELTA')),
  response TEXT,
  responded_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_observations_case_id ON observations(case_id, status);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'INFO' CHECK (type IN ('INFO', 'SUCCESS', 'WARNING', 'DANGER')),
  read INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  case_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read, archived);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_role TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  attachments_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  sender_trash INTEGER NOT NULL DEFAULT 0,
  recipient_trash INTEGER NOT NULL DEFAULT 0,
  sender_deleted INTEGER NOT NULL DEFAULT 0,
  recipient_deleted INTEGER NOT NULL DEFAULT 0,
  parent_message_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, recipient_deleted, recipient_trash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id, sender_deleted, sender_trash, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  description TEXT NOT NULL,
  case_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_case_id ON audit_logs(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action ON audit_logs(user_id, action);

CREATE TABLE IF NOT EXISTS profile_change_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  current_data_json TEXT NOT NULL,
  requested_data_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE', 'APROBADO', 'RECHAZADO')),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_profile_requests_status ON profile_change_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS case_requests (
  id TEXT PRIMARY KEY,
  advisor_id TEXT NOT NULL,
  advisor_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  template_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE', 'CREADO', 'RECHAZADO')),
  party_counts_json TEXT NOT NULL DEFAULT '{"compradores":0,"vendedores":0,"garantes":0}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_case_requests_advisor ON case_requests(advisor_id, status);

CREATE TABLE IF NOT EXISTS adjustment_requests (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('FORM_COUNT', 'DOCUMENT_UPLOAD')),
  target_party TEXT,
  action TEXT,
  quantity INTEGER,
  requirement_id TEXT,
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE', 'APROBADO', 'RECHAZADO')),
  requested_by TEXT NOT NULL,
  requested_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  processed_by TEXT,
  processed_by_name TEXT,
  processed_at TEXT,
  rejection_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_adjustment_requests_case ON adjustment_requests(case_id, status);

CREATE TABLE IF NOT EXISTS custom_tabs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT DEFAULT 'Layout',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_tab_items (
  id TEXT PRIMARY KEY,
  tab_id TEXT NOT NULL REFERENCES custom_tabs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_custom_tab_items_tab_id ON custom_tab_items(tab_id, created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
