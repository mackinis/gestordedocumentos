/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Lanzador local unificado para Cloudflare Worker + Static Assets + D1 + R2 + KV + Queues.
 * Maneja argumentos duplicados como `--port 3000` (enviados por entornos preview),
 * permite arranque offline local cuando no hay CLOUDFLARE_API_TOKEN configurado,
 * y asegura permisos de lectura en `.wrangler/` para sincronización/exportación sin EACCES.
 */

import fs from "node:fs";
import path from "node:path";
import { unstable_startWorker } from "wrangler";

const ROOT = process.cwd();

function parsePort(argv, fallback = 3000) {
  let port = fallback;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--port" || arg === "-p") {
      const next = Number(argv[i + 1]);
      if (Number.isInteger(next) && next > 0) {
        port = next;
      }
    } else if (arg.startsWith("--port=")) {
      const val = Number(arg.slice("--port=".length));
      if (Number.isInteger(val) && val > 0) {
        port = val;
      }
    }
  }
  return port;
}

function makeDirReadableRecursive(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  try {
    const stat = fs.lstatSync(targetPath);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      fs.chmodSync(targetPath, 0o755);
      for (const entry of fs.readdirSync(targetPath)) {
        makeDirReadableRecursive(path.join(targetPath, entry));
      }
    } else {
      const mode = (stat.mode & 0o111) ? 0o755 : 0o644;
      fs.chmodSync(targetPath, mode);
    }
  } catch {
    // Ignore transient temp files deleted concurrently
  }
}

const wranglerTmpDir = path.join(ROOT, ".wrangler", "tmp");
if (fs.existsSync(wranglerTmpDir)) {
  try {
    fs.rmSync(wranglerTmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

const port = parsePort(process.argv.slice(2), Number(process.env.PORT || 3000));
const hasCloudflareAuth = Boolean(process.env.CLOUDFLARE_API_TOKEN?.trim());

const worker = await unstable_startWorker({
  config: path.join(ROOT, "wrangler.jsonc"),
  dev: {
    remote: hasCloudflareAuth,
    server: {
      hostname: "0.0.0.0",
      port
    },
    inspector: false
  }
});

makeDirReadableRecursive(path.join(ROOT, ".wrangler"));

console.log(
  `[Cloudflare Worker Local] Escuchando en http://0.0.0.0:${port} (Workers AI remoto: ${
    hasCloudflareAuth ? "activo" : "desactivado - sin CLOUDFLARE_API_TOKEN"
  })`
);

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[Cloudflare Worker Local] Cerrando servidor (${signal})...`);
  try {
    await worker.dispose();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
