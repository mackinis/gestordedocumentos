/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  X,
  User,
  Mail,
  Phone,
  Shield,
  Clock,
  Check,
  AlertTriangle,
  Sparkles,
  Camera,
  MapPin,
  Lock,
  Upload,
  Image as ImageIcon,
  LogOut
} from "lucide-react";
import { User as UserType } from "../types";
import { getTranslations } from "../utils/commercialTranslations";

import penguinAvatar from "../assets/images/avatar_penguin_1782389194428.jpg";
import penguinHeadphonesAvatar from "../assets/images/avatar_penguin_headphones_1782390693938.jpg";
import walrusAvatar from "../assets/images/avatar_walrus_1782389206476.jpg";
import walrusScarfAvatar from "../assets/images/avatar_walrus_scarf_1782390708042.jpg";
import cactusAvatar from "../assets/images/avatar_cactus_1782389220096.jpg";
import cactusGlassesAvatar from "../assets/images/avatar_cactus_glasses_1782390719805.jpg";
import ghostAvatar from "../assets/images/avatar_ghost_1782389230247.jpg";
import ghostDetectiveAvatar from "../assets/images/avatar_ghost_detective_1782390731666.jpg";

const PRESET_AVATARS = [
  { id: "cute-penguin", name: "Pinguinito 🐧", url: penguinAvatar },
  { id: "cute-penguin-headphones", name: "Pinguinito con Auriculares 🎧", url: penguinHeadphonesAvatar },
  { id: "cute-walrus", name: "La Morsa 🦭", url: walrusAvatar },
  { id: "cute-walrus-scarf", name: "La Morsa Abrigada 🦭🧣", url: walrusScarfAvatar },
  { id: "cute-cactus", name: "El Cactus 🌵", url: cactusAvatar },
  { id: "cute-cactus-glasses", name: "Cactus con Gafas 🌵🕶️", url: cactusGlassesAvatar },
  { id: "cute-ghost", name: "El Fantasmita 👻", url: ghostAvatar },
  { id: "cute-ghost-detective", name: "Fantasmita Detective 👻🕵️", url: ghostDetectiveAvatar },
];

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserType;
  token: string;
  onRefreshUser: () => void;
  commercialFocus?: string;
  onLogout?: () => void;
}

export default function ProfileModal({
  isOpen,
  onClose,
  currentUser,
  token,
  onRefreshUser,
  commercialFocus = "general",
  onLogout
}: ProfileModalProps) {
  const [name, setName] = useState(currentUser.name);
  const [email, setEmail] = useState(currentUser.email);
  const [phone, setPhone] = useState(currentUser.phone || "");
  const [address, setAddress] = useState(currentUser.address || "");
  const [seed, setSeed] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl || "");
  
  // Password states
  const [newPassword, setNewPassword] = useState("");
  const [passLoading, setPassLoading] = useState(false);
  const [passMessage, setPassMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Admin section: profile change requests
  const [changeRequests, setChangeRequests] = useState<any[]>([]);
  const [fetchingRequests, setFetchingRequests] = useState(false);

  const translations = getTranslations(commercialFocus);

  // Load Admin Requests if appropriate
  const fetchChangeRequests = async () => {
    if (currentUser.role !== "ADMIN") return;
    setFetchingRequests(true);
    try {
      const res = await fetch("/api/profile/change-requests", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setChangeRequests(data);
      }
    } catch (err) {
      console.error("Failed to fetch profile requests:", err);
    } finally {
      setFetchingRequests(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setName(currentUser.name);
      setEmail(currentUser.email);
      setPhone(currentUser.phone || "");
      setAddress(currentUser.address || "");
      setAvatarUrl(currentUser.avatarUrl || "");
      setNewPassword("");
      setPassMessage(null);
      setMessage(null);
      
      // Extract seed if it's a seed url
      if (currentUser.avatarUrl && currentUser.avatarUrl.includes("dicebear.com")) {
        const match = currentUser.avatarUrl.match(/seed=([^&]+)/);
        if (match) {
          setSeed(decodeURIComponent(match[1]));
        }
      } else {
        setSeed("");
      }

      if (currentUser.role === "ADMIN") {
        fetchChangeRequests();
      }
    }
  }, [isOpen, currentUser]);

  // Dicebear live avatar generation
  const handleGenerateAvatar = () => {
    const randomSeed = Math.random().toString(36).substring(2, 8);
    setSeed(randomSeed);
    const newUrl = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(randomSeed)}`;
    setAvatarUrl(newUrl);
  };

  const handleSeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSeed(val);
    if (val.trim()) {
      const newUrl = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(val)}`;
      setAvatarUrl(newUrl);
    } else {
      setAvatarUrl(`https://ui-avatars.com/api/?name=${encodeURIComponent(name || currentUser.name)}`);
    }
  };

  const handleLocalImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Por favor, seleccione un archivo de imagen válido.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAvatarUrl(reader.result);
        setSeed(""); // Clear seed since we have a custom local image
      }
    };
    reader.onerror = () => {
      alert("Error al cargar la imagen local.");
    };
    reader.readAsDataURL(file);
  };

  const handleCustomUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAvatarUrl(val);
    setSeed(""); // Clear seed since we entered a custom URL
  };

  const handleSelectPreset = (url: string) => {
    setAvatarUrl(url);
    setSeed(""); // Clear seed since we selected a preset
  };

  // Submit Profile Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          name,
          email,
          phone,
          avatarUrl,
          address
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        if (currentUser.role === "ADMIN") {
          setMessage({ text: "Tu perfil de Administrador ha sido actualizado de inmediato.", type: "success" });
        } else {
          // Asesor or Manager
          const isAnythingChanged = 
            name !== currentUser.name || 
            email !== currentUser.email;

          if (isAnythingChanged) {
            setMessage({
              text: `Se actualizó tu foto de perfil, teléfono y dirección. Los cambios a tu nombre o correo requieren la autorización del Director General y se han enviado en revisión.`,
              type: "info"
            });
          } else {
            setMessage({ text: "Tu perfil ha sido actualizado exitosamente.", type: "success" });
          }
        }
        
        // Let the parent app know stats/headers must refresh
        onRefreshUser();
      } else {
        setMessage({ text: data.message || "Error al actualizar perfil.", type: "error" });
      }
    } catch (err) {
      console.error(err);
      setMessage({ text: "Fallo técnico al conectarse al servicio de perfil.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // Change Password directly (Everyone is authorized to do this openly)
  const handlePasswordChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.trim().length < 4) {
      setPassMessage({ text: "La nueva clave debe tener al menos 4 caracteres.", type: "error" });
      return;
    }
    setPassLoading(true);
    setPassMessage(null);
    try {
      const res = await fetch("/api/profile/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setPassMessage({ text: "Tu contraseña ha sido cambiada de forma directa y segura.", type: "success" });
        setNewPassword("");
      } else {
        setPassMessage({ text: data.message || "Error al actualizar contraseña.", type: "error" });
      }
    } catch (err) {
      console.error(err);
      setPassMessage({ text: "Fallo de comunicación del servidor.", type: "error" });
    } finally {
      setPassLoading(false);
    }
  };

  // Resolve Request (ADMIN ONLY)
  const handleResolveRequest = async (requestId: string, status: "APROBADO" | "RECHAZADO") => {
    try {
      const res = await fetch(`/api/profile/change-requests/${requestId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });

      if (res.ok) {
        // Refresh requests list
        fetchChangeRequests();
        // Refresh main session
        onRefreshUser();
      } else {
        const d = await res.json();
        alert(d.message || "Error al procesar la solicitud.");
      }
    } catch (err) {
      console.error("Resolve req failed:", err);
    }
  };

  if (!isOpen) return null;

  const isSensitiveFieldChanged = 
    currentUser.role !== "ADMIN" && (
      name !== currentUser.name || 
      email !== currentUser.email || 
      phone !== (currentUser.phone || "") ||
      address !== (currentUser.address || "")
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        id="profile-modal-container"
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
          <div>
            <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400 font-mono">
              CUENTA Y PERFIL PERSONAL
            </span>
            <h3 className="text-base font-display font-semibold text-slate-900 mt-1">
              Mi Perfil ({currentUser.role === "ADMIN" ? "Director General" : currentUser.role === "MANAGER" ? translations.managerSingular : translations.advisorSingular})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg border border-slate-150 hover:bg-slate-50 transition-colors text-slate-500 hover:text-slate-900 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          {message && (
            <div className={`p-3.5 rounded-lg border text-xs leading-relaxed ${
              message.type === "success" ? "bg-emerald-50 border-emerald-150 text-emerald-800" :
              message.type === "info" ? "bg-blue-50 border-blue-150 text-blue-800" :
              "bg-red-50 border-red-150 text-red-800"
            }`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Avatar block */}
            <div className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-200/80">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* Current Avatar Circle / Square */}
                <div className="relative group shrink-0">
                  <img
                    src={avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(name || currentUser.name)}`}
                    alt="Perfil"
                    className="h-24 w-24 rounded-2xl border-2 border-slate-250 object-cover bg-white shadow-sm transition-all duration-300"
                    referrerPolicy="no-referrer"
                  />
                  
                  {/* Absolute Upload Badge */}
                  <label 
                    htmlFor="profile-image-uploader"
                    className="absolute inset-0 bg-black/45 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] uppercase font-bold cursor-pointer"
                  >
                    <Camera className="h-5 w-5 mb-1" />
                    <span>Subir Foto</span>
                  </label>
                  
                  <input
                    type="file"
                    accept="image/*"
                    id="profile-image-uploader"
                    className="hidden"
                    onChange={handleLocalImageUpload}
                  />
                </div>

                {/* Main description and quick upload button */}
                <div className="flex-1 text-center sm:text-left space-y-2.5">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 font-display">Imagen o Foto de Perfil</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Personaliza tu identidad en el panel. Puedes subir tu propia foto, ingresar un enlace, generar una caricatura con IA o elegir un diseño predeterminado.
                    </p>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                    <label
                      htmlFor="profile-image-uploader"
                      className="px-3 py-1.5 bg-white border border-slate-250 hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                    >
                      <Upload className="h-3.5 w-3.5 text-indigo-600" />
                      Subir de mi PC
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        const defaultUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name || currentUser.name)}&background=random`;
                        setAvatarUrl(defaultUrl);
                        setSeed("");
                      }}
                      className="px-3 py-1.5 bg-white border border-slate-250 hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                    >
                      <ImageIcon className="h-3.5 w-3.5 text-slate-500" />
                      Restaurar Iniciales
                    </button>
                  </div>
                </div>
              </div>

              {/* URL & AI Generation Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-200">
                {/* Custom URL Field */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase font-mono">
                    Enlace de Imagen (URL Directa)
                  </label>
                  <input
                    type="text"
                    value={avatarUrl && !avatarUrl.startsWith("data:") ? avatarUrl : ""}
                    onChange={handleCustomUrlChange}
                    className="w-full border border-slate-200 rounded-lg p-1.5 text-xs bg-white text-slate-900 focus:outline-slate-900"
                    placeholder="https://ejemplo.com/mi-foto.jpg"
                  />
                </div>

                {/* AI Generator field */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase font-mono">
                    Generador de Caricatura (Semilla de IA)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={seed}
                      onChange={handleSeedChange}
                      className="flex-1 border border-slate-200 rounded-lg p-1.5 text-xs bg-white text-slate-900 focus:outline-slate-900"
                      placeholder="Escribe tu nombre o apodo..."
                    />
                    <button
                      type="button"
                      onClick={handleGenerateAvatar}
                      className="px-2.5 py-1.5 border border-slate-200 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                      title="Generar semilla aleatoria"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
                      Aleatorio
                    </button>
                  </div>
                </div>
              </div>

              {/* Predefined Avatars Gallery Grid */}
              <div className="pt-3 border-t border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase font-mono">
                    Galería de Diseños Predeterminados ({PRESET_AVATARS.length})
                  </label>
                  {PRESET_AVATARS.some(p => p.url === avatarUrl) && (
                    <span className="text-[10px] font-bold text-emerald-600 font-mono flex items-center gap-0.5">
                      <Check className="h-3 w-3" /> Predeterminado Seleccionado
                    </span>
                  )}
                </div>
                
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 bg-white p-3 rounded-xl border border-slate-200/70 max-h-[140px] overflow-y-auto">
                  {PRESET_AVATARS.map((preset) => {
                    const isSelected = avatarUrl === preset.url;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPreset(preset.url)}
                        className={`relative rounded-xl overflow-hidden aspect-square border-2 transition-all p-0.5 bg-slate-50 cursor-pointer ${
                          isSelected 
                            ? "border-indigo-600 ring-2 ring-indigo-500/20 scale-95" 
                            : "border-slate-150 hover:border-slate-350 hover:scale-105"
                        }`}
                        title={`Elegir diseño: ${preset.name}`}
                      >
                        <img
                          src={preset.url}
                          alt={preset.name}
                          className="h-full w-full object-cover rounded-lg"
                          referrerPolicy="no-referrer"
                        />
                        {isSelected && (
                          <div className="absolute top-0.5 right-0.5 bg-indigo-600 text-white rounded-full p-0.5">
                            <Check className="h-2 w-2 stroke-[3]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Inputs Block */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider mb-1.5">
                  Nombre Completo
                </label>
                <div className="relative">
                  <User className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-9 border border-slate-250 rounded-lg p-2 text-xs bg-white text-slate-900 focus:bg-slate-50"
                  />
                </div>
                {currentUser.role !== "ADMIN" && (
                  <p className="text-[10px] text-slate-400 mt-1 italic">
                    Modificaciones requieren aprobación de la Dirección.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider mb-1.5">
                  Dirección de Correo
                </label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 border border-slate-250 rounded-lg p-2 text-xs bg-white text-slate-900 focus:bg-slate-50"
                  />
                </div>
                {currentUser.role !== "ADMIN" && (
                  <p className="text-[10px] text-slate-400 mt-1 italic">
                    Modificaciones requieren aprobación de la Dirección.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider mb-1.5">
                  Teléfono de Contacto (Corporativo)
                </label>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-9 border border-slate-250 rounded-lg p-2 text-xs bg-white text-slate-900 focus:bg-slate-50"
                  />
                </div>
                {currentUser.role !== "ADMIN" && (
                  <p className="text-[10px] text-slate-400 mt-1 italic">
                    Modificaciones requieren aprobación de la Dirección.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider mb-1.5">
                  Dirección Física de Trabajo
                </label>
                <div className="relative">
                  <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full pl-9 border border-slate-250 rounded-lg p-2 text-xs bg-white text-slate-900 focus:bg-slate-50"
                    placeholder="Ej. Calle Mayor 12, Planta 3, Oficina B"
                  />
                </div>
                {currentUser.role !== "ADMIN" && (
                  <p className="text-[10px] text-slate-400 mt-1 italic">
                    Modificaciones requieren aprobación de la Dirección.
                  </p>
                )}
              </div>
            </div>

            {/* Warnings context */}
            {isSensitiveFieldChanged && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-3 text-amber-900 text-[11px] leading-relaxed">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Datos de Identidad Sensibles Detectados:</span> Modificar su nombre, correo, teléfono o dirección residencial requiere que el Director General autorice la solicitud. Los cambios correspondientes se encolarán y se mantendrán pendientes de verificación.
                </div>
              </div>
            )}

            {/* Form footer */}
            <div className="flex gap-2 justify-end pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-150 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cerrar Ventana
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-slate-950 text-white text-xs font-bold rounded-lg hover:bg-slate-900 cursor-pointer shadow-md inline-flex items-center gap-1 disabled:opacity-50"
              >
                {loading ? "Procesando..." : "Actualizar Perfil"}
              </button>
            </div>

          </form>

          {/* Dedicated Open Password Management Section */}
          <div className="pt-6 border-t border-slate-100 space-y-4">
            <div className="flex items-center gap-1.5">
              <Lock className="h-4.5 w-4.5 text-indigo-650 text-indigo-600" />
              <h4 className="text-xs font-bold text-slate-900 tracking-tight font-display uppercase">
                Seguridad de Acceso (Autogestión Abierta)
              </h4>
            </div>

            {passMessage && (
              <div className={`p-3 rounded border text-xs ${
                passMessage.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"
              }`}>
                {passMessage.text}
              </div>
            )}

            <form onSubmit={handlePasswordChangeSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider mb-1.5">
                  Establecer Nueva Contraseña
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Escriba aquí la nueva contraseña"
                  className="w-full border border-slate-250 rounded-lg p-2 text-xs bg-white text-slate-900 focus:bg-slate-50"
                />
              </div>
              <div>
                <button
                  type="submit"
                  disabled={passLoading || !newPassword}
                  className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:bg-slate-350 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  {passLoading ? "Guardando..." : "Cambiar Clave"}
                </button>
              </div>
            </form>
            <p className="text-[10px] text-slate-400 italic">
              * La clave de acceso es privada y cada usuario la gestiona abiertamente en tiempo real sin requerir autorización administrativa.
            </p>
          </div>

          {/* Admin change requests verification pane */}
          {currentUser.role === "ADMIN" && (
            <div className="pt-6 border-t border-slate-100 space-y-4">
              <div className="flex items-center gap-1.5">
                <Shield className="h-4.5 w-4.5 text-slate-400" />
                <h4 className="text-xs font-bold text-slate-900 tracking-tight font-display uppercase">
                  Solicitudes Pendientes de Datos de Perfil ({changeRequests.filter(r => r.status === "PENDIENTE").length})
                </h4>
              </div>

              {fetchingRequests ? (
                <p className="text-slate-400 text-xs italic font-mono">Consultando base de solicitudes...</p>
              ) : changeRequests.length === 0 ? (
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-center">
                  <p className="text-slate-500 text-xs">No hay solicitudes pendientes de datos de asesores o managers.</p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {changeRequests.map((req: any) => {
                    const reqBadgeColors = 
                      req.status === "PENDIENTE" ? "bg-amber-50 text-amber-800 border-amber-200" :
                      req.status === "APROBADO" ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                      "bg-red-50 text-red-800 border-red-200";

                    return (
                      <div 
                        key={req.id} 
                        className="bg-white border border-slate-150 p-4 rounded-xl flex flex-col md:flex-row justify-between gap-4"
                      >
                        <div className="space-y-1.5 text-left">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{req.userName}</span>
                            <span className="text-[9px] uppercase font-bold text-slate-400 font-mono tracking-wider">({req.userRole})</span>
                            <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 border rounded ${reqBadgeColors}`}>
                              {req.status}
                            </span>
                          </div>
                          
                          <div className="text-[11px] text-slate-500 font-mono space-y-1">
                            {Object.keys(req.requestedData).map((field) => (
                              <div key={field} className="flex flex-wrap gap-1.5">
                                <span className="capitalize font-semibold text-slate-700">{field}:</span>
                                <span className="text-red-500 line-through">"{req.currentData[field] || 'vacio'}"</span>
                                <span>&rarr;</span>
                                <span className="text-emerald-600 font-semibold">"{req.requestedData[field]}"</span>
                              </div>
                            ))}
                          </div>

                          <p className="text-[9px] text-slate-400 font-mono uppercase mt-1">
                            Creado: {new Date(req.createdAt).toLocaleString()}
                          </p>
                        </div>

                        {req.status === "PENDIENTE" && (
                          <div className="flex items-center gap-2 self-start md:self-center">
                            <button
                              onClick={() => handleResolveRequest(req.id, "RECHAZADO")}
                              className="px-2.5 py-1 text-red-700 hover:text-white bg-red-50 border border-red-150 hover:bg-red-600 transition-colors text-[10px] font-bold rounded cursor-pointer"
                            >
                              Rechazar
                            </button>
                            <button
                              onClick={() => handleResolveRequest(req.id, "APROBADO")}
                              className="px-2.5 py-1 text-emerald-700 hover:text-white bg-emerald-50 border border-emerald-150 hover:bg-emerald-600 transition-colors text-[10px] font-bold rounded cursor-pointer"
                            >
                              Aprobar
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
