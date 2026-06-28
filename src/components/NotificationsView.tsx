/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  Bell,
  Check,
  Archive,
  Inbox,
  AlertTriangle,
  CheckCircle2,
  Info,
  Clock,
  History,
  CheckSquare,
  Trash2
} from "lucide-react";
import { Notification, User } from "../types";

interface NotificationsViewProps {
  currentUser: User;
  notifications: Notification[];
  onRefreshNotifications: () => void;
}

export default function NotificationsView({
  currentUser,
  notifications,
  onRefreshNotifications
}: NotificationsViewProps) {
  // Sub-tabs: "recent" | "archived"
  const [subTab, setSubTab] = useState<"recent" | "archived">("recent");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Delete notification permanently from the history
  const handleDeleteNotification = async (id: string) => {
    if (!window.confirm("¿Está seguro de que desea eliminar permanentemente esta notificación de su historial?")) {
      return;
    }
    setActionLoading(id);
    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (res.ok) {
        onRefreshNotifications();
      }
    } catch (err) {
      console.error("Error deleting notification:", err);
    } finally {
      setActionLoading(null);
    }
  };

  // Filter based on the current subTab selection
  const filteredNotifications = notifications.filter((notif) => {
    const isArchived = !!notif.archived;
    if (subTab === "recent") {
      return !isArchived;
    } else {
      return isArchived;
    }
  });

  // Mark single as read
  const handleMarkRead = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (res.ok) {
        onRefreshNotifications();
      }
    } catch (err) {
      console.error("Error marking notification as read:", err);
    } finally {
      setActionLoading(null);
    }
  };

  // Archive single (Only allowed after it is read!)
  const handleArchive = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/notifications/${id}/archive`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (res.ok) {
        onRefreshNotifications();
      }
    } catch (err) {
      console.error("Error archiving notification:", err);
    } finally {
      setActionLoading(null);
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    try {
      const res = await fetch("/api/notifications/read-all", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (res.ok) {
        onRefreshNotifications();
      }
    } catch (err) {
      console.error("Error marking all notifications as read:", err);
    }
  };

  // Get helper colors & icons for notification types
  const getAlertDetails = (type?: "INFO" | "SUCCESS" | "WARNING" | "DANGER") => {
    switch (type) {
      case "DANGER":
        return {
          bg: "bg-rose-50 border-rose-150",
          text: "text-rose-800",
          icon: <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
        };
      case "WARNING":
        return {
          bg: "bg-amber-50 border-amber-150",
          text: "text-amber-850",
          icon: <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        };
      case "SUCCESS":
        return {
          bg: "bg-emerald-50 border-emerald-150",
          text: "text-emerald-800",
          icon: <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
        };
      default:
        return {
          bg: "bg-blue-50 border-blue-150",
          text: "text-blue-800",
          icon: <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        };
    }
  };

  const unreadCount = notifications.filter(n => !n.read && !n.archived).length;

  return (
    <div className="font-sans space-y-6">
      
      {/* Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 text-slate-900 shadow-xs relative overflow-hidden flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 font-mono bg-slate-100 border border-slate-200 rounded px-2.5 py-1">
            Centro de Notificaciones
          </span>
          <h2 className="text-2xl font-display font-semibold text-slate-900 mt-4 tracking-tight">
            Notificaciones y Alertas del Sistema
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Entérese al instante de las actualizaciones, comentarios, revisiones de auditoría y novedades de sus expedientes.
          </p>
        </div>

        {subTab === "recent" && unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="bg-slate-950 hover:bg-slate-850 text-white font-bold text-xs px-5 py-3 rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-md"
          >
            <CheckSquare className="h-4 w-4" />
            Marcar todo leído
          </button>
        )}
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Navigation / Switcher */}
        <div className="lg:col-span-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-1 shadow-xs">
            <button
              onClick={() => setSubTab("recent")}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                subTab === "recent"
                  ? "bg-slate-950 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <Bell className="h-4 w-4" />
                <span>Alertas Recientes</span>
              </div>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setSubTab("archived")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                subTab === "archived"
                  ? "bg-slate-950 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <History className="h-4 w-4" />
              <span>Historial Archivado</span>
            </button>
          </div>
        </div>

        {/* Content list pane */}
        <div className="lg:col-span-9 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs min-h-[400px]">
          
          <div className="border-b border-slate-100 pb-4 mb-6 flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">
              {subTab === "recent" ? "Alertas y Notificaciones Activas" : "Historial de Alertas Archivadas"}
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              {filteredNotifications.length} elemento(s)
            </span>
          </div>

          <div className="space-y-4">
            {filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
                <Inbox className="h-10 w-10 text-slate-300 stroke-1 mb-2 animate-bounce" />
                <span className="text-xs font-bold text-slate-500">
                  {subTab === "recent" ? "¡Está al día!" : "Historial vacío"}
                </span>
                <span className="text-[10px] mt-1 text-slate-400">
                  {subTab === "recent"
                    ? "No tiene notificaciones pendientes por leer o archivar."
                    : "Aún no ha archivado ninguna notificación en esta sesión."}
                </span>
              </div>
            ) : (
              filteredNotifications.map((notif) => {
                const isUnread = !notif.read;
                const alertStyle = getAlertDetails(notif.type);

                return (
                  <div
                    key={notif.id}
                    onClick={() => {
                      if (isUnread) {
                        handleMarkRead(notif.id);
                      }
                    }}
                    className={`p-4 rounded-2xl border transition-all relative ${alertStyle.bg} ${
                      isUnread ? "ring-2 ring-indigo-500/10 cursor-pointer shadow-sm font-medium" : "shadow-2xs opacity-85"
                    }`}
                  >
                    {/* Unread circle badge */}
                    {isUnread && (
                      <span className="absolute top-4 right-4 h-2.5 w-2.5 rounded-full bg-indigo-600 animate-ping" />
                    )}

                    <div className="flex gap-4">
                      {alertStyle.icon}
                      
                      <div className="flex-1 space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                          <h4 className={`text-xs font-bold ${alertStyle.text}`}>
                            {notif.title}
                          </h4>
                          <span className="text-[9px] text-slate-400 font-mono flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(notif.createdAt).toLocaleString()}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed">
                          {notif.message}
                        </p>

                        {/* Interactive Buttons block */}
                        <div className="flex items-center gap-3 pt-3 mt-1.5 border-t border-slate-200/50 w-full">
                          {isUnread ? (
                            <button
                              disabled={actionLoading === notif.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMarkRead(notif.id);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-700 rounded-lg cursor-pointer transition-all shadow-3xs"
                            >
                              <Check className="h-3 w-3 text-slate-500" />
                              <span>Marcar como Leído</span>
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-100/60 px-2 py-1 rounded">
                              <Check className="h-3.5 w-3.5 text-slate-400" />
                              Leído
                            </span>
                          )}

                          {/* Only allow archiving AFTER it is marked as read, as per user's rules: "las pueden archivar despues de haberlas leido ( o sea cliqueado)" */}
                          {!notif.archived && (
                            <button
                              disabled={isUnread || actionLoading === notif.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleArchive(notif.id);
                              }}
                              className={`inline-flex items-center gap-1 px-3 py-1 border text-[10px] font-bold rounded-lg cursor-pointer transition-all ${
                                isUnread
                                  ? "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed"
                                  : "bg-indigo-50 hover:bg-indigo-100/70 text-indigo-700 border-indigo-100 shadow-3xs"
                              }`}
                              title={isUnread ? "Debe leer la notificación haciendo clic antes de poder archivarla." : "Archivar notificación"}
                            >
                              <Archive className="h-3 w-3" />
                              <span>Archivar</span>
                            </button>
                          )}

                          {/* Trash button for permanent deletion */}
                          <button
                            disabled={actionLoading === notif.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteNotification(notif.id);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-rose-50 hover:bg-rose-100/70 text-rose-700 border border-rose-150 text-[10px] font-bold rounded-lg cursor-pointer transition-all shadow-3xs ml-auto"
                            title="Eliminar permanentemente del historial"
                          >
                            <Trash2 className="h-3 w-3 text-rose-600" />
                            <span>Eliminar</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>
      </div>

    </div>
  );
}
