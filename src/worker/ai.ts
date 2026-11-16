/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Env } from "./types";

const TEXT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

function extractJsonObject(raw: any): any {
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    if ("response" in raw) {
      if (typeof raw.response === "object" && raw.response !== null) {
        return raw.response;
      }
      if (typeof raw.response === "string") {
        return extractJsonFromText(raw.response);
      }
    }
    return raw;
  }
  if (typeof raw === "string") {
    return extractJsonFromText(raw);
  }
  return null;
}

function extractJsonFromText(text: string): any {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("La respuesta de Workers AI no devolvió un JSON válido.");
  }
}

export function decodeBase64ToBytes(input: string): Uint8Array {
  let clean = input;
  if (clean.includes("base64,")) {
    clean = clean.split("base64,")[1];
  }
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function generateTemplateWithAI(
  env: Env,
  sector: string,
  requirementsDescription: string
): Promise<any> {
  if (!env.AI) {
    throw new Error("El binding de Cloudflare Workers AI (AI) no está disponible.");
  }

  const prompt = `Genera un esquema estructurado de flujo/etapas y requisitos obligatorios para una plataforma de gestión documental y procesos.
Rubro/Sector: ${sector || "General"}
Instrucciones especiales / Descripción: ${requirementsDescription || "Flujo estándar de gestión documental"}

Responde ÚNICAMENTE con un objeto JSON válido con la siguiente estructura:
{
  "name": "string (nombre descriptivo de la plantilla)",
  "category": "string (rubro: Inmobiliaria, Legal, Seguros, Financiero, RRHH, Consultores, etc.)",
  "description": "string (breve resumen del proceso global)",
  "stages": [
    {
      "id": "stg-1",
      "name": "string",
      "description": "string",
      "order": 1,
      "requirements": [
        {
          "id": "req-1-1",
          "type": "DOCUMENT | FORM | TASK",
          "name": "string",
          "description": "string",
          "required": true,
          "formFields": [
            {
              "name": "campo_id",
              "label": "Etiqueta",
              "type": "text | number | email | checkbox | textarea",
              "required": true
            }
          ]
        }
      ]
    }
  ]
}
Diseña un proceso realista con 3 o 4 etapas bien definidas e intercala requisitos de tipo DOCUMENT, FORM y TASK.`;

  const aiResult = await env.AI.run(TEXT_MODEL as any, {
    messages: [
      {
        role: "system",
        content:
          "Eres un arquitecto experto en procesos administrativos, legales e inmobiliarios. Responde estrictamente con JSON válido en español, sin markdown ni texto adicional.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 2048,
    temperature: 0.3,
  });

  const parsed = extractJsonObject(aiResult);
  if (!parsed || !Array.isArray(parsed.stages)) {
    throw new Error("Workers AI no generó una estructura válida de etapas.");
  }

  const tplId = `tpl-ai-${Date.now()}`;
  return {
    id: tplId,
    name: parsed.name || `Proceso de ${sector}`,
    category: parsed.category || sector || "General",
    description: parsed.description || `Plantilla generada por Cloudflare Workers AI para ${sector}`,
    stages: parsed.stages.map((s: any, idx: number) => {
      const stageId = s.id || `stg-ai-${Date.now()}-${idx}`;
      return {
        id: stageId,
        templateId: tplId,
        name: s.name || `Etapa ${idx + 1}`,
        description: s.description || "",
        order: s.order || idx + 1,
        requirements: (s.requirements || []).map((r: any, rIdx: number) => ({
          id: r.id || `req-ai-${Date.now()}-${idx}-${rIdx}`,
          stageId,
          type: ["DOCUMENT", "FORM", "TASK"].includes(r.type) ? r.type : "DOCUMENT",
          name: r.name || `Requisito ${rIdx + 1}`,
          description: r.description || "",
          required: r.required !== false,
          formFields: Array.isArray(r.formFields) ? r.formFields : [],
        })),
      };
    }),
  };
}

export async function parsePdfTemplateWithAI(
  env: Env,
  fileName: string,
  bytes: Uint8Array,
  mimeType = "application/pdf"
): Promise<{ template: any; extractedChars: number; note?: string }> {
  if (!env.AI) {
    throw new Error("El binding de Cloudflare Workers AI (AI) no está disponible.");
  }

  let extractedMarkdown = "";
  try {
    const mdRes = await (env.AI as any).toMarkdown([
      {
        name: fileName || "plantilla.pdf",
        blob: new Blob([bytes], { type: mimeType }),
      },
    ]);
    if (Array.isArray(mdRes) && mdRes[0]?.data) {
      extractedMarkdown = String(mdRes[0].data);
    } else if (mdRes && typeof mdRes.data === "string") {
      extractedMarkdown = mdRes.data;
    }
  } catch (err: any) {
    throw new Error(
      `Cloudflare Workers AI toMarkdown no pudo extraer texto del documento (${err?.message || "error de conversión"}).`
    );
  }

  const trimmedText = extractedMarkdown.trim();
  if (trimmedText.length < 20) {
    throw new Error(
      "El PDF parece ser una imagen escaneada sin capa de texto seleccionable. Cloudflare Workers AI toMarkdown requiere texto embebido en el PDF (para documentos escaneados, conviértalos a imagen PNG/JPG y use el análisis visual con Llama 3.2 Vision)."
    );
  }

  const truncatedText = trimmedText.slice(0, 14000);
  const prompt = `Analiza el siguiente contenido extraído del archivo "${fileName}" mediante Cloudflare Workers AI toMarkdown y conviértelo en una plantilla estructurada de etapas y requisitos.

Contenido del documento:
"""
${truncatedText}
"""

Responde ÚNICAMENTE con un objeto JSON válido con la siguiente estructura:
{
  "name": "string",
  "category": "string",
  "description": "string",
  "stages": [
    {
      "id": "stg-1",
      "name": "string",
      "description": "string",
      "order": 1,
      "requirements": [
        {
          "id": "req-1-1",
          "type": "DOCUMENT | FORM | TASK",
          "name": "string",
          "description": "string",
          "required": true,
          "formFields": [
            {
              "name": "campo",
              "label": "Etiqueta",
              "type": "text | number | email | checkbox | textarea",
              "required": true
            }
          ]
        }
      ]
    }
  ]
}`;

  const aiResult = await env.AI.run(TEXT_MODEL as any, {
    messages: [
      {
        role: "system",
        content:
          "Eres un analista documental experto. Extraes procesos, etapas, documentos, formularios y tareas desde Markdown. Responde únicamente con JSON válido.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 2048,
    temperature: 0.2,
  });

  const parsed = extractJsonObject(aiResult);
  if (!parsed || !Array.isArray(parsed.stages)) {
    throw new Error("No se pudo estructurar el contenido extraído del PDF en etapas válidas.");
  }

  return {
    extractedChars: trimmedText.length,
    template: {
      name: parsed.name || `Proceso Extraído de ${fileName}`,
      category: parsed.category || "General",
      description:
        parsed.description ||
        `Plantilla extraída con Cloudflare Workers AI (toMarkdown + Llama 3.3) desde "${fileName}".`,
      stages: parsed.stages.map((s: any, idx: number) => ({
        id: s.id || `stg-pdf-${Date.now()}-${idx}`,
        name: s.name || `Etapa ${idx + 1}`,
        description: s.description || "",
        order: s.order || idx + 1,
        requirements: (s.requirements || []).map((r: any, rIdx: number) => ({
          id: r.id || `req-pdf-${Date.now()}-${idx}-${rIdx}`,
          type: ["DOCUMENT", "FORM", "TASK"].includes(r.type) ? r.type : "DOCUMENT",
          name: r.name || `Requisito ${rIdx + 1}`,
          description: r.description || "",
          required: r.required !== false,
          formFields: Array.isArray(r.formFields) ? r.formFields : [],
        })),
      })),
    },
  };
}

export async function generateCustomTabContentWithAI(
  env: Env,
  promptText: string
): Promise<{ title: string; content: string }> {
  if (!env.AI) {
    throw new Error("El binding de Cloudflare Workers AI (AI) no está disponible.");
  }

  const aiResult = await env.AI.run(TEXT_MODEL as any, {
    messages: [
      {
        role: "system",
        content:
          "Eres un consultor experto en administración, gestión documental y procesos corporativos y legales. Responde únicamente con un objeto JSON válido con las claves 'title' y 'content' (en Markdown detallado).",
      },
      {
        role: "user",
        content: `Genera una sección profesional y completa sobre: "${promptText}". Devuelve JSON con "title" (título corto) y "content" (Markdown con encabezados ##, viñetas - y negritas **).`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1800,
    temperature: 0.4,
  });

  const parsed = extractJsonObject(aiResult);
  return {
    title: parsed?.title || `Guía: ${promptText.slice(0, 60)}`,
    content: parsed?.content || "",
  };
}

export async function analyzeDocumentWithAI(
  env: Env,
  fileName: string,
  fileType: string,
  bytes: Uint8Array,
  requirementName: string
): Promise<{
  summary: string;
  extractedFields: Record<string, string>;
  observations: string[];
  modelUsed: string;
}> {
  if (!env.AI) {
    throw new Error("El binding de Cloudflare Workers AI (AI) no está disponible.");
  }

  const lowerType = (fileType || "").toLowerCase();
  const lowerName = (fileName || "").toLowerCase();

  // Images -> Llama 3.2 Vision
  if (
    lowerType.startsWith("image/") ||
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".webp")
  ) {
    const aiRes = await env.AI.run(VISION_MODEL as any, {
      messages: [
        {
          role: "system",
          content:
            "Analizas imágenes de documentos administrativos/identidad. Responde únicamente con JSON: { summary: string, extractedFields: Record<string,string>, observations: string[] }.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analiza esta imagen correspondiente al requisito "${requirementName}". Resume qué contiene, extrae datos clave visibles (nombre, DNI, CUIT, fecha, dirección, montos) en extractedFields y señala observaciones de legibilidad.`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${fileType || "image/jpeg"};base64,${bytesToBase64(bytes)}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1024,
    });

    const parsed = extractJsonObject(aiRes);
    return {
      summary: parsed?.summary || "Análisis visual completado.",
      extractedFields: parsed?.extractedFields || {},
      observations: Array.isArray(parsed?.observations) ? parsed.observations : [],
      modelUsed: VISION_MODEL,
    };
  }

  // PDF / DOCX / Text -> Workers AI toMarkdown + Llama 3.3
  let textContent = "";
  if (lowerType.startsWith("text/") || lowerName.endsWith(".txt") || lowerName.endsWith(".csv")) {
    textContent = new TextDecoder().decode(bytes);
  } else {
    const mdRes = await (env.AI as any).toMarkdown([
      {
        name: fileName,
        blob: new Blob([bytes], { type: fileType || "application/pdf" }),
      },
    ]);
    textContent = Array.isArray(mdRes) ? mdRes[0]?.data || "" : mdRes?.data || "";
  }

  if (!textContent || textContent.trim().length < 10) {
    return {
      summary:
        "No se pudo extraer texto legible (el archivo puede ser un PDF escaneado sin OCR o un formato binario antiguo).",
      extractedFields: {},
      observations: [
        "Formato sin capa de texto extraíble de forma nativa por Workers AI toMarkdown.",
      ],
      modelUsed: "workers-ai/toMarkdown",
    };
  }

  const aiRes = await env.AI.run(TEXT_MODEL as any, {
    messages: [
      {
        role: "system",
        content:
          "Eres un auditor documental. Analizas texto extraído de documentos de un expediente. Responde únicamente con JSON: { summary: string, extractedFields: Record<string,string>, observations: string[] }.",
      },
      {
        role: "user",
        content: `Requisito esperado: "${requirementName}" (${fileName}).\nContenido:\n${textContent.slice(0, 12000)}\n\nExtrae datos clave en extractedFields, resume el documento y lista observaciones relevantes.`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1024,
    temperature: 0.2,
  });

  const parsed = extractJsonObject(aiRes);
  return {
    summary: parsed?.summary || "Documento analizado.",
    extractedFields: parsed?.extractedFields || {},
    observations: Array.isArray(parsed?.observations) ? parsed.observations : [],
    modelUsed: TEXT_MODEL,
  };
}

export async function assistFormWithAI(
  env: Env,
  caseContext: { title: string; description: string; participants: any[]; extractedDocs: any[] },
  formFields: Array<{ name: string; label: string; type: string }>
): Promise<Record<string, string>> {
  if (!env.AI) {
    throw new Error("El binding de Cloudflare Workers AI (AI) no está disponible.");
  }

  const aiRes = await env.AI.run(TEXT_MODEL as any, {
    messages: [
      {
        role: "system",
        content:
          "Asistes al operador sugiriendo valores para formularios de expedientes únicamente basados en los datos proporcionados. Nunca inventes datos faltantes; deja cadena vacía si no hay dato. Responde únicamente JSON con { suggestedValues: Record<string,string> }.",
      },
      {
        role: "user",
        content: JSON.stringify({
          expediente: { title: caseContext.title, description: caseContext.description },
          participantes: caseContext.participants,
          documentosAnalizados: caseContext.extractedDocs,
          camposFormulario: formFields,
        }),
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1024,
    temperature: 0.1,
  });

  const parsed = extractJsonObject(aiRes);
  return parsed?.suggestedValues || {};
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
