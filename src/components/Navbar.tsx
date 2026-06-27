/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  Bell, 
  UserCheck, 
  ChevronDown, 
  Cpu, 
  LogOut, 
  FolderOpen, 
  ShieldAlert,
  ClipboardList,
  Sparkles,
  Inbox,
  Menu
} from "lucide-react";
import { User, Notification } from "../types";
import { getTranslations } from "../utils/commercialTranslations";

interface NavbarProps {
  currentUser: User;
  onLogout: () => void;
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  currentTab: string;
  onChangeTab: (tab: string) => void;
  commercialFocus?: string;
  onOpenProfile?: () => void;
  onToggleMobileSidebar?: () => void;
  hasNewUnseenApprovals?: boolean;
}

export default function Navbar({
  currentUser,
  onLogout,
  notifications,
  onMarkRead,
  onMarkAllRead,
  currentTab,
  onChangeTab,
  commercialFocus = "general",
  onOpenProfile,
  onToggleMobileSidebar,
  hasNewUnseenApprovals = false
}: NavbarProps) {
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showMobileDropdown, setShowMobileDropdown] = useState(false);

  const unreadNotifs = notifications.filter(n => !n.read);
  const translations = getTranslations(commercialFocus);

  const brandName = {
    juridico: "Módulo Jurídico",
    inmobiliaria: "Módulo Inmobiliario",
    escribania: "Módulo Notarial",
    financiero: "Módulo Financiero",
    general: "Gestor de Expedientes"
  }[commercialFocus] || "Gestor de Expedientes";

  const brandSub = {
    juridico: "Litigios & Casos",
    inmobiliaria: "Operaciones & Reservas",
    escribania: "Protocolos & Escrituras",
    financiero: "Créditos & Riesgo",
    general: "Procesos & Documentos"
  }[commercialFocus] || "Procesos & Documentos";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-100 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 relative">
        
        {/* Left spacing/placeholder */}
        <div className="flex items-center gap-3">
          {onToggleMobileSidebar && (
            <button
              onClick={onToggleMobileSidebar}
              className="md:hidden p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 focus:outline-none cursor-pointer"
              title="Abrir Menú"
            >
              <Menu className="h-4.5 w-4.5" />
            </button>
          )}
          <div className="flex items-center gap-1.5">
            <span className="flex h-2 w-2 relative">
              {hasNewUnseenApprovals && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400 hidden sm:inline">
              Sistema Activo
            </span>
          </div>
        </div>

        {/* Logo and Brand Centered */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2.5 cursor-pointer select-none" onClick={() => onChangeTab("cases")}>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm">
            <FolderOpen className="h-4.5 w-4.5" id="app-logo" />
          </div>
          <div className="text-left">
            <h1 className="font-display text-sm font-bold tracking-tight text-slate-950 leading-none">
              {brandName}
            </h1>
            <p className="text-[9px] font-bold tracking-widest text-slate-400 uppercase font-mono mt-0.5">
              {brandSub}
            </p>
          </div>
        </div>

        {/* Action Controls & Notifications & Profiles on the Right */}
        <div className="flex items-center gap-3">

          {/* ========================================================= */}
          {/* 1. MOBILE CONTROLS (only visible on mobile cellphones)    */}
          {/* ========================================================= */}
          <div className="relative md:hidden">
            <button
              type="button"
              onClick={() => {
                setShowMobileDropdown(!showMobileDropdown);
                setShowNotifMenu(false); // Close other if open
              }}
              id="navbar-profile-btn-mobile"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors cursor-pointer focus:outline-none"
              title="Mi Cuenta"
            >
              <img
                src={currentUser.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}`}
                alt={currentUser.name}
                className="h-6 w-6 rounded-md object-cover bg-white"
                referrerPolicy="no-referrer"
              />
              {unreadNotifs.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
                  {unreadNotifs.length}
                </span>
              )}
            </button>

            {showMobileDropdown && (
              <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 origin-top-right rounded-2xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-black/5 animate-in fade-in slide-in-from-top-2 z-50 text-slate-900">
                
                {/* SALIR / LOGOUT AL INICIO (TOP OF THE DROPDOWN) */}
                <div className="bg-rose-50/90 border border-rose-150/70 rounded-xl p-3 flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-rose-100 text-rose-600 rounded-lg">
                      <LogOut className="h-4 w-4" />
                    </div>
                    <div className="text-left">
                      <p className="text-[11px] font-bold text-rose-800">Cerrar Sesión</p>
                      <p className="text-[9px] text-rose-500 mt-0.5 font-mono">Salir de tu cuenta</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileDropdown(false);
                      onLogout();
                    }}
                    className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] rounded-lg transition-all cursor-pointer shadow-2xs"
                  >
                    Salir
                  </button>
                </div>

                {/* ABRIR PERFIL */}
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileDropdown(false);
                    if (onOpenProfile) onOpenProfile();
                  }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors text-left border border-slate-150 mb-3 cursor-pointer"
                >
                  <img
                    src={currentUser.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}`}
                    alt={currentUser.name}
                    className="h-8 w-8 rounded-lg object-cover bg-white border border-slate-200"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">Ver / Editar Perfil</p>
                    <p className="text-[10px] text-slate-400 truncate">{currentUser.email || "Configurar perfil"}</p>
                  </div>
                </button>

                {/* SECCION DE NOTIFICACIONES */}
                <div className="border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between px-1 mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Notificaciones</span>
                    {unreadNotifs.length > 0 && (
                      <button
                        onClick={() => {
                          onMarkAllRead();
                        }}
                        className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                      >
                        Marcar todo leído
                      </button>
                    )}
                  </div>
                  
                  <div className="max-h-48 overflow-y-auto space-y-1 p-0.5">
                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 text-center">
                        <Inbox className="h-5 w-5 text-slate-300 stroke-1" />
                        <p className="text-[10px] text-slate-400 mt-1">No hay alertas recientes.</p>
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => {
                            onMarkRead(n.id);
                            if (n.caseId) {
                              onChangeTab("cases");
                            }
                            setShowMobileDropdown(false);
                          }}
                          className={`flex gap-2 rounded-xl p-2 text-left transition-colors hover:bg-slate-50 cursor-pointer border border-transparent ${
                            !n.read ? "bg-slate-50/80 border-slate-100 font-medium" : ""
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 ${
                            n.type === "DANGER" ? "bg-red-500" :
                            n.type === "WARNING" ? "bg-amber-400" :
                            n.type === "SUCCESS" ? "bg-green-500" : "bg-blue-500"
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-slate-800 font-bold truncate leading-tight">{n.title}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5 leading-snug line-clamp-2">{n.message}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* 2. TABLET & PC CONTROLS (3 icons fully visible normally) */}
          {/* ========================================================= */}
          <div className="hidden md:flex items-center gap-3">
            
            {/* A. Notifications Bell with standard hover menu */}
            <div className="relative">
              <button
                id="notifications-bell"
                onClick={() => {
                  setShowNotifMenu(!showNotifMenu);
                  setShowMobileDropdown(false);
                }}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <Bell className="h-4.5 w-4.5 text-slate-600" />
                {unreadNotifs.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-white animate-pulse">
                    {unreadNotifs.length}
                  </span>
                )}
              </button>

              {showNotifMenu && (
                <div className="absolute right-0 mt-2 w-96 origin-top-right rounded-2xl border border-slate-150 bg-white p-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in slide-in-from-top-2 z-50">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 mb-1">
                    <h3 className="text-xs font-semibold text-slate-800">
                      Notificaciones en Tiempo Real
                    </h3>
                    {unreadNotifs.length > 0 && (
                      <button
                        onClick={() => onMarkAllRead()}
                        className="text-[11px] font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
                      >
                        Marcar todo leído
                      </button>
                    )}
                  </div>
                  
                  <div className="max-h-80 overflow-y-auto space-y-1 p-1">
                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                        <Inbox className="h-6 w-6 text-slate-300 stroke-1" />
                        <p className="text-xs text-slate-400 mt-2">Buzón vacío. No hay alertas recientes.</p>
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => {
                            onMarkRead(n.id);
                            if (n.caseId) {
                              onChangeTab("cases");
                            }
                          }}
                          className={`flex gap-3 rounded-lg p-2.5 text-xs transition-colors hover:bg-slate-50 cursor-pointer relative ${
                            !n.read ? "bg-slate-50 font-medium" : ""
                          }`}
                        >
                          <div className="mt-0.5">
                            <span className={`inline-block h-2.5 w-2.5 rounded-full ${
                              n.type === "DANGER" ? "bg-red-500" :
                              n.type === "WARNING" ? "bg-amber-400" :
                              n.type === "SUCCESS" ? "bg-green-500" : "bg-blue-500"
                            }`} />
                          </div>
                          <div className="flex-1">
                            <p className="text-slate-800 font-semibold">{n.title}</p>
                            <p className="text-slate-500 text-[11px] mt-0.5 leading-snug">{n.message}</p>
                            <p className="text-[9px] text-slate-400 mt-1 uppercase font-mono">
                              {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          {!n.read && (
                            <span className="absolute right-2 top-3 h-1.5 w-1.5 rounded-full bg-blue-600" />
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* B. Profile Button (Photo & Names) to trigger profile popup form modal */}
            <button
              type="button"
              onClick={onOpenProfile}
              id="navbar-profile-btn"
              className="border-l border-slate-200 pl-3 flex items-center gap-2.5 cursor-pointer hover:opacity-85 text-left focus:outline-none"
              title="Ver mi cuenta"
            >
              <img
                src={currentUser.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}`}
                alt={currentUser.name}
                className="h-9 w-9 rounded-xl border border-slate-200 object-cover bg-white"
                referrerPolicy="no-referrer"
              />
              <div className="text-left">
                <p className="text-xs font-bold text-slate-800 leading-none">{currentUser.name}</p>
                <p className="text-[10px] font-semibold text-slate-400 leading-none mt-1 uppercase font-mono tracking-wider">
                  {currentUser.role === "ADMIN" ? "Director" : currentUser.role}
                </p>
              </div>
            </button>

            {/* C. Logout Button (Icon only) for safe exits */}
            <button
              id="role-logout-trigger"
              onClick={onLogout}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-all cursor-pointer focus:outline-none"
              title="Cerrar sesión de forma segura"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>

          </div>

        </div>

      </div>
    </header>
  );
}
