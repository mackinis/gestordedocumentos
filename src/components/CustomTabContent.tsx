import React, { useState } from "react";
import { Sparkles, Loader2, Trash2, Plus, Calendar, FileText, CheckCircle2, ChevronRight } from "lucide-react";
import { motion } from "motion/react";

interface CustomTabItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

interface CustomTab {
  id: string;
  name: string;
  icon?: string;
  createdAt: string;
  items: CustomTabItem[];
}

interface CustomTabContentProps {
  tab: CustomTab;
  currentUser: any;
  onRefresh: () => Promise<void>;
}

export default function CustomTabContent({ tab, currentUser, onRefresh }: CustomTabContentProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const isAdminOrManager = currentUser?.role === "ADMIN" || currentUser?.role === "MANAGER";

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!useAi && (!title.trim() || !content.trim())) {
      setErrorMsg("Por favor, ingrese el título y el contenido.");
      return;
    }
    if (useAi && !aiPrompt.trim()) {
      setErrorMsg("Por favor, ingrese la instrucción o prompt para la IA.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/custom-tabs/${tab.id}/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          useAi,
          aiPrompt: aiPrompt.trim()
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(useAi ? "Sección generada con éxito por la IA ✨" : "Sección creada con éxito.");
        setTitle("");
        setContent("");
        setAiPrompt("");
        setUseAi(false);
        setShowAddForm(false);
        await onRefresh();
      } else {
        setErrorMsg(data.message || "Error al agregar sección.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Error de conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!window.confirm("¿Está seguro de que desea eliminar esta sección?")) return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/custom-tabs/${tab.id}/items/${itemId}`, {
        method: "DELETE",
        headers: {
          "Authorization": token ? `Bearer ${token}` : ""
        }
      });

      if (res.ok) {
        await onRefresh();
      } else {
        const data = await res.json();
        alert(data.message || "Error al eliminar la sección.");
      }
    } catch (err) {
      console.error(err);
      alert("Error al conectar con el servidor.");
    }
  };

  // Hand-crafted markdown renderer for absolute performance and elegance
  const parseInlineFormatting = (text: string) => {
    const parts = text.split(/\*\*([^*]+)\*\*/g);
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return <strong key={index} className="font-semibold text-slate-950">{part}</strong>;
      }
      return part;
    });
  };

  const renderMarkdown = (text: string) => {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      if (line.startsWith("### ")) {
        return <h4 key={idx} className="text-xs uppercase font-bold text-slate-800 font-mono tracking-wider mt-4 mb-2">{line.replace("### ", "")}</h4>;
      }
      if (line.startsWith("#### ")) {
        return <h5 key={idx} className="text-xs font-semibold text-slate-700 mt-3 mb-1.5">{line.replace("#### ", "")}</h5>;
      }
      if (line.startsWith("## ")) {
        return <h3 key={idx} className="text-sm font-semibold text-slate-900 mt-5 mb-2.5 pb-1 border-b border-slate-100">{line.replace("## ", "")}</h3>;
      }
      if (line.startsWith("# ")) {
        return <h2 key={idx} className="text-base font-medium text-slate-950 mt-6 mb-3">{line.replace("# ", "")}</h2>;
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        const cleanLine = line.substring(2);
        return (
          <li key={idx} className="text-xs text-slate-600 ml-4 list-disc my-1 leading-relaxed">
            {parseInlineFormatting(cleanLine)}
          </li>
        );
      }
      const numMatch = line.match(/^(\d+)\.\s(.*)/);
      if (numMatch) {
        return (
          <li key={idx} className="text-xs text-slate-600 ml-4 list-decimal my-1 leading-relaxed">
            {parseInlineFormatting(numMatch[2])}
          </li>
        );
      }
      if (line.trim() === "") {
        return <div key={idx} className="h-2" />;
      }
      return (
        <p key={idx} className="text-xs text-slate-600 my-1 leading-relaxed">
          {parseInlineFormatting(line)}
        </p>
      );
    });
  };

  return (
    <div className="space-y-6 text-slate-800 animate-in fade-in duration-300">
      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white border border-slate-200 rounded-xl p-6 text-slate-900 shadow-xs gap-4">
        <div>
          <span className="text-[9px] uppercase font-semibold text-slate-500 font-mono tracking-widest bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded">
            Solapa Personalizada
          </span>
          <h2 className="text-lg font-display font-medium text-slate-950 tracking-tight mt-3 flex items-center gap-2">
            {tab.name}
          </h2>
          <p className="text-xs text-slate-500 max-w-lg mt-1.5 leading-relaxed">
            Estructura informativa, directivas o documentos creados para dar soporte administrativo de nivel corporativo.
          </p>
        </div>

        {isAdminOrManager && (
          <button
            onClick={() => {
              setShowAddForm(!showAddForm);
              setErrorMsg("");
              setSuccessMsg("");
            }}
            className="bg-slate-950 hover:bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-lg inline-flex items-center gap-1.5 cursor-pointer transition-all shadow-md shadow-slate-900/10"
          >
            {showAddForm ? "Cerrar Panel" : <><Plus className="h-4 w-4" /> Agregar Sección</>}
          </button>
        )}
      </div>

      {/* Forms & Messages */}
      {showAddForm && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs"
        >
          <div className="border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-slate-500" /> Nueva Sección Informativa
            </h3>
            <button
              onClick={() => {
                setUseAi(!useAi);
                setErrorMsg("");
              }}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 border transition-all cursor-pointer ${
                useAi
                  ? "bg-slate-950 text-white border-slate-950"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              }`}
            >
              <Sparkles className={`h-3.5 w-3.5 ${useAi ? "animate-pulse" : ""}`} />
              {useAi ? "Asistente IA: Activo" : "Usar Asistente IA (Gemini)"}
            </button>
          </div>

          <form onSubmit={handleAddItem} className="space-y-4">
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-lg text-xs font-semibold">
                ⚠ {errorMsg}
              </div>
            )}

            {!useAi ? (
              <>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Título de la Sección
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Procedimiento de Validación Hipotecaria"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-slate-950 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Contenido (Formato Markdown Simple)
                  </label>
                  <textarea
                    rows={6}
                    required
                    placeholder="Use ## para subtítulos, - para viñetas y ** para negritas."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono focus:outline-none focus:border-slate-950 focus:bg-white"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                  ¿Sobre qué tema deseas que Gemini genere la sección?
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Ej. Escribe una guía de auditoría detallada con 4 pasos clave para evaluar la solvencia de un garante en un contrato de alquiler inmobiliario..."
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-slate-950 focus:bg-white"
                />
                <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                  💡 El modelo generará de manera autónoma un título formal y un cuerpo de contenido exquisitamente estructurado utilizando el lenguaje del foco de negocio de la plataforma.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2.5 border-t border-slate-100 pt-4 mt-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="bg-slate-950 hover:bg-slate-900 disabled:bg-slate-400 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer flex items-center gap-1.5 shadow-md shadow-slate-950/10"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generando con Gemini...
                  </>
                ) : (
                  <>
                    {useAi ? <Sparkles className="h-3.5 w-3.5" /> : null}
                    {useAi ? "Generar con IA" : "Guardar Sección"}
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* Success Alert Banner */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-lg text-xs font-semibold">
          ✓ {successMsg}
        </div>
      )}

      {/* Sections List */}
      <div className="space-y-6">
        {!tab.items || tab.items.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-xs">
            <div className="inline-flex p-3 rounded-full bg-slate-50 border border-slate-200 mb-3 text-slate-400">
              <FileText className="h-6 w-6" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">No hay secciones todavía</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Esta solapa personalizada está vacía. {isAdminOrManager ? "Haga clic en 'Agregar Sección' arriba para redactar o generar contenido estructurado." : "Su administrador agregará contenido aquí a la brevedad."}
            </p>
          </div>
        ) : (
          tab.items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs"
            >
              {/* Card Header */}
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-slate-800" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 font-mono">
                    {item.title}
                  </h3>
                </div>

                <div className="flex items-center gap-4">
                  <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-slate-400 font-medium font-mono">
                    <Calendar className="h-3.5 w-3.5 text-slate-300" />
                    {new Date(item.createdAt).toLocaleDateString("es-ES", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric"
                    })}
                  </div>
                  {isAdminOrManager && (
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg cursor-pointer transition-all"
                      title="Eliminar Sección"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-5 text-left prose prose-sm max-w-none text-slate-700 space-y-2">
                {renderMarkdown(item.content)}
              </div>
            </motion.div>
          ))
        )}
      </div>

    </div>
  );
}
