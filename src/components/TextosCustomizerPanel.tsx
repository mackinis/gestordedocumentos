import React, { useState } from "react";
import { 
  Type, 
  HelpCircle, 
  RefreshCw, 
  Check, 
  AlertCircle,
  FileText,
  User,
  Users,
  Settings,
  FolderOpen
} from "lucide-react";

interface TextItem {
  key: string;
  category: string;
  label: string;
  defaultValue: string;
  isParagraph?: boolean;
}

const AVAILABLE_TEXT_ITEMS: TextItem[] = [
  // LOGIN SCREEN
  {
    key: "login.title",
    category: "🔑 Inicio de Sesión",
    label: "Título Principal de la Pantalla de Login",
    defaultValue: "Gestor de Expedientes"
  },
  {
    key: "login.subtitle",
    category: "🔑 Inicio de Sesión",
    label: "Subtítulo de la Pantalla de Login",
    defaultValue: "Control y Auditoría de Legajos Corporativos"
  },
  {
    key: "login.welcome",
    category: "🔑 Inicio de Sesión",
    label: "Mensaje de Bienvenida",
    defaultValue: "Acceda al sistema de legajos corporativos con firma electrónica y auditoría inmutable en tiempo real.",
    isParagraph: true
  },
  {
    key: "login.emailLabel",
    category: "🔑 Inicio de Sesión",
    label: "Etiqueta para Campo de Correo Electrónico",
    defaultValue: "Correo Electrónico"
  },
  {
    key: "login.passwordLabel",
    category: "🔑 Inicio de Sesión",
    label: "Etiqueta para Campo de Contraseña",
    defaultValue: "Contraseña"
  },
  {
    key: "login.button",
    category: "🔑 Inicio de Sesión",
    label: "Texto del Botón para Iniciar Sesión",
    defaultValue: "Iniciar Sesión"
  },
  {
    key: "login.registerPrompt",
    category: "🔑 Inicio de Sesión",
    label: "Texto para Invitación al Registro de Asesores",
    defaultValue: "¿Es un asesor nuevo? Regístrese aquí"
  },

  // ADVISOR PANEL
  {
    key: "advisor.sidebarTitle",
    category: "💼 Sesión del Asesor",
    label: "Título Principal en la Barra Superior / Lateral",
    defaultValue: "Panel del Asesor"
  },
  {
    key: "advisor.infoBox",
    category: "💼 Sesión del Asesor",
    label: "Texto de la Caja Informativa",
    defaultValue: "Aquí encontrará sus expedientes asignados. Complete los formularios, cargue la documentación requerida y resuelva observaciones de auditoría para avanzar de etapa.",
    isParagraph: true
  },
  {
    key: "advisor.btnRequest",
    category: "💼 Sesión del Asesor",
    label: "Texto del Botón para Solicitar Expediente",
    defaultValue: "Solicitar Nuevo Expediente"
  },
  {
    key: "advisor.btnCreate",
    category: "💼 Sesión del Asesor",
    label: "Texto del Botón para Iniciar Expediente (con permisos)",
    defaultValue: "Iniciar Nuevo Expediente"
  },

  // MANAGER/ADMIN PANEL
  {
    key: "manager.sidebarTitle",
    category: "🛡️ Sesión de Managers & Admin",
    label: "Título Principal de Barra Superior",
    defaultValue: "Panel de Control"
  },
  {
    key: "manager.infoBox",
    category: "🛡️ Sesión de Managers & Admin",
    label: "Texto de la Caja Informativa",
    defaultValue: "Supervise las operaciones comerciales, configure plantillas operativas, audite legajos y autorice aperturas.",
    isParagraph: true
  },

  // BUTTONS & LABELS
  {
    key: "btn.save",
    category: "🔘 Botones y Acciones",
    label: "Texto de Botón 'Guardar'",
    defaultValue: "Guardar"
  },
  {
    key: "btn.cancel",
    category: "🔘 Botones y Acciones",
    label: "Texto de Botón 'Cancelar'",
    defaultValue: "Cancelar"
  },
  {
    key: "btn.edit",
    category: "🔘 Botones y Acciones",
    label: "Texto de Botón 'Editar'",
    defaultValue: "Editar"
  },
  {
    key: "btn.approve",
    category: "🔘 Botones y Acciones",
    label: "Texto de Botón 'Aprobar' / 'Aceptar'",
    defaultValue: "Aprobar"
  },
  {
    key: "btn.reject",
    category: "🔘 Botones y Acciones",
    label: "Texto de Botón 'Rechazar'",
    defaultValue: "Rechazar"
  },
  {
    key: "btn.aperturarExpediente",
    category: "🔘 Botones y Acciones",
    label: "Botón 'Aperturar Expediente' (Manager/Admin)",
    defaultValue: "Aperturar Expediente"
  },
  {
    key: "title.aperturarNuevoExpediente",
    category: "🔘 Botones y Acciones",
    label: "Título 'Aperturar Nuevo Expediente' (Modal)",
    defaultValue: "Aperturar Nuevo Expediente"
  },
  {
    key: "btn.registrarLegajo",
    category: "🔘 Botones y Acciones",
    label: "Botón de Confirmar/Registrar Legajo",
    defaultValue: "Registrar Legajo"
  },
  {
    key: "btn.solicitarNuevoExpediente",
    category: "🔘 Botones y Acciones",
    label: "Botón 'Solicitar Nuevo Expediente' (Asesor)",
    defaultValue: "Solicitar Nuevo Expediente"
  },
  {
    key: "title.solicitarApertura",
    category: "🔘 Botones y Acciones",
    label: "Título 'Solicitar Apertura de Expediente' (Modal Asesor)",
    defaultValue: "Solicitar Apertura de Expediente"
  },
  {
    key: "btn.enviarSolicitud",
    category: "🔘 Botones y Acciones",
    label: "Botón 'Enviar Solicitud' (Confirmación Modal Asesor)",
    defaultValue: "Enviar Solicitud"
  },

  // GLOSSARY / NOUNS
  {
    key: "app.caseSingular",
    category: "📚 Vocabulario / Glosario",
    label: "Traducción Singular de Expediente",
    defaultValue: "Expediente"
  },
  {
    key: "app.casePlural",
    category: "📚 Vocabulario / Glosario",
    label: "Traducción Plural de Expediente",
    defaultValue: "Expedientes"
  },
  {
    key: "app.advisorSingular",
    category: "📚 Vocabulario / Glosario",
    label: "Traducción Singular de Asesor",
    defaultValue: "Asesor"
  },
  {
    key: "app.advisorPlural",
    category: "📚 Vocabulario / Glosario",
    label: "Traducción Plural de Asesor",
    defaultValue: "Asesores"
  },
  {
    key: "app.managerSingular",
    category: "📚 Vocabulario / Glosario",
    label: "Traducción Singular de Manager/Supervisor",
    defaultValue: "Manager"
  },
  {
    key: "app.managerPlural",
    category: "📚 Vocabulario / Glosario",
    label: "Traducción Plural de Manager/Supervisor",
    defaultValue: "Managers"
  }
];

interface TextosCustomizerPanelProps {
  adminSettings: any;
  setAdminSettings: (settings: any) => void;
  adminLoading: boolean;
  onSaveSettings: (e: React.FormEvent) => Promise<void>;
  adminStatusMsg: any;
  setAdminStatusMsg: (msg: any) => void;
}

export default function TextosCustomizerPanel({
  adminSettings,
  setAdminSettings,
  adminLoading,
  onSaveSettings,
  adminStatusMsg,
  setAdminStatusMsg
}: TextosCustomizerPanelProps) {
  const currentTexts = adminSettings.customTexts || {};
  const [activeCategory, setActiveCategory] = useState<string>("🔑 Inicio de Sesión");

  const categories = Array.from(new Set(AVAILABLE_TEXT_ITEMS.map(item => item.category)));

  const handleTextChange = (key: string, value: string) => {
    setAdminSettings({
      ...adminSettings,
      customTexts: {
        ...currentTexts,
        [key]: value
      }
    });
  };

  const resetToDefault = (key: string) => {
    const updatedTexts = { ...currentTexts };
    delete updatedTexts[key];
    setAdminSettings({
      ...adminSettings,
      customTexts: updatedTexts
    });
  };

  const resetAll = () => {
    if (confirm("¿Está seguro de que desea restaurar TODOS los textos de la aplicación a sus valores originales?")) {
      setAdminSettings({
        ...adminSettings,
        customTexts: {}
      });
      setAdminStatusMsg({ type: "success", text: "Se han limpiado todas las personalizaciones. Haga clic en 'Guardar Cambios' para confirmarlo en el servidor." });
    }
  };

  const filteredItems = AVAILABLE_TEXT_ITEMS.filter(item => item.category === activeCategory);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveSettings(e);
    // Refresh localStorage on save so that the updates propagate immediately
    try {
      localStorage.setItem("customTexts", JSON.stringify(adminSettings.customTexts || {}));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div id="textos_customizer_panel" className="bg-white rounded-2xl border border-slate-200/80 p-6 md:p-8 shadow-xs animate-in fade-in duration-300">
      <div className="border-b border-slate-100 pb-5 mb-6">
        <h3 className="text-base font-display font-semibold text-slate-900 flex items-center gap-2">
          <Type className="h-5 w-5 text-indigo-600" />
          Editor y Personalizador de Textos de la App
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
          Cambie cualquiera de los textos, botones, títulos, explicaciones y traducciones de la plataforma. Deje el campo vacío para utilizar el valor predeterminado.
        </p>
      </div>

      {adminStatusMsg && (
        <div className={`p-4 mb-6 rounded-xl border text-xs flex items-center justify-between shadow-3xs ${
          adminStatusMsg.type === "success"
            ? "bg-emerald-50/55 border-emerald-200 text-emerald-800"
            : "bg-red-50/55 border-red-200 text-red-800"
        }`}>
          <div className="flex items-center gap-2.5">
            {adminStatusMsg.type === "success" ? <Check className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-red-600" />}
            <span className="font-semibold">{adminStatusMsg.text}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setAdminStatusMsg(null)}
            className="text-[10px] uppercase font-bold text-slate-500 hover:text-slate-950 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors"
          >
            Cerrar
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Category Tabs */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 pb-4">
          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
                activeCategory === cat
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Inputs List */}
        <div className="space-y-5 bg-slate-50/40 p-4 sm:p-6 rounded-2xl border border-slate-100">
          {filteredItems.map(item => {
            const hasCustomValue = currentTexts[item.key] !== undefined && currentTexts[item.key] !== "";
            const displayValue = currentTexts[item.key] || "";

            return (
              <div key={item.key} className="space-y-2 bg-white p-5 rounded-xl border border-slate-200/70 shadow-3xs hover:border-slate-300 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    {item.label}
                    {hasCustomValue && (
                      <span className="text-[8px] bg-indigo-50 border border-indigo-100 text-indigo-700 font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                        Personalizado
                      </span>
                    )}
                  </label>
                  <button
                    type="button"
                    onClick={() => resetToDefault(item.key)}
                    disabled={!hasCustomValue}
                    className={`text-[10px] font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all ${
                      hasCustomValue
                        ? "text-red-600 hover:bg-red-50 cursor-pointer"
                        : "text-slate-300 cursor-not-allowed"
                    }`}
                    title="Restaurar valor predeterminado"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Restaurar
                  </button>
                </div>

                {item.isParagraph ? (
                  <textarea
                    rows={3}
                    value={displayValue}
                    onChange={(e) => handleTextChange(item.key, e.target.value)}
                    placeholder={`Por defecto: ${item.defaultValue}`}
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:outline-none placeholder-slate-400 font-medium bg-slate-50/20 focus:bg-white"
                  />
                ) : (
                  <input
                    type="text"
                    value={displayValue}
                    onChange={(e) => handleTextChange(item.key, e.target.value)}
                    placeholder={`Por defecto: ${item.defaultValue}`}
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:outline-none placeholder-slate-400 font-medium bg-slate-50/20 focus:bg-white"
                  />
                )}

                <div className="text-[10px] text-slate-400 flex items-center gap-1 pt-1 font-mono">
                  <HelpCircle className="h-3 w-3 shrink-0 text-slate-400" />
                  <span>Valor original: <span className="font-semibold text-slate-500 italic">"{item.defaultValue}"</span></span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Form Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-t border-slate-150/60 pt-6 gap-3">
          <button
            type="button"
            onClick={resetAll}
            className="px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200 rounded-xl transition-all cursor-pointer text-center"
          >
            Limpiar Todas las Personalizaciones
          </button>

          <button
            type="submit"
            disabled={adminLoading}
            className="px-5 py-2.5 text-xs font-bold bg-slate-900 hover:bg-slate-950 disabled:bg-slate-300 text-white rounded-xl shadow-xs hover:shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {adminLoading ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Guardando Cambios...
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                Guardar Todos los Cambios
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
