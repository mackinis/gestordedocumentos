/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Mail,
  Inbox,
  Trash2,
  Send,
  Paperclip,
  Search,
  Settings,
  Shield,
  Plus,
  X,
  Check,
  File,
  AlertTriangle,
  RefreshCw,
  FolderOpen,
  Reply,
  Forward,
  CornerUpLeft,
  Trash
} from "lucide-react";
import { User, Message, MessagingSettings, UserRole } from "../types";

interface MessagesViewProps {
  currentUser: User;
  availableUsers: User[];
  onRefreshGlobalData: () => void;
}

export default function MessagesView({
  currentUser,
  availableUsers,
  onRefreshGlobalData
}: MessagesViewProps) {
  // Navigation tabs: "inbox" | "sent" | "trash" | "admin-settings"
  const [currentBox, setCurrentBox] = useState<"inbox" | "sent" | "trash" | "admin-settings">(
    currentUser.role === "ADMIN" ? "inbox" : "inbox"
  );

  // States
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  // Compose State
  const [showCompose, setShowCompose] = useState(false);
  const [composeRecipient, setComposeRecipient] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeAttachments, setComposeAttachments] = useState<Array<{ name: string; fileUrl: string; fileType?: string }>>([]);
  const [composeError, setComposeError] = useState("");
  const [composeSuccess, setComposeSuccess] = useState("");
  const [sending, setSending] = useState(false);
  const [parentMsgId, setParentMsgId] = useState<string | undefined>(undefined);

  // Admin Settings State
  const [adminSettings, setAdminSettings] = useState<MessagingSettings | null>(null);
  const [updatingSettings, setUpdatingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load messaging settings (for Admin or for recipient filtration)
  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/admin/messaging-settings", {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setAdminSettings(data);
      } else {
        // Fallback or read from public settings
        const publicSettingsRes = await fetch("/api/settings/public");
        if (publicSettingsRes.ok) {
          const publicData = await publicSettingsRes.json();
          if (publicData.messagingSettings) {
            setAdminSettings(publicData.messagingSettings);
          }
        }
      }
    } catch (err) {
      console.error("Error fetching messaging settings:", err);
    }
  };

  // Fetch messages based on selected box
  const fetchMessages = async (box: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/messages?box=${box}`, {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error("Error fetching messages:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    if (currentBox !== "admin-settings") {
      fetchMessages(currentBox);
      setSelectedMessage(null);
    }
  }, [currentBox]);

  // Handle Mark as Read
  const handleReadMessage = async (msg: Message) => {
    if (msg.read || msg.recipientId !== currentUser.id) return;
    try {
      const res = await fetch(`/api/messages/${msg.id}/read`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (res.ok) {
        // update locally
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read: true } : m));
        onRefreshGlobalData();
      }
    } catch (err) {
      console.error("Error marking message as read:", err);
    }
  };

  // Move to Trash
  const handleMoveToTrash = async (msgId: string) => {
    try {
      const res = await fetch(`/api/messages/${msgId}/trash`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (res.ok) {
        setSelectedMessage(null);
        fetchMessages(currentBox);
        onRefreshGlobalData();
      }
    } catch (err) {
      console.error("Error moving message to trash:", err);
    }
  };

  // Restore from Trash
  const handleRestoreFromTrash = async (msgId: string) => {
    try {
      const res = await fetch(`/api/messages/${msgId}/restore`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (res.ok) {
        setSelectedMessage(null);
        fetchMessages(currentBox);
        onRefreshGlobalData();
      }
    } catch (err) {
      console.error("Error restoring message:", err);
    }
  };

  // Permanently Delete
  const handlePermanentDelete = async (msgId: string) => {
    if (!confirm("¿Está seguro de que desea eliminar permanentemente este mensaje? Esta acción no se puede deshacer.")) return;
    try {
      const res = await fetch(`/api/messages/${msgId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (res.ok) {
        setSelectedMessage(null);
        fetchMessages(currentBox);
        onRefreshGlobalData();
      }
    } catch (err) {
      console.error("Error deleting message permanently:", err);
    }
  };

  // File upload to Base64
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = () => {
        setComposeAttachments(prev => [
          ...prev,
          {
            name: file.name,
            fileUrl: reader.result as string,
            fileType: file.type
          }
        ]);
      };
      reader.readAsDataURL(file);
    }
  };

  // Send Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeRecipient) {
      setComposeError("Debe seleccionar un destinatario.");
      return;
    }

    setSending(true);
    setComposeError("");
    setComposeSuccess("");

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          recipientId: composeRecipient,
          subject: composeSubject,
          body: composeBody,
          attachments: composeAttachments,
          parentMessageId: parentMsgId
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setComposeError(data.message || "Error al enviar el mensaje.");
      } else {
        setComposeSuccess("¡Mensaje enviado con éxito!");
        setTimeout(() => {
          setShowCompose(false);
          // clear fields
          setComposeRecipient("");
          setComposeSubject("");
          setComposeBody("");
          setComposeAttachments([]);
          setParentMsgId(undefined);
          fetchMessages(currentBox);
          onRefreshGlobalData();
        }, 1200);
      }
    } catch (err) {
      setComposeError("Error de conexión al enviar el mensaje.");
    } finally {
      setSending(false);
    }
  };

  // Admin Save Settings
  const handleSaveAdminSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSettings) return;

    setUpdatingSettings(true);
    setSettingsSuccess("");

    try {
      const res = await fetch("/api/admin/messaging-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify(adminSettings)
      });

      if (res.ok) {
        setSettingsSuccess("Configuración de mensajería actualizada correctamente.");
        setTimeout(() => setSettingsSuccess(""), 3000);
      } else {
        alert("Error al actualizar la configuración.");
      }
    } catch (err) {
      console.error("Error updating settings:", err);
    } finally {
      setUpdatingSettings(false);
    }
  };

  // Helper to reply
  const startReply = (msg: Message) => {
    setComposeRecipient(msg.senderId);
    setComposeSubject(msg.subject.startsWith("Re:") ? msg.subject : `Re: ${msg.subject}`);
    setComposeBody(`\n\n--- El ${new Date(msg.createdAt).toLocaleString()}, ${msg.senderName} escribió: ---\n> ${msg.body.split("\n").join("\n> ")}`);
    setParentMsgId(msg.id);
    setComposeAttachments([]);
    setComposeError("");
    setComposeSuccess("");
    setShowCompose(true);
  };

  // Helper to forward
  const startForward = (msg: Message) => {
    setComposeRecipient("");
    setComposeSubject(msg.subject.startsWith("Fwd:") ? msg.subject : `Fwd: ${msg.subject}`);
    setComposeBody(`\n\n--- Mensaje reenviado ---\nDe: ${msg.senderName} (${msg.senderRole})\nPara: ${msg.recipientName}\nFecha: ${new Date(msg.createdAt).toLocaleString()}\nAsunto: ${msg.subject}\n\n${msg.body}`);
    setParentMsgId(undefined);
    setComposeAttachments(msg.attachments || []);
    setComposeError("");
    setComposeSuccess("");
    setShowCompose(true);
  };

  // Filter recipient options based on Admin settings for current role
  const getAllowedRecipients = () => {
    if (!adminSettings) return availableUsers.filter(u => u.id !== currentUser.id && u.status === "APPROVED");
    
    return availableUsers.filter(user => {
      if (user.id === currentUser.id) return false;
      if (user.status !== "APPROVED") return false;

      // Check if current user is allowed sender
      if (!adminSettings.allowedSenders.includes(currentUser.role)) return false;

      // Check if there is an enabled channel from currentUser.role to user.role
      const channel = adminSettings.allowedChannels.find(
        c => c.from === currentUser.role && c.to === user.role
      );
      return channel ? channel.enabled : false;
    });
  };

  // Search filter
  const filteredMessages = messages.filter(
    (m) =>
      m.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.body.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.senderName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.recipientName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="font-sans space-y-6">
      
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 text-slate-900 shadow-xs relative overflow-hidden flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 font-mono bg-slate-100 border border-slate-200 rounded px-2.5 py-1">
            Mensajería Interna
          </span>
          <h2 className="text-2xl font-display font-semibold text-slate-900 mt-4 tracking-tight">
            Centro de Comunicaciones
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Envíe y reciba mensajes de forma segura entre asesores, gerentes y directores.
          </p>
        </div>

        {adminSettings && adminSettings.allowedSenders.includes(currentUser.role) && (
          <button
            onClick={() => {
              setComposeRecipient("");
              setComposeSubject("");
              setComposeBody("");
              setComposeAttachments([]);
              setParentMsgId(undefined);
              setComposeError("");
              setComposeSuccess("");
              setShowCompose(true);
            }}
            className="bg-slate-950 hover:bg-slate-850 text-white font-bold text-xs px-5 py-3 rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-md"
          >
            <Plus className="h-4 w-4" />
            Redactar Mensaje
          </button>
        )}
      </div>

      {/* Horizontal Tabs at the top */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCurrentBox("inbox")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              currentBox === "inbox"
                ? "bg-slate-950 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Inbox className="h-4 w-4" />
            <span>Bandeja de Entrada</span>
          </button>

          <button
            onClick={() => setCurrentBox("sent")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              currentBox === "sent"
                ? "bg-slate-950 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Send className="h-4 w-4" />
            <span>Enviados</span>
          </button>

          <button
            onClick={() => setCurrentBox("trash")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              currentBox === "trash"
                ? "bg-slate-950 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Trash2 className="h-4 w-4" />
            <span>Papelera</span>
          </button>

          {currentUser.role === "ADMIN" && (
            <button
              onClick={() => setCurrentBox("admin-settings")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                currentBox === "admin-settings"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-indigo-600"
              }`}
            >
              <Settings className="h-4 w-4" />
              <span>Reglas de Mensajería</span>
            </button>
          )}
        </div>

        {/* Quick stats or rule indicator horizontally */}
        {adminSettings && (
          <div className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 flex items-center gap-2 text-[11px] text-slate-600">
            <Shield className="h-4 w-4 text-slate-400 shrink-0" />
            <span>
              {adminSettings.awaitReplyRule ? (
                <span className="text-amber-700 font-semibold flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Se requiere esperar respuesta antes de enviar consecutivos.
                </span>
              ) : (
                "Mensajería libre (sin esperas obligatorias)"
              )}
            </span>
          </div>
        )}
      </div>

      {/* Main Mail Container */}
      <div className="w-full">
        {/* Messaging Central Hub / Admin Panel */}
        <div className="w-full">
          
          {currentBox === "admin-settings" && adminSettings ? (
            
            /* Admin Messaging Rules Configuration */
            <form onSubmit={handleSaveAdminSettings} className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-base font-display font-semibold text-slate-900 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-indigo-600" />
                  Reglas de Control de Mensajería Interna
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Establezca qué perfiles pueden enviarse mensajes entre sí y los límites de flujo consecutivos.
                </p>
              </div>

              {settingsSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  {settingsSuccess}
                </div>
              )}

              {/* Allowed Senders */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
                  ¿Quiénes pueden enviar mensajes?
                </label>
                <div className="flex flex-wrap gap-4">
                  {(["ADMIN", "MANAGER", "ASESOR"] as UserRole[]).map((role) => (
                    <label key={role} className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={adminSettings.allowedSenders.includes(role)}
                        onChange={(e) => {
                          const updated = e.target.checked
                            ? [...adminSettings.allowedSenders, role]
                            : adminSettings.allowedSenders.filter((r) => r !== role);
                          setAdminSettings({ ...adminSettings, allowedSenders: updated });
                        }}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>
                        {role === "ADMIN" ? "Director General (ADMIN)" : role === "MANAGER" ? "Gerentes (MANAGER)" : "Asesores (ASESOR)"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Consecutive Message Flow Limits */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
                  Límite de flujo consecutivos
                </label>
                <label className="flex items-start gap-3 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adminSettings.awaitReplyRule}
                    onChange={(e) => setAdminSettings({ ...adminSettings, awaitReplyRule: e.target.checked })}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 mt-0.5"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block">Exigir respuesta antes de volver a enviar</span>
                    <span className="text-slate-500 text-[11px] block mt-1 leading-relaxed">
                      Si está marcado, un remitente no podrá enviar un segundo mensaje al mismo destinatario hasta que éste le haya contestado al menos una vez (evita spam o insistencia).
                    </span>
                  </div>
                </label>
              </div>

              {/* Inter-Role Allowed Channels */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
                  Permitir Mensajería Entre Roles Específicos
                </label>
                <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
                  Defina explícitamente qué perfiles pueden iniciar conversaciones con qué otros perfiles.
                </p>

                <div className="overflow-x-auto border border-slate-150 rounded-xl">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-150 font-bold font-mono text-slate-500">
                        <th className="py-2.5 px-4 text-left">Desde (Remitente)</th>
                        <th className="py-2.5 px-4 text-center">Hacia ADMIN</th>
                        <th className="py-2.5 px-4 text-center">Hacia MANAGER</th>
                        <th className="py-2.5 px-4 text-center">Hacia ASESOR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {(["ADMIN", "MANAGER", "ASESOR"] as UserRole[]).map((fromRole) => (
                        <tr key={fromRole}>
                          <td className="py-3 px-4 font-bold text-slate-800 bg-slate-50/20">
                            {fromRole === "ADMIN" ? "Director General" : fromRole === "MANAGER" ? "Gerentes" : "Asesores"}
                          </td>
                          {(["ADMIN", "MANAGER", "ASESOR"] as UserRole[]).map((toRole) => {
                            const index = adminSettings.allowedChannels.findIndex(
                              (c) => c.from === fromRole && c.to === toRole
                            );
                            const isEnabled = index !== -1 ? adminSettings.allowedChannels[index].enabled : false;

                            return (
                              <td key={toRole} className="py-3 px-4 text-center">
                                <input
                                  type="checkbox"
                                  checked={isEnabled}
                                  onChange={(e) => {
                                    const updatedChannels = [...adminSettings.allowedChannels];
                                    if (index !== -1) {
                                      updatedChannels[index].enabled = e.target.checked;
                                    } else {
                                      updatedChannels.push({ from: fromRole, to: toRole, enabled: e.target.checked });
                                    }
                                    setAdminSettings({ ...adminSettings, allowedChannels: updatedChannels });
                                  }}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Submit Settings */}
              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={updatingSettings}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-6 py-2.5 rounded-xl disabled:opacity-50 transition-all cursor-pointer"
                >
                  {updatingSettings ? "Guardando..." : "Guardar Cambios"}
                </button>
              </div>
            </form>

          ) : (

            /* Dual-pane Inbox list and viewer layout */
            <div className="grid grid-cols-1 md:grid-cols-12 border border-slate-200 bg-white rounded-2xl shadow-xs min-h-[500px] overflow-hidden">
              
              {/* Left Pane: Message list */}
              <div className={`${selectedMessage ? "hidden md:block" : "block"} md:col-span-5 border-r border-slate-150 flex flex-col h-[600px]`}>
                
                {/* Search Bar */}
                <div className="p-3 border-b border-slate-100 relative">
                  <input
                    type="text"
                    placeholder="Buscar por asunto, texto o nombre..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-slate-300 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none"
                  />
                  <Search className="absolute left-6 top-5 h-3.5 w-3.5 text-slate-400" />
                </div>

                {/* List Container */}
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
                      <RefreshCw className="h-6 w-6 animate-spin mb-2" />
                      <span className="text-xs">Cargando correspondencia...</span>
                    </div>
                  ) : filteredMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 px-4">
                      <Mail className="h-8 w-8 stroke-1 text-slate-300 mb-2" />
                      <span className="text-xs font-bold text-slate-500">No hay mensajes</span>
                      <span className="text-[10px] mt-1 text-slate-400">Su bandeja de correspondencia está limpia.</span>
                    </div>
                  ) : (
                    filteredMessages.map((msg) => {
                      const isUnread = !msg.read && msg.recipientId === currentUser.id;
                      const partnerName = msg.senderId === currentUser.id ? msg.recipientName : msg.senderName;
                      const partnerRole = msg.senderId === currentUser.id ? msg.recipientRole : msg.senderRole;

                      return (
                        <div
                          key={msg.id}
                          onClick={() => {
                            setSelectedMessage(msg);
                            handleReadMessage(msg);
                          }}
                          className={`p-3.5 text-left cursor-pointer transition-all hover:bg-slate-50/80 relative ${
                            selectedMessage?.id === msg.id ? "bg-slate-50" : ""
                          } ${isUnread ? "bg-slate-50/30 border-l-4 border-slate-950" : "border-l-4 border-transparent"}`}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <span className={`text-[11px] font-bold truncate text-slate-800 ${isUnread ? "font-extrabold text-slate-950" : ""}`}>
                              {partnerName}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400 whitespace-nowrap">
                              {new Date(msg.createdAt).toLocaleDateString([], { day: '2-digit', month: '2-digit' })}
                            </span>
                          </div>
                          
                          <div className="text-[9px] font-mono uppercase text-slate-400 font-bold tracking-wide mt-0.5">
                            {partnerRole === "ADMIN" ? "Director" : partnerRole}
                          </div>

                          <p className={`text-xs mt-1.5 truncate text-slate-700 ${isUnread ? "font-bold text-slate-900" : ""}`}>
                            {msg.subject}
                          </p>
                          <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                            {msg.body}
                          </p>

                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="flex items-center gap-1 text-[9px] text-slate-400 font-semibold mt-2">
                              <Paperclip className="h-3 w-3" />
                              <span>{msg.attachments.length} adjunto(s)</span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Pane: Message details or welcome */}
              <div className={`${!selectedMessage ? "hidden md:block" : "block"} md:col-span-7 flex flex-col h-[600px] bg-slate-50/20`}>
                
                {selectedMessage ? (
                  <div className="flex flex-col h-full bg-white">
                    {/* Header Controls */}
                    <div className="p-4 border-b border-slate-150 flex items-center justify-between bg-slate-50/40">
                      <button
                        onClick={() => setSelectedMessage(null)}
                        className="md:hidden flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                      >
                        <CornerUpLeft className="h-4 w-4" />
                        <span>Volver</span>
                      </button>

                      <div className="flex items-center gap-2 ml-auto">
                        {currentBox !== "trash" ? (
                          <>
                            {adminSettings && adminSettings.allowedSenders.includes(currentUser.role) && (
                              <>
                                <button
                                  onClick={() => startReply(selectedMessage)}
                                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                                  title="Responder"
                                >
                                  <Reply className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Responder</span>
                                </button>
                                <button
                                  onClick={() => startForward(selectedMessage)}
                                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                                  title="Reenviar"
                                >
                                  <Forward className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Reenviar</span>
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleMoveToTrash(selectedMessage.id)}
                              className="p-1.5 rounded-lg border border-red-100 bg-red-50 hover:bg-red-100 text-red-600 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                              title="Enviar a Papelera"
                            >
                              <Trash className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Eliminar</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleRestoreFromTrash(selectedMessage.id)}
                              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                              title="Restaurar"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              <span>Restaurar</span>
                            </button>
                            <button
                              onClick={() => handlePermanentDelete(selectedMessage.id)}
                              className="p-1.5 rounded-lg border border-red-100 bg-red-50 hover:bg-red-100 text-red-600 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                              title="Eliminar Permanentemente"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Borrar Permanente</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Meta info block */}
                    <div className="p-4 border-b border-slate-100 space-y-2">
                      <h3 className="text-sm font-bold text-slate-900">
                        {selectedMessage.subject}
                      </h3>
                      
                      <div className="flex justify-between items-start gap-4">
                        <div className="text-xs text-slate-600 space-y-0.5">
                          <p>
                            <span className="font-semibold text-slate-400">De: </span>
                            <span className="font-bold text-slate-800">{selectedMessage.senderName}</span>
                            <span className="text-[10px] uppercase font-mono bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded ml-2">
                              {selectedMessage.senderRole === "ADMIN" ? "Director" : selectedMessage.senderRole}
                            </span>
                          </p>
                          <p>
                            <span className="font-semibold text-slate-400">Para: </span>
                            <span className="text-slate-700">{selectedMessage.recipientName}</span>
                            <span className="text-[10px] uppercase font-mono bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded ml-2">
                              {selectedMessage.recipientRole === "ADMIN" ? "Director" : selectedMessage.recipientRole}
                            </span>
                          </p>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono text-right">
                          {new Date(selectedMessage.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Body content */}
                    <div className="flex-1 p-6 overflow-y-auto prose max-w-none text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                      {selectedMessage.body}
                    </div>

                    {/* Attachments preview */}
                    {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
                      <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                        <span className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider block mb-2">
                          Archivos Adjuntos ({selectedMessage.attachments.length})
                        </span>
                        <div className="flex flex-wrap gap-2.5">
                          {selectedMessage.attachments.map((file, i) => (
                            <a
                              key={i}
                              href={file.fileUrl}
                              download={file.name}
                              className="inline-flex items-center gap-2 p-2 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-700 transition-all cursor-pointer shadow-2xs"
                              title="Haga clic para descargar el archivo"
                            >
                              <File className="h-4 w-4 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[150px]">{file.name}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 p-6">
                    <FolderOpen className="h-10 w-10 stroke-1 text-slate-300 mb-2" />
                    <span className="text-xs font-bold text-slate-500">Seleccione un mensaje</span>
                    <span className="text-[10px] mt-1 text-slate-400">Elija cualquier correspondencia de la lista para leerla en este panel.</span>
                  </div>
                )}

              </div>

            </div>
          )}

        </div>

      </div>

      {/* COMPOSE POPUP FORM MODAL */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            
            <button
              onClick={() => setShowCompose(false)}
              className="absolute right-4 top-4 p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="border-b border-slate-100 pb-4 mb-5">
              <h3 className="text-base font-display font-semibold text-slate-900 flex items-center gap-2">
                <Send className="h-5 w-5 text-indigo-600" />
                Redactar Nuevo Mensaje Interno
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Envíe un mensaje de correspondencia privado a otro perfil habilitado.
              </p>
            </div>

            {composeError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-xl flex items-center gap-2 mb-4">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{composeError}</span>
              </div>
            )}

            {composeSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2 mb-4">
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{composeSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="space-y-4">
              {/* Recipient selection */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
                  Destinatario (Usuario)
                </label>
                <select
                  required
                  value={composeRecipient}
                  onChange={(e) => setComposeRecipient(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-slate-300 rounded-xl px-4 py-2.5 text-xs focus:outline-none"
                >
                  <option value="">-- Seleccionar Destinatario Autorizado --</option>
                  {getAllowedRecipients().map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.role === "ADMIN" ? "Director" : user.role}) - {user.email}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400">
                  La lista muestra únicamente los destinatarios que las Reglas de Mensajería del Administrador habilitan para su rol.
                </p>
              </div>

              {/* Subject */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
                  Asunto
                </label>
                <input
                  type="text"
                  required
                  placeholder="Escriba el motivo o asunto del mensaje..."
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-slate-300 rounded-xl px-4 py-2.5 text-xs focus:outline-none"
                />
              </div>

              {/* Body */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
                  Mensaje
                </label>
                <textarea
                  required
                  rows={8}
                  placeholder="Escriba su mensaje con detalle aquí..."
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-slate-300 rounded-xl px-4 py-3 text-xs focus:outline-none resize-none"
                />
              </div>

              {/* Attachments Drop/Select */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
                  Archivos Adjuntos (Opcional)
                </label>
                
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 p-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-250 rounded-xl text-xs font-bold text-slate-700 transition-all cursor-pointer"
                  >
                    <Paperclip className="h-4 w-4 text-slate-500" />
                    <span>Adjuntar Archivo</span>
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    multiple
                  />
                  <span className="text-[10px] text-slate-400">Soporta cualquier archivo local. Guardado en la base de datos de forma persistente.</span>
                </div>

                {composeAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {composeAttachments.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg text-xs">
                        <File className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-semibold text-slate-700 truncate max-w-[150px]">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => setComposeAttachments(prev => prev.filter((_, idx) => idx !== i))}
                          className="p-0.5 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-md cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit / Cancel buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCompose(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="px-5 py-2 bg-slate-950 hover:bg-slate-850 text-white text-xs font-bold rounded-xl inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer transition-all shadow-md"
                >
                  {sending ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      <span>Enviar Mensaje</span>
                    </>
                  )}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
