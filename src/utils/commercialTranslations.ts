/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CommercialTranslations {
  caseSingular: string;
  casePlural: string;
  advisorSingular: string;
  advisorPlural: string;
  managerSingular: string;
  managerPlural: string;
  participantSingular: string;
  participantPlural: string;
  templateSingular: string;
  templatePlural: string;
  categorySingular: string;
  categoryPlural: string;
  welcomeMessage: string;
}

export const COMMERCIAL_FOCUS_TRANSLATIONS: Record<string, CommercialTranslations> = {
  juridico: {
    caseSingular: "Caso Judicial / Legajo",
    casePlural: "Casos / Legajos",
    advisorSingular: "Abogado Asociado",
    advisorPlural: "Abogados Asociados",
    managerSingular: "Socio Principal",
    managerPlural: "Socios Principales",
    participantSingular: "Patrocinado / Contraparte",
    participantPlural: "Patrocinados / Contrapartes",
    templateSingular: "Procedimiento de Litigio",
    templatePlural: "Procedimientos de Litigio",
    categorySingular: "Materia Jurídica",
    categoryPlural: "Materias Jurídicas",
    welcomeMessage: "Administre legajos procesales, cargue pruebas documentales e instrumente flujos jurídicos basados en plantillas inmutables.",
  },
  inmobiliaria: {
    caseSingular: "Operación / Propiedad",
    casePlural: "Operaciones / Propiedades",
    advisorSingular: "Agente Inmobiliario",
    advisorPlural: "Agentes Inmobiliarios",
    managerSingular: "Corredor Senior",
    managerPlural: "Corredores Senior",
    participantSingular: "Comprador / Vendedor",
    participantPlural: "Compradores / Vendedores",
    templateSingular: "Guía de Corretaje",
    templatePlural: "Guías de Corretaje",
    categorySingular: "Segmento Inmobiliario",
    categoryPlural: "Segmentos Inmobiliarios",
    welcomeMessage: "Administre operaciones inmobiliarias, controle reservas, reciba escrituras fiscales y valide legajos de propiedades.",
  },
  escribania: {
    caseSingular: "Protocolo de Escritura",
    casePlural: "Protocolos / Escrituras",
    advisorSingular: "Escribano Adscripto",
    advisorPlural: "Escribanos Adscriptos",
    managerSingular: "Escribano Titular",
    managerPlural: "Escribanos Titulares",
    participantSingular: "Requirente / Otorgante",
    participantPlural: "Requirentes / Otorgantes",
    templateSingular: "Formato de Escrituración",
    templatePlural: "Formatos de Escrituración",
    categorySingular: "Tipo de Acto Notarial",
    categoryPlural: "Tipos de Acto Notarial",
    welcomeMessage: "Supervise protocolos notariales, coteje firmas de otorgantes y valide actas de escrituración pública.",
  },
  financiero: {
    caseSingular: "Legajo / Crédito",
    casePlural: "Legajos / Créditos Financieros",
    advisorSingular: "Analista de Riesgo",
    advisorPlural: "Analistas de Riesgo",
    managerSingular: "Director de Riesgo",
    managerPlural: "Oficiales de Cuenta / Directores de Riesgo",
    participantSingular: "Inversor / Solicitante",
    participantPlural: "Inversores / Solicitantes",
    templateSingular: "Modelo de Financiamiento",
    templatePlural: "Modelos de Financiamiento",
    categorySingular: "Línea de Crédito",
    categoryPlural: "Líneas de Crédito",
    welcomeMessage: "Administre legajos de crédito, evalúe scoring de riesgo, instrumente contratos de fianza y valide garantías reales.",
  },
  general: {
    caseSingular: "Expediente General",
    casePlural: "Expedientes Generales",
    advisorSingular: "Asesor de Legajo",
    advisorPlural: "Asesores de Legajo",
    managerSingular: "Manager / Supervisor",
    managerPlural: "Managers / Supervisores",
    participantSingular: "Parte Interesada",
    participantPlural: "Partes Interesadas",
    templateSingular: "Plantilla de Proceso",
    templatePlural: "Plantillas de Proceso",
    categorySingular: "Área Administrativa",
    categoryPlural: "Áreas Administrativas",
    welcomeMessage: "Administre legajos corporativos en tiempo real, habilite firmas de escrituras e instrumente flujos basados en plantillas inmutables.",
  },
};

export function getTranslations(focus: string | undefined): CommercialTranslations {
  const base = (!focus || !COMMERCIAL_FOCUS_TRANSLATIONS[focus])
    ? COMMERCIAL_FOCUS_TRANSLATIONS.general
    : COMMERCIAL_FOCUS_TRANSLATIONS[focus];

  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("customTexts") : null;
    if (raw) {
      const overrides = JSON.parse(raw);
      return {
        caseSingular: overrides["app.caseSingular"] || base.caseSingular,
        casePlural: overrides["app.casePlural"] || base.casePlural,
        advisorSingular: overrides["app.advisorSingular"] || base.advisorSingular,
        advisorPlural: overrides["app.advisorPlural"] || base.advisorPlural,
        managerSingular: overrides["app.managerSingular"] || base.managerSingular,
        managerPlural: overrides["app.managerPlural"] || base.managerPlural,
        participantSingular: base.participantSingular,
        participantPlural: base.participantPlural,
        templateSingular: base.templateSingular,
        templatePlural: base.templatePlural,
        categorySingular: base.categorySingular,
        categoryPlural: base.categoryPlural,
        welcomeMessage: overrides["login.welcome"] || base.welcomeMessage,
      };
    }
  } catch (err) {
    // Ignore error
  }

  return base;
}

export function getText(key: string, defaultValue: string): string {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("customTexts") : null;
    if (raw) {
      const overrides = JSON.parse(raw);
      if (overrides[key] !== undefined && overrides[key] !== null && overrides[key] !== "") {
        return overrides[key];
      }
    }
  } catch (err) {
    // Ignore error
  }
  return defaultValue;
}

