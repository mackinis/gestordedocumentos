# Gestor de Expedientes y Documentos (100 % Cloudflare Nativo)

Plataforma integral de gestión documental, seguimiento de expedientes por etapas, verificación de requisitos, mensajería interna, auditoría y administración por roles (`ADMIN`, `MANAGER`, `ASESOR`), migrada íntegramente para ejecutarse sobre **Cloudflare Workers + D1 + R2 + Workers AI + KV + Queues + Turnstile + Static Assets**.

## Características Principales

- **Backend y Frontend en un Único Worker**: API REST en Hono (`/api/*`) + SPA React (`./dist`) servida por Cloudflare Workers Static Assets (`wrangler.jsonc`).
- **Persistencia SQL en Cloudflare D1**: Esquema relacional completo con índices e integridad referencial (`migrations/0001_initial_schema.sql`) para usuarios, expedientes, plantillas, participantes, tareas/formularios, observaciones, mensajes, notificaciones, auditorías y configuraciones.
- **Almacenamiento Binario en Cloudflare R2**: Subida de archivos, versionado histórico, adjuntos de mensajería y descarga mediante proxy autenticado que valida permisos por rol y bloqueo de descarga por expediente.
- **Inteligencia Artificial con Cloudflare Workers AI**:
  - Generación de plantillas de procesos por rubro/instrucciones (`Llama 3.3 70B`).
  - Extracción de plantillas desde PDF con texto digital (`toMarkdown` + `Llama 3.3 70B`).
  - Análisis documental automático por cola (`Cloudflare Queues`) o bajo demanda (`Llama 3.2 11B Vision` para imágenes y `toMarkdown` + `Llama 3.3` para documentos).
  - Autocompletado asistido de formularios a partir de participantes y documentos analizados.
- **Seguridad y Autenticación**:
  - Contraseñas con hash `PBKDF2-SHA256` (100.000 iteraciones).
  - Cookies de sesión `HttpOnly; SameSite=Lax` firmadas con HMAC-SHA256 y revocación inmediata en **Cloudflare KV**.
  - Protección anti-bot con **Cloudflare Turnstile**.
  - Inicialización segura del primer Director General (`/api/auth/setup-admin`), sin contraseñas predeterminadas ni tokens simulados.

## Desarrollo Local y Pruebas

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar variables locales de ejemplo y completar secretos locales
cp .dev.vars.example .dev.vars

# 3. Aplicar migraciones D1 locales
npm run cf:migrate:local

# 4. Compilar frontend y verificar TypeScript (frontend + Worker)
npm run build
npm run lint

# 5. Ejecutar servidor local completo con Wrangler (Worker + Assets + D1 + R2 + KV)
npm run dev

# 6. Ejecutar suite de pruebas de integración del Worker
npm test
```

## Migración de Datos Históricos y Despliegue

Consulta la guía detallada en [`CLOUDFLARE_MIGRATION.md`](./CLOUDFLARE_MIGRATION.md) para:
- Ejecutar el respaldo y exportación segura desde `/data/db.json` mediante `node scripts/migrate-from-json.mjs` (sin modificar ni borrar los datos originales).
- Crear recursos D1, R2, KV, Queues y Turnstile en Cloudflare.
- Entender las equivalencias y limitaciones reales de Cloudflare Workers AI y verificación nativa sin proveedores externos.
- Desplegar en producción con `npm run deploy`.
