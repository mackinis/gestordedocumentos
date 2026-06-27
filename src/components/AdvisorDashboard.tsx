/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  FolderOpen,
  ClipboardList,
  AlertCircle,
  Clock,
  ArrowRight,
  UserCheck,
  CheckCircle2,
  FileText,
  Users,
  Plus
} from "lucide-react";
import { User, Case } from "../types";
import { getTranslations, getText } from "../utils/commercialTranslations";

interface AdvisorDashboardProps {
  currentUser: User;
  cases: Case[];
  onSelectCase: (caseId: string) => void;
  onRefreshDashboard: () => void;
  commercialFocus?: string;
  publicSettings?: { allowAdvisorViewProductivity: boolean };
  stats?: any;
  allAdvisors?: User[];
  onOpenCreateModal?: () => void;
  templates?: any[];
  caseRequests?: any[];
  onRequestCaseSubmit?: (title: string, desc: string, templateId: string, partyCounts?: { compradores: number; vendedores: number; garantes: number }) => Promise<any>;
}

export default function AdvisorDashboard({
  currentUser,
  cases,
  onSelectCase,
  onRefreshDashboard,
  commercialFocus = "general",
  publicSettings,
  stats,
  allAdvisors,
  onOpenCreateModal,
  templates = [],
  caseRequests = [],
  onRequestCaseSubmit
}: AdvisorDashboardProps) {
  // Modal states for requesting cases
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [reqTitle, setReqTitle] = useState("");
  const [reqDesc, setReqDesc] = useState("");
  const [reqTplId, setReqTplId] = useState("");
  const [loadingReq, setLoadingReq] = useState(false);
  const [reqCompradores, setReqCompradores] = useState(1);
  const [reqVendedores, setReqVendedores] = useState(1);
  const [reqGarantes, setReqGarantes] = useState(0);

  // Filter cases assigned to me
  const myCases = cases.filter(c => c.advisorId === currentUser.id);

  // Stats
  const activeCount = myCases.filter(c => c.status === "ACTIVO" || c.status === "PENDIENTE").length;
  const observedCount = myCases.filter(c => c.status === "OBSERVADO").length;
  const finishedCount = myCases.filter(c => c.status === "FINALIZADO").length;

  const translations = getTranslations(commercialFocus);

  return (
    <div className="space-y-6 font-sans">
      
      {/* Advisor custom header banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 text-slate-900 shadow-xs relative overflow-hidden">
        <div className="relative z-10 max-w-xl">
          <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 font-mono bg-slate-100 border border-slate-200 rounded px-2.5 py-1">
            Módulo de Asesoría ({translations.advisorSingular})
          </span>
          <h2 className="text-2xl font-display font-semibold text-slate-900 mt-5 tracking-tight">
            ¡Hola, {currentUser.name}!
          </h2>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            {getText("advisor.infoBox", `Aquí encontrará sus ${translations.casePlural.toLowerCase()} asignados. Complete los formularios, cargue la documentación requerida y resuelva observaciones de auditoría para avanzar de etapa.`)}
          </p>
          {currentUser.canCreateCases ? (
            onOpenCreateModal && (
              <div className="mt-5">
                <button
                  id="btn-open-create-case-advisor"
                  onClick={onOpenCreateModal}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-5 py-2.5 rounded-xl inline-flex items-center gap-2 cursor-pointer transition-all shadow-sm focus:ring-4 focus:ring-slate-900/10"
                >
                  <Plus className="h-4 w-4" />
                  {getText("advisor.btnCreate", "Iniciar Nuevo Expediente")}
                </button>
              </div>
            )
          ) : (
            <div className="mt-5">
              <button
                id="btn-open-request-case-advisor"
                onClick={() => {
                  setReqTitle("");
                  setReqDesc("");
                  setReqTplId(templates && templates.length > 0 ? templates[0].id : "");
                  setShowRequestModal(true);
                }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl inline-flex items-center gap-2 cursor-pointer transition-all shadow-sm focus:ring-4 focus:ring-indigo-600/10"
              >
                <Plus className="h-4 w-4" />
                {getText("advisor.btnRequest", "Solicitar Nuevo Expediente")}
              </button>
            </div>
          )}
        </div>

        {/* Short info indicators inside banner */}
        <div className="mt-8 grid grid-cols-3 gap-4 sm:gap-8 pt-6 border-t border-slate-100 max-w-md">
          <div className="space-y-0.5">
            <p className="text-[9px] text-slate-400 font-bold uppercase font-mono tracking-wider">Bandeja Activa</p>
            <p className="text-2xl font-bold font-display text-slate-900">{activeCount}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[9px] text-slate-400 font-bold uppercase font-mono tracking-wider">Observados</p>
            <p className="text-2xl font-bold font-display text-amber-600">{observedCount}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[9px] text-slate-400 font-bold uppercase font-mono tracking-wider">Concluidos</p>
            <p className="text-2xl font-bold font-display text-indigo-600">{finishedCount}</p>
          </div>
        </div>
      </div>



      {/* Productividad y Carga de Trabajo de Asesores (Habilitado por Manager / Admin) */}
      {publicSettings?.allowAdvisorViewProductivity && stats?.casesByAdvisor && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="mb-5">
            <span className="text-[10px] uppercase font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-md font-mono tracking-widest">
              Estadísticas de Equipo
            </span>
            <h3 className="font-display font-semibold text-slate-900 text-base mt-3 flex items-center gap-2">
              <Users className="h-4.5 w-4.5 text-slate-400" />
              Productividad y Carga de Trabajo de Asesores
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Visualización de carga laboral y eficiencia de resolución de expedientes autorizada por la administración.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-150 text-[10px] text-slate-400 font-bold uppercase font-mono bg-slate-50/50">
                  <th className="py-3 px-4">Asesor</th>
                  <th className="py-3 px-4 text-center">Legajos Asignados</th>
                  <th className="py-3 px-4 text-center">Activos</th>
                  <th className="py-3 px-4 text-center">Completados</th>
                  <th className="py-3 px-4">Porcentaje Eficiencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.casesByAdvisor.map((adv: any) => {
                  const rate = adv.totalCount > 0 ? Math.round((adv.completedCount / adv.totalCount) * 100) : 0;
                  const isMe = adv.id === currentUser.id;
                  return (
                    <tr key={adv.id} className={`transition-colors ${isMe ? "bg-slate-50/70 font-semibold" : "hover:bg-slate-50/50"}`}>
                      <td className="py-3 px-4 flex items-center gap-3">
                        <img
                          src={adv.avatarUrl || `https://ui-avatars.com/api/?name=${adv.name}`}
                          alt={adv.name}
                          className="h-8 w-8 rounded-xl object-cover border border-slate-100 bg-white"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <p className="text-xs font-semibold text-slate-800">
                            {adv.name} {isMe && <span className="text-[9px] bg-slate-200 text-slate-800 px-1.5 py-0.2 rounded font-mono ml-1.5 font-bold">TÚ</span>}
                          </p>
                          <p className="text-[10px] text-slate-400">Asesor de Procesos</p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center text-slate-800 font-medium">{adv.totalCount}</td>
                      <td className="py-3 px-4 text-center text-indigo-600 font-semibold">{adv.activeCount}</td>
                      <td className="py-3 px-4 text-center text-emerald-600 font-semibold">{adv.completedCount}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${rate}%` }} />
                          </div>
                          <span className="text-xs text-slate-600 font-bold font-mono">{rate}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Advisor's pending or rejected case requests */}
      {!currentUser.canCreateCases && caseRequests && caseRequests.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs text-left animate-in fade-in duration-300">
          <h4 className="text-sm font-semibold text-slate-800 uppercase tracking-wider mb-4 font-display">
            Mis Solicitudes de Expedientes
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {caseRequests.map((req) => {
              const reqTemplate = templates?.find(t => t.id === req.templateId);
              return (
                <div key={req.id} className="p-4 rounded-xl border border-slate-150 bg-slate-50/50 text-xs space-y-3 text-left hover:border-slate-300 transition-all">
                  <div className="flex justify-between items-start gap-3">
                    <span className="font-semibold text-slate-900 break-words block text-xs">{req.title}</span>
                    <span className={`text-[8px] font-bold px-2 py-0.5 rounded-md font-mono shrink-0 uppercase tracking-widest border ${
                      req.status === "PENDIENTE" ? "bg-amber-50 text-amber-700 border-amber-200" :
                      req.status === "CREADO" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                      "bg-rose-50 text-rose-700 border-rose-200"
                    }`}>
                      {req.status === "PENDIENTE" ? "Pendiente" : req.status === "CREADO" ? "Aprobado" : "Rechazado"}
                    </span>
                  </div>
                  {req.description && (
                    <p className="text-slate-500 text-[11px] italic">"{req.description}"</p>
                  )}
                  <div className="pt-3 border-t border-slate-100 text-[10px] text-slate-500 font-mono space-y-1">
                    <p>📋 <strong>Flujo:</strong> {reqTemplate ? reqTemplate.name : "Por asignar"}</p>
                    <p>📅 <strong>Fecha:</strong> {new Date(req.createdAt).toLocaleString("es-ES")}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SOLICITAR NUEVO EXPEDIENTE MODAL */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!reqTitle || !reqTplId) {
                alert("El título y la plantilla son campos obligatorios.");
                return;
              }
              if (onRequestCaseSubmit) {
                setLoadingReq(true);
                try {
                  await onRequestCaseSubmit(reqTitle, reqDesc, reqTplId, {
                    compradores: reqCompradores,
                    vendedores: reqVendedores,
                    garantes: reqGarantes
                  });
                  setShowRequestModal(false);
                } catch (err) {
                  // Error handled in callback
                } finally {
                  setLoadingReq(false);
                }
              }
            }}
            className="bg-white border text-slate-905 border-slate-200 rounded-3xl p-6 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200"
          >
            <h3 className="font-display font-bold text-base text-slate-950 mb-1">{getText("title.solicitarApertura", "Solicitar Apertura de Expediente")}</h3>
            <p className="text-xs text-slate-500 mb-5">
              Su cuenta requiere autorización para iniciar nuevos legajos. Envíe una solicitud detallando el caso para que sea revisada por un manager.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Título comercial del legajo</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Fideicomiso Torres de Belgrano"
                  value={reqTitle}
                  onChange={(e) => setReqTitle(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white text-slate-900 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Plantilla de Flujo Operativo</label>
                <select
                  required
                  value={reqTplId}
                  onChange={(e) => setReqTplId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white text-slate-900 focus:outline-hidden focus:border-indigo-500 font-semibold"
                >
                  <option value="">Seleccione una plantilla...</option>
                  {templates?.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
                  ))}
                </select>
              </div>

              {/* Cantidad de personas por parte */}
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">Cantidad de Personas por Parte (Formularios)</label>
                <p className="text-[10px] text-slate-500 mb-2">Especifique cuántas personas participan en cada rol para la carga de formularios.</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 block mb-1">Compradores</label>
                    <input
                      type="number"
                      min="0"
                      value={reqCompradores}
                      onChange={(e) => setReqCompradores(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full border border-slate-200 rounded p-1 text-xs bg-white text-slate-900 focus:outline-hidden focus:border-indigo-500 font-medium"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 block mb-1">Vendedores</label>
                    <input
                      type="number"
                      min="0"
                      value={reqVendedores}
                      onChange={(e) => setReqVendedores(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full border border-slate-200 rounded p-1 text-xs bg-white text-slate-900 focus:outline-hidden focus:border-indigo-500 font-medium"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 block mb-1">Garantes</label>
                    <input
                      type="number"
                      min="0"
                      value={reqGarantes}
                      onChange={(e) => setReqGarantes(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full border border-slate-200 rounded p-1 text-xs bg-white text-slate-900 focus:outline-hidden focus:border-indigo-500 font-medium"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Descripción o Notas Adicionales</label>
                <textarea
                  placeholder="Escriba los motivos o notas del expediente..."
                  value={reqDesc}
                  onChange={(e) => setReqDesc(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white text-slate-900 focus:outline-hidden focus:border-indigo-500 min-h-[80px]"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowRequestModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loadingReq}
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 cursor-pointer shadow-md shadow-indigo-600/10 disabled:bg-slate-400"
              >
                {loadingReq ? "Enviando..." : getText("btn.enviarSolicitud", "Enviar Solicitud")}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
