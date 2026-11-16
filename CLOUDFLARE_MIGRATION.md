# Guía Completa de Migración y Despliegue Nativo en Cloudflare

Este documento detalla la arquitectura **100 % nativa en Cloudflare** implementada para **Gestor de Expedientes y Documentos**, eliminando por completo Firebase, Firestore, Firebase Storage, Google Gemini, Resend, Twilio, Express y la persistencia local en `/data/db.json`.

---

## 1. Arquitectura en Cloudflare (Un Único Worker)

Todo el backend (`/api/*`) y el frontend compilado (`./dist`) se ejecutan desde un único Cloudflare Worker definido en `wrangler.jsonc`:

| Servicio Cloudflare | Binding / Recurso | Función en la Aplicación |
| :--- | :--- | :--- |
| **Cloudflare Workers** | `main: src/worker/index.ts` (Hono) | Ejecución de todas las rutas `/api/*`, autenticación HMAC-SHA256, control RBAC, proxies seguros hacia R2 y consumidor de colas. |
| **Cloudflare Workers Static Assets** | `env.ASSETS` (`./dist`) | Entrega del frontend React SPA con `run_worker_first: ["/api/*"]` y `not_found_handling: "single-page-application"`. |
| **Cloudflare D1** | `env.DB` (`gestor-documentos-db`) | Base de datos SQL relacional para usuarios, tokens de verificación, expedientes, plantillas, participantes, metadatos y versiones de documentos, tareas/formularios, observaciones, mensajería, notificaciones, auditorías y configuraciones. |
| **Cloudflare R2** | `env.BUCKET` (`gestor-documentos-files`) | Almacenamiento binario de documentos de expedientes, versiones históricas y adjuntos de mensajería interna, servidos mediante proxy autenticado `/api/documents/download/:docId` y `/api/messages/attachments/:msgId/:idx`. |
| **Cloudflare Workers AI** | `env.AI` | Generación de plantillas, extracción de PDFs/DOCX con texto embebido (`env.AI.toMarkdown`), análisis documental (texto + imágenes), sugerencia de formularios y contenido de solapas personalizadas. |
| **Cloudflare KV** | `env.KV` | Almacenamiento auxiliar exclusivamente para sesiones activas (`session:{jti}`), limitación de tasa (`rl:*`), TTL de códigos de verificación (`verify:{userId}`) y caché de configuraciones públicas/sistema. |
| **Cloudflare Queues** | `env.TASKS_QUEUE` (`gestor-documentos-tasks`) | Cola asíncrona opcional para análisis documental en segundo plano (`DOCUMENT_ANALYZE`) y fanout de notificaciones (`NOTIFICATION_FANOUT`). |
| **Cloudflare Turnstile** | `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Verificación anti-bot obligatoria (cuando las llaves están configuradas) en inicialización administrativa, inicio de sesión y registro de asesores. |

---

## 2. Seguridad, Autenticación y Primer Administrador

1. **Sin contraseñas predeterminadas ni tokens simulados**: Se eliminaron todos los `real-jwt-token-for-*` y contraseñas precargadas en código.
2. **Hashing de contraseñas**: `PBKDF2-SHA256` con 100.000 iteraciones y salt aleatorio de 16 bytes por usuario (`src/worker/security.ts`).
3. **Sesiones verificables**: Token firmado con **HMAC-SHA256** guardado en cookie **`HttpOnly; SameSite=Lax; Path=/`** (`Secure` automático en HTTPS), respaldado por registro en **Cloudflare KV** (`session:{jti}`) para revocación inmediata en `/api/auth/logout`.
4. **Inicialización segura del Director General**:
   - Si la tabla `users` no tiene ningún registro con `role = 'ADMIN'`, `/api/auth/setup-status` devuelve `{ needsSetup: true }`.
   - El frontend muestra el formulario único de creación del primer Director General (`POST /api/auth/setup-admin`), protegido por Turnstile y por el secreto opcional `BOOTSTRAP_ADMIN_SECRET`.
   - En cuanto existe 1 administrador en D1, `/api/auth/setup-admin` responde `403` permanentemente.

---

## 3. Equivalencias y Limitaciones Reales de Inteligencia Artificial (Workers AI vs Gemini)

No se utilizan fallbacks simulados. Todas las funciones invocan directamente `env.AI`:

| Funcionalidad | Implementación Nativa en Cloudflare Workers AI | Limitación Documentada frente a Gemini |
| :--- | :--- | :--- |
| **Generación de plantillas por prompt** (`/api/templates/generate-ai`) | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` con `response_format: { type: "json_object" }`. | Requiere salida JSON estructurada; en casos muy extensos conviene revisar o ajustar etapas manualmente desde el editor incluido. |
| **Extracción de plantilla desde PDF** (`/api/templates/parse-pdf`) | `env.AI.toMarkdown()` + `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. | **Limitación nativa**: `toMarkdown` extrae texto de PDFs digitales y DOCX, pero **no realiza OCR sobre PDFs puramente escaneados (solo imágenes)**. Si un PDF no contiene capa de texto, el endpoint lo informa explícitamente (`>= 20` caracteres requeridos) en lugar de devolver datos falsos. |
| **Análisis de documentos adjuntos** (`/api/cases/:id/documents/:docId/analyze-ai`) | Imágenes (`png/jpg/webp`): `@cf/meta/llama-3.2-11b-vision-instruct`. Documentos PDF/DOCX/TXT: `env.AI.toMarkdown()` + Llama 3.3 70B. | 1) Los formatos `.doc` binarios heredados (Word 97-2003) o PDFs escaneados sin OCR no generan texto en `toMarkdown`; la UI recomienda subir `.docx`, PDF digital o imagen PNG/JPG para análisis visual. 2) El modelo Llama 3.2 Vision puede requerir aceptar su licencia en el panel de Cloudflare Workers AI la primera vez. |
| **Asistencia para completar formularios** (`/api/cases/:id/requirements/:reqId/assist-form-ai`) | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` cruzando participantes y `ai_analysis_json` persistido en D1. | Solo sugiere valores presentes en el expediente y documentos previamente analizados; no inventa datos faltantes. |
| **Generación de contenido para solapas** (`/api/custom-tabs/generate-ai`) | `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. | Equivalente funcional directo para texto en Markdown. |

---

## 4. Notificaciones y Verificación sin Resend ni Twilio

- **Notificaciones internas**: 100 % operativas mediante Workers + tabla `notifications` en D1 (+ fanout vía Queues).
- **Verificación de registro de asesores**: Se eliminaron Resend y Twilio. El administrador dispone de tres modos reales en Administración -> Configuración:
  1. **`ADMIN_CODE` (Recomendado / Gratuito)**: El Worker genera un código aleatorio criptográfico de 16 caracteres, guarda su hash SHA-256 en `verification_tokens` (D1) y en KV con TTL de 24 h (`verify:{userId}`). El Administrador o Manager pulsa **"Generar Código"** en la ficha del asesor pendiente y se lo entrega de forma segura; el asesor lo valida en `/api/auth/verify-token`.
  2. **`DIRECT_APPROVAL`**: El asesor queda en estado `VERIFIED_PENDING_APPROVAL` tras superar Turnstile y el Director General lo aprueba directamente en D1.
  3. **`CF_SEND_EMAIL` (Cloudflare Email Service)**: Utiliza el binding nativo `env.SEND_EMAIL` de Cloudflare Workers. **Limitación nativa**: requiere plan de pago de Cloudflare Workers, dominio con Email Routing/DNS verificado en Cloudflare y configurar el bloque `send_email` en `wrangler.jsonc`. Si no está vinculado, el backend rechaza el envío de forma honesta (`400`) y no simula envíos.
- **SMS**: Cloudflare Workers no ofrece un servicio nativo de envío de SMS. Se eliminó Twilio y se sustituyó por los flujos nativos anteriores (`ADMIN_CODE`, `DIRECT_APPROVAL` o `CF_SEND_EMAIL`).

---

## 5. Migración Segura de Datos (Sin Modificar `/data/db.json`)

El archivo original `/data/db.json` permanece intacto. Para migrar datos históricos (desde `data/db.json` o una exportación JSON equivalente de Firestore):

```bash
# 1. Crear respaldo inmutable en /backups/, generar SQL idempotente y extraer adjuntos base64 para R2
node scripts/migrate-from-json.mjs
# O indicando un archivo exportado específico:
# node scripts/migrate-from-json.mjs --input ruta/exportacion.json

# 2. Aplicar migración de esquema inicial en D1 (local o --remote)
npx wrangler d1 migrations apply gestor-documentos-db --remote

# 3. Ejecutar inserción idempotente de datos migrados
npx wrangler d1 execute gestor-documentos-db --remote --file=migrations/0002_seed_migrated_data.sql

# 4. Subir a R2 cualquier archivo binario extraído (si r2-migration-staging/manifest.json tiene objetos)
bash r2-migration-staging/upload-r2.sh gestor-documentos-files --remote
```

> **Nota de seguridad**: Cualquier contraseña heredada en texto plano encontrada en el JSON se convierte automáticamente a hash `PBKDF2-SHA256` (`pbkdf2$100000$...`). Si el origen contenía credenciales de prueba débiles, cámbielas desde el perfil de usuario o el panel de administración tras validar el arranque.

---

## 6. Provisionamiento y Despliegue Paso a Paso en Cloudflare

### Paso 1: Crear recursos en Cloudflare
```bash
npx wrangler login

# Base de datos D1
npx wrangler d1 create gestor-documentos-db
# Copiar el database_id resultante en wrangler.jsonc

# Bucket R2
npx wrangler r2 bucket create gestor-documentos-files

# Namespace KV
npx wrangler kv namespace create KV
# Copiar el id resultante en wrangler.jsonc

# Cola de Cloudflare Queues (plan Workers Paid requerido para Queues en producción)
npx wrangler queues create gestor-documentos-tasks
```
*(Si utilizas el plan gratuito sin Queues, elimina o comenta temporalmente el bloque `queues` en `wrangler.jsonc`; el Worker maneja de forma segura la ausencia de `TASKS_QUEUE` manteniendo el análisis síncrono bajo demanda).*

### Paso 2: Configurar Turnstile y Secretos del Worker
En el Dashboard de Cloudflare -> **Turnstile**, crea un widget y obtén `Site Key` y `Secret Key`. Luego actualiza `TURNSTILE_SITE_KEY` en `wrangler.jsonc` (o mediante `--var`) y carga los secretos:

```bash
# Secreto HMAC obligatorio para firmar cookies de sesión en producción
npx wrangler secret put SESSION_SECRET

# Clave secreta para proteger la creación del primer Administrador (recomendado)
npx wrangler secret put BOOTSTRAP_ADMIN_SECRET

# Clave secreta de Cloudflare Turnstile (recomendado en producción)
npx wrangler secret put TURNSTILE_SECRET_KEY
```

### Paso 3: Aplicar migraciones D1, compilar y desplegar
```bash
npm install
npx wrangler d1 migrations apply gestor-documentos-db --remote
npm run build
npx wrangler deploy
```

Para desarrollo local con Wrangler (tras crear `.dev.vars` desde `.dev.vars.example`):
```bash
npx wrangler d1 migrations apply gestor-documentos-db --local
npm run build
npx wrangler dev
```
