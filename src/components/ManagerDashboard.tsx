/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  ClipboardList,
  Plus,
  Trash2,
  Calendar,
  Layers,
  FileText,
  User,
  ShieldCheck,
  Zap,
  HelpCircle,
  FileSpreadsheet,
  RefreshCw,
  Clock,
  History,
  AlertCircle,
  Sliders,
  Edit2,
  Check
} from "lucide-react";
import { User as UserType, ProcessTemplate, AuditLog, Case } from "../types";
import { getTranslations } from "../utils/commercialTranslations";
import TextosCustomizerPanel from "./TextosCustomizerPanel";

interface ManagerDashboardProps {
  currentUser: UserType;
  templates: ProcessTemplate[];
  onCreateTemplate: (template: any) => void;
  onDeleteTemplate: (id: string) => void;
  auditLogs: AuditLog[];
  onRefreshDashboard: () => void;
  stats: any;
  cases?: Case[];
  commercialFocus?: string;
  onSimulateUser?: (user: UserType) => void;
  forcedTab?: "stats" | "templates" | "audit" | "admin_users" | "configuracion" | "textos";
  caseRequests?: any[];
  onOpenCreateCaseModal?: (prefilledData?: { title: string; description: string; templateId: string; advisorId: string; requestId?: string; partyCounts?: { compradores: number; vendedores: number; garantes: number } }) => void;
}

export default function ManagerDashboard({
  currentUser,
  templates,
  onCreateTemplate,
  onDeleteTemplate,
  auditLogs,
  onRefreshDashboard,
  stats,
  cases = [],
  commercialFocus = "general",
  onSimulateUser,
  forcedTab,
  caseRequests = [],
  onOpenCreateCaseModal
}: ManagerDashboardProps) {
  // Modes: "stats" | "templates" | "audit" | "admin_users" | "configuracion" | "textos"
  const [activeTab, setActiveTab] = useState<"stats" | "templates" | "audit" | "admin_users" | "configuracion" | "textos">("stats");

  useEffect(() => {
    if (forcedTab) {
      setActiveTab(forcedTab);
    }
  }, [forcedTab]);

  const translations = getTranslations(commercialFocus);

  // User management and role assignment state
  const [newUserRole, setNewUserRole] = useState<"MANAGER" | "ASESOR">("MANAGER");
  const [selectedExploreUser, setSelectedExploreUser] = useState<any>(null);
  const [selectedProdAdvisorId, setSelectedProdAdvisorId] = useState<string | null>(null);
  const [prodCardTab, setProdCardTab] = useState<"asesor" | "asignados" | "activos" | "completados" | "eficiencia" | "observados">("asesor");
  const [prodLegajoFilter, setProdLegajoFilter] = useState<"ALL" | "ACTIVE" | "COMPLETED" | "OBSERVADO">("ALL");
  const [rejectingCaseRequestId, setRejectingCaseRequestId] = useState<string | null>(null);
  const [deletingCaseRequestId, setDeletingCaseRequestId] = useState<string | null>(null);
  const [caseRequestsTab, setCaseRequestsTab] = useState<"PENDIENTES" | "HISTORIAL">("PENDIENTES");

  // Admin section state variables
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminSettings, setAdminSettings] = useState<any>({
    verificationChannel: "EMAIL",
    messageTemplate: "Hola {{name}}, tu token de verificación es: {{token}}",
    resendApiKey: "",
    resendFromEmail: "onboarding@resend.dev",
    twilioSid: "",
    twilioAuthToken: "",
    twilioFromNumber: "",
    commercialFocus: "general",
    allowAdvisorViewProductivity: false
  });
  const [newManagerEmail, setNewManagerEmail] = useState("");
  const [newManagerPassword, setNewManagerPassword] = useState("");
  const [newManagerName, setNewManagerName] = useState("");
  const [newManagerPhone, setNewManagerPhone] = useState("");
  const [adminStatusMsg, setAdminStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  // Custom Tabs State & Handlers
  const [customTabs, setCustomTabs] = useState<any[]>([]);
  const [newTabName, setNewTabName] = useState("");
  const [newTabIcon, setNewTabIcon] = useState("Layout");

  const fetchCustomTabs = async () => {
    try {
      const res = await fetch("/api/custom-tabs");
      if (res.ok) {
        const data = await res.json();
        setCustomTabs(data);
      }
    } catch (err) {
      console.error("Error fetching custom tabs:", err);
    }
  };

  const handleCreateCustomTabSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTabName.trim()) return;

    setAdminLoading(true);
    setAdminStatusMsg(null);

    const token = localStorage.getItem("token") || `real-jwt-token-for-${currentUser.id}`;

    try {
      const res = await fetch("/api/custom-tabs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ name: newTabName.trim(), icon: newTabIcon })
      });

      const data = await res.json();
      if (res.ok) {
        setAdminStatusMsg({ type: "success", text: `Solapa "${newTabName}" creada exitosamente.` });
        setNewTabName("");
        await fetchCustomTabs();
        if (onRefreshDashboard) {
          onRefreshDashboard();
        }
      } else {
        setAdminStatusMsg({ type: "error", text: data.message || "Error al crear la solapa." });
      }
    } catch (err: any) {
      console.error(err);
      setAdminStatusMsg({ type: "error", text: "Error de red al conectar con el servidor." });
    } finally {
      setAdminLoading(false);
    }
  };

  const handleDeleteCustomTab = async (tabId: string, tabName: string) => {
    if (!window.confirm(`¿Está seguro de que desea eliminar la solapa "${tabName}"? Se perderán todas sus secciones asociadas.`)) {
      return;
    }

    setAdminLoading(true);
    setAdminStatusMsg(null);

    const token = localStorage.getItem("token") || `real-jwt-token-for-${currentUser.id}`;

    try {
      const res = await fetch(`/api/custom-tabs/${tabId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (res.ok) {
        setAdminStatusMsg({ type: "success", text: "Solapa eliminada correctamente." });
        await fetchCustomTabs();
        if (onRefreshDashboard) {
          onRefreshDashboard();
        }
      } else {
        setAdminStatusMsg({ type: "error", text: data.message || "Error al eliminar la solapa." });
      }
    } catch (err) {
      console.error(err);
      setAdminStatusMsg({ type: "error", text: "Error de red al conectar con el servidor." });
    } finally {
      setAdminLoading(false);
    }
  };

  // States to allow ADMIN to directly edit advisor & manager profiles
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editRole, setEditRole] = useState<"MANAGER" | "ASESOR">("ASESOR");
  const [editStatus, setEditStatus] = useState("APPROVED");
  const [editCanCreateCases, setEditCanCreateCases] = useState(false);

  const startEditingUser = (u: any) => {
    setEditingUser(u);
    setEditName(u.name || "");
    setEditEmail(u.email || "");
    setEditPhone(u.phone || "");
    setEditAddress(u.address || "");
    setEditRole(u.role || "ASESOR");
    setEditStatus(u.status || "APPROVED");
    setEditCanCreateCases(!!u.canCreateCases);
  };

  const handleSaveEditedUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    const token = localStorage.getItem("token") || `real-jwt-token-for-${currentUser.id}`;
    try {
      let res;
      if (currentUser.role === "MANAGER") {
        res = await fetch(`/api/users/${editingUser.id}/update-create-permission`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            canCreateCases: editCanCreateCases
          })
        });
      } else {
        res = await fetch(`/api/admin/users/${editingUser.id}/update-profile`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            name: editName,
            email: editEmail,
            phone: editPhone,
            address: editAddress,
            role: editRole,
            status: editStatus,
            canCreateCases: editCanCreateCases
          })
        });
      }

      const data = await res.json();
      if (res.ok && data.success) {
        setEditingUser(null);
        fetchAdminData();
        onRefreshDashboard();
        setAdminStatusMsg({ type: "success", text: "Datos actualizados exitosamente." });
      } else {
        setAdminStatusMsg({ type: "error", text: data.message || "Error al actualizar perfil de personal." });
      }
    } catch (err) {
      console.error(err);
      setAdminStatusMsg({ type: "error", text: "Error de conexión al guardar cambios." });
    }
  };

  const handleToggleCreatePermission = async (userToToggle: any) => {
    const token = localStorage.getItem("token") || `real-jwt-token-for-${currentUser.id}`;
    const newStatus = !userToToggle.canCreateCases;
    setAdminLoading(true);
    try {
      const res = await fetch(`/api/users/${userToToggle.id}/update-create-permission`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          canCreateCases: newStatus
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await fetchAdminData();
        onRefreshDashboard();
        setAdminStatusMsg({ type: "success", text: `Permiso de creación de expedientes ${newStatus ? "habilitado" : "deshabilitado"} para ${userToToggle.name}.` });
      } else {
        setAdminStatusMsg({ type: "error", text: data.message || "Error al actualizar permiso." });
      }
    } catch (err) {
      console.error(err);
      setAdminStatusMsg({ type: "error", text: "Error de conexión al guardar cambios." });
    } finally {
      setAdminLoading(false);
    }
  };

  const fetchAdminData = async () => {
    if (currentUser.role !== "ADMIN" && currentUser.role !== "MANAGER") return;
    try {
      const token = localStorage.getItem("token") || `real-jwt-token-for-${currentUser.id}`;
      // Fetch users
      const usersRes = await fetch("/api/users");
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        if (currentUser.role === "MANAGER") {
          // Managers see Advisors they manage (or all list)
          setAdminUsers(usersData.filter((u: any) => u.role === "ASESOR"));
        } else {
          setAdminUsers(usersData);
        }
      }
      
      // Fetch settings config
      if (currentUser.role === "ADMIN" || currentUser.role === "MANAGER") {
        const settingsRes = await fetch("/api/admin/settings", {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          setAdminSettings(settingsData);
        }
        await fetchCustomTabs();
      }
    } catch (err) {
      console.error("Error loading admin info:", err);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, [currentUser]);

  useEffect(() => {
    if (activeTab === "admin_users" || activeTab === "stats") {
      fetchAdminData();
    }
  }, [activeTab]);

  const handleApproveAdvisor = async (id: string) => {
    try {
      const token = localStorage.getItem("token") || `real-jwt-token-for-${currentUser.id}`;
      const res = await fetch(`/api/admin/users/${id}/approve`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setAdminStatusMsg({ type: "success", text: "Asesor aprobado y confirmado exitosamente en el sistema." });
        fetchAdminData();
        onRefreshDashboard();
      } else {
        setAdminStatusMsg({ type: "error", text: data.message || "Error al aprobar asesor." });
      }
    } catch (err: any) {
      setAdminStatusMsg({ type: "error", text: err.message });
    }
  };

  const handleRejectAdvisor = async (id: string) => {
    try {
      const token = localStorage.getItem("token") || `real-jwt-token-for-${currentUser.id}`;
      const res = await fetch(`/api/admin/users/${id}/reject`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setAdminStatusMsg({ type: "success", text: "Solicitud de registro de asesor rechazada exitosamente." });
        fetchAdminData();
        onRefreshDashboard();
      } else {
        setAdminStatusMsg({ type: "error", text: data.message || "Error al rechazar asesor." });
      }
    } catch (err: any) {
      setAdminStatusMsg({ type: "error", text: err.message });
    }
  };

  const handleSuspendUser = async (id: string) => {
    try {
      const token = localStorage.getItem("token") || `real-jwt-token-for-${currentUser.id}`;
      const res = await fetch(`/api/admin/users/${id}/suspend`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setAdminStatusMsg({ type: "success", text: "Usuario suspendido temporalmente de forma exitosa." });
        fetchAdminData();
        onRefreshDashboard();
      } else {
        setAdminStatusMsg({ type: "error", text: data.message || "Error al suspender usuario." });
      }
    } catch (err: any) {
      setAdminStatusMsg({ type: "error", text: err.message });
    }
  };

  const handleBanUser = async (id: string) => {
    try {
      const token = localStorage.getItem("token") || `real-jwt-token-for-${currentUser.id}`;
      const res = await fetch(`/api/admin/users/${id}/ban`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setAdminStatusMsg({ type: "success", text: "Usuario bloqueado y baneado del sistema con éxito." });
        fetchAdminData();
        onRefreshDashboard();
      } else {
        setAdminStatusMsg({ type: "error", text: data.message || "Error al banear usuario." });
      }
    } catch (err: any) {
      setAdminStatusMsg({ type: "error", text: err.message });
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      const token = localStorage.getItem("token") || `real-jwt-token-for-${currentUser.id}`;
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setAdminStatusMsg({ type: "success", text: "Usuario eliminado definitivamente del sistema." });
        fetchAdminData();
        onRefreshDashboard();
      } else {
        setAdminStatusMsg({ type: "error", text: data.message || "Error al eliminar usuario." });
      }
    } catch (err: any) {
      setAdminStatusMsg({ type: "error", text: err.message });
    }
  };

  const handleRejectCaseRequest = async (requestId: string) => {
    const token = localStorage.getItem("token") || `real-jwt-token-for-${currentUser.id}`;
    try {
      const res = await fetch(`/api/case-requests/${requestId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ status: "RECHAZADO" })
      });
      if (res.ok) {
        onRefreshDashboard();
        setAdminStatusMsg({ type: "success", text: "Solicitud de expediente rechazada con éxito." });
      } else {
        const data = await res.json();
        setAdminStatusMsg({ type: "error", text: data.message || "Error al rechazar la solicitud." });
      }
    } catch (err) {
      console.error(err);
      setAdminStatusMsg({ type: "error", text: "Error de conexión al procesar la solicitud." });
    }
  };

  const handleDeleteCaseRequest = async (requestId: string) => {
    const token = localStorage.getItem("token") || `real-jwt-token-for-${currentUser.id}`;
    try {
      const res = await fetch(`/api/case-requests/${requestId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (res.ok) {
        onRefreshDashboard();
        setAdminStatusMsg({ type: "success", text: "Registro de solicitud eliminado permanentemente." });
      } else {
        const data = await res.json();
        setAdminStatusMsg({ type: "error", text: data.message || "Error al eliminar el registro de solicitud." });
      }
    } catch (err) {
      console.error(err);
      setAdminStatusMsg({ type: "error", text: "Error de conexión al eliminar la solicitud." });
    }
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newManagerEmail || !newManagerPassword || !newManagerName) {
      setAdminStatusMsg({ type: "error", text: "Por favor ingrese email, contraseña y nombre para el nuevo usuario." });
      return;
    }
    setAdminLoading(true);
    setAdminStatusMsg(null);
    try {
      const token = localStorage.getItem("token") || `real-jwt-token-for-${currentUser.id}`;
      const isAsesor = newUserRole === "ASESOR";
      const targetEndpoint = isAsesor ? "/api/admin/create-advisor" : "/api/admin/create-manager";
      const res = await fetch(targetEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          email: newManagerEmail,
          password: newManagerPassword,
          name: newManagerName,
          phone: newManagerPhone
        })
      });
      const data = await res.json();
      if (res.ok) {
        setAdminStatusMsg({ 
          type: "success", 
          text: `Usuario (${isAsesor ? "Asesor" : "Manager"}) ${newManagerName} creado exitosamente con credenciales habilitadas.` 
        });
        setNewManagerEmail("");
        setNewManagerPassword("");
        setNewManagerName("");
        setNewManagerPhone("");
        fetchAdminData();
        onRefreshDashboard();
      } else {
        setAdminStatusMsg({ type: "error", text: data.message || "Error al crear la cuenta." });
      }
    } catch (err: any) {
      setAdminStatusMsg({ type: "error", text: err.message });
    } finally {
      setAdminLoading(false);
    }
  };

  const handleSaveSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminLoading(true);
    setAdminStatusMsg(null);
    try {
      const token = localStorage.getItem("token") || `real-jwt-token-for-${currentUser.id}`;
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(adminSettings)
      });
      const data = await res.json();
      if (res.ok) {
        setAdminStatusMsg({ type: "success", text: "Canales de verificación y textos de plantillas guardados con éxito real." });
        fetchAdminData();
        if (onRefreshDashboard) onRefreshDashboard();
      } else {
        setAdminStatusMsg({ type: "error", text: data.message || "Error al actualizar configuración de registro." });
      }
    } catch (err: any) {
      setAdminStatusMsg({ type: "error", text: err.message });
    } finally {
      setAdminLoading(false);
    }
  };

  // Template Creator state
  const [showCreator, setShowCreator] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplCategory, setTplCategory] = useState("Inmobiliaria");
  const [tplDescription, setTplDescription] = useState("");
  const [tplStages, setTplStages] = useState<any[]>([
    {
      name: "Etapa 1: Admisión",
      description: "Recepción inicial de antecedentes y apertura de legajo.",
      requirements: [
        { type: "DOCUMENT", name: "DNI de Contacto", required: true },
        { type: "TASK", name: "Crear ficha física", required: true }
      ]
    }
  ]);

  // AI Generator state
  const [useAI, setUseAI] = useState(false);
  const [usePDF, setUsePDF] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [aiSector, setAiSector] = useState("");
  const [aiDescription, setAiDescription] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [operationType, setOperationType] = useState("");

  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [newCustomCategory, setNewCustomCategory] = useState("");
  const [editingCategoryIdx, setEditingCategoryIdx] = useState<number | null>(null);
  const [editingCategoryValue, setEditingCategoryValue] = useState("");

  const getCategoriesForFocus = (focus: string | undefined, settings: any) => {
    const custom = settings?.customCategories?.[focus || "general"];
    if (custom && Array.isArray(custom) && custom.length > 0) {
      return custom;
    }
    switch (focus) {
      case "inmobiliaria":
        return ["Reserva", "Alquiler", "Venta"];
      case "juridico":
        return ["Litigio Civil", "Demanda Laboral", "Asesoramiento Corporativo", "Trámite Administrativo"];
      case "escribania":
        return ["Escritura de Compraventa", "Poder Especial / General", "Donación", "Acta Notarial"];
      case "financiero":
        return ["Crédito de Consumo", "Crédito Hipotecario", "Leasing / Factoring", "Evaluación de Riesgo"];
      default:
        return ["General", "Administración", "RRHH", "Seguros", "Otros"];
    }
  };

  const categories = getCategoriesForFocus(commercialFocus, adminSettings);

  const handleAddCategory = async () => {
    if (!newCustomCategory.trim()) return;
    const focusKey = commercialFocus || "general";
    const currentList = [...categories];
    if (currentList.includes(newCustomCategory.trim())) {
      alert("Esta categoría ya existe.");
      return;
    }
    const updatedList = [...currentList, newCustomCategory.trim()];
    
    const updatedSettings = {
      ...adminSettings,
      customCategories: {
        ...(adminSettings.customCategories || {}),
        [focusKey]: updatedList
      }
    };

    try {
      setAdminLoading(true);
      const token = localStorage.getItem("token") || "";
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(updatedSettings)
      });
      if (res.ok) {
        setAdminSettings(updatedSettings);
        setNewCustomCategory("");
        setAdminStatusMsg({ type: "success", text: "Categoría agregada exitosamente." });
      } else {
        alert("Error al guardar la configuración de categorías.");
      }
    } catch (err) {
      console.error(err);
      alert("Error al guardar la configuración de categorías.");
    } finally {
      setAdminLoading(false);
    }
  };

  const handleDeleteCategory = async (catToDelete: string) => {
    if (!confirm(`¿Está seguro de que desea eliminar la categoría "${catToDelete}"?`)) {
      return;
    }
    const focusKey = commercialFocus || "general";
    const updatedList = categories.filter(c => c !== catToDelete);
    if (updatedList.length === 0) {
      alert("Debe haber al menos una categoría configurada.");
      return;
    }

    const updatedSettings = {
      ...adminSettings,
      customCategories: {
        ...(adminSettings.customCategories || {}),
        [focusKey]: updatedList
      }
    };

    try {
      setAdminLoading(true);
      const token = localStorage.getItem("token") || "";
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(updatedSettings)
      });
      if (res.ok) {
        setAdminSettings(updatedSettings);
        if (tplCategory === catToDelete) {
          setTplCategory(updatedList[0]);
        }
        if (operationType === catToDelete) {
          setOperationType(updatedList[0]);
        }
        setAdminStatusMsg({ type: "success", text: "Categoría eliminada exitosamente." });
      } else {
        alert("Error al guardar la configuración de categorías.");
      }
    } catch (err) {
      console.error(err);
      alert("Error al guardar la configuración de categorías.");
    } finally {
      setAdminLoading(false);
    }
  };

  const handleSaveEditedCategory = async (idx: number) => {
    if (!editingCategoryValue.trim()) return;
    const oldVal = categories[idx];
    const focusKey = commercialFocus || "general";
    const updatedList = [...categories];
    updatedList[idx] = editingCategoryValue.trim();

    const updatedSettings = {
      ...adminSettings,
      customCategories: {
        ...(adminSettings.customCategories || {}),
        [focusKey]: updatedList
      }
    };

    try {
      setAdminLoading(true);
      const token = localStorage.getItem("token") || "";
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(updatedSettings)
      });
      if (res.ok) {
        setAdminSettings(updatedSettings);
        if (tplCategory === oldVal) {
          setTplCategory(editingCategoryValue.trim());
        }
        if (operationType === oldVal) {
          setOperationType(editingCategoryValue.trim());
        }
        setEditingCategoryIdx(null);
        setEditingCategoryValue("");
        setAdminStatusMsg({ type: "success", text: "Categoría modificada exitosamente." });
      } else {
        alert("Error al guardar la configuración de categorías.");
      }
    } catch (err) {
      console.error(err);
      alert("Error al guardar la configuración de categorías.");
    } finally {
      setAdminLoading(false);
    }
  };

  // Synchronize categories and aiSector based on commercialFocus
  useEffect(() => {
    const cats = getCategoriesForFocus(commercialFocus, adminSettings);
    if (cats && cats.length > 0) {
      setTplCategory(cats[0]);
    }
    if (commercialFocus && commercialFocus !== "general") {
      if (cats && cats.length > 0) {
        setOperationType(cats[0]);
        const capitalizedFocus = commercialFocus.charAt(0).toUpperCase() + commercialFocus.slice(1);
        setAiSector(`${capitalizedFocus} - ${cats[0]}`);
      }
    } else {
      setAiSector("");
      setOperationType("");
    }
  }, [commercialFocus, adminSettings]);

  const handleOperationTypeChange = (op: string) => {
    setOperationType(op);
    const capitalizedFocus = commercialFocus.charAt(0).toUpperCase() + commercialFocus.slice(1);
    setAiSector(`${capitalizedFocus} - ${op}`);
  };

  const handleUploadPDFTemplate = async (file: File) => {
    if (!file) return;
    setPdfLoading(true);
    setPdfError("");

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        try {
          const response = await fetch("/api/templates/parse-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: file.name,
              fileContent: base64Data
            })
          });

          const data = await response.json();
          if (response.ok && data && !data.error) {
            // Hydrate creator form with AI PDF analysis results!
            setTplName(data.name || "");
            setTplCategory(data.category || tplCategory);
            setTplDescription(data.description || "");

            // Map stages cleanly
            const mappedStages = (data.stages || []).map((s: any) => ({
              name: s.name,
              description: s.description || "",
              requirements: (s.requirements || []).map((r: any) => ({
                type: r.type,
                name: r.name,
                description: r.description || "",
                required: r.required !== false,
                formFields: r.formFields || []
              }))
            }));
            setTplStages(mappedStages);
            setUsePDF(false); // Return to standard editor view to edit further
            setShowCreator(true);
          } else {
            setPdfError(data.error || data.message || "Error al procesar la plantilla PDF.");
          }
        } catch (err: any) {
          setPdfError("Error de conexión al procesar la plantilla PDF.");
        } finally {
          setPdfLoading(false);
        }
      };
      reader.onerror = () => {
        setPdfError("Error al leer el archivo PDF.");
        setPdfLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setPdfError("Error al iniciar la lectura del archivo.");
      setPdfLoading(false);
    }
  };

  const handleGenerateAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiSector) return;
    setAiLoading(true);
    setAiError("");

    try {
      const response = await fetch("/api/templates/generate-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sector: aiSector, requirementsDescription: aiDescription })
      });

      const data = await response.json();
      if (response.ok && data && !data.error) {
        // Hydrate creator form with AI results!
        setTplName(data.name || "");
        setTplCategory(data.category || tplCategory);
        setTplDescription(data.description || "");
        
        // Map stages cleanly
        const mappedStages = (data.stages || []).map((s: any) => ({
          name: s.name,
          description: s.description || "",
          requirements: (s.requirements || []).map((r: any) => ({
            type: r.type,
            name: r.name,
            description: r.description || "",
            required: r.required !== false,
            formFields: r.formFields || []
          }))
        }));
        setTplStages(mappedStages);
        setUseAI(false); // return to edit view
        setShowCreator(true);
      } else {
        setAiError(data.message || "Error al conectar con el servidor para la generación de la plantilla.");
      }
    } catch (err: any) {
      setAiError("Ocurrió un error inesperado al invocar la API.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleCreateTemplateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplName || tplStages.length === 0) return;

    onCreateTemplate({
      name: tplName,
      category: tplCategory,
      description: tplDescription,
      stages: tplStages
    });

    // Reset Form
    setTplName("");
    setTplDescription("");
    setTplStages([
      {
        name: "Etapa 1: Admisión",
        description: "Recepción de antecedentes iniciales.",
        requirements: [
          { type: "DOCUMENT", name: "DNI de Contacto", required: true }
        ]
      }
    ]);
    setShowCreator(false);
  };

  const addStageRow = () => {
    setTplStages([
      ...tplStages,
      {
        name: `Etapa ${tplStages.length + 1}: Nueva Etapa`,
        description: "",
        requirements: []
      }
    ]);
  };

  const removeStageRow = (sIdx: number) => {
    const updated = [...tplStages];
    updated.splice(sIdx, 1);
    setTplStages(updated);
  };

  const updateStageField = (sIdx: number, field: string, value: any) => {
    const updated = [...tplStages];
    updated[sIdx] = { ...updated[sIdx], [field]: value };
    setTplStages(updated);
  };

  const addRequirementToStage = (sIdx: number, type: "DOCUMENT" | "FORM" | "TASK") => {
    const updated = [...tplStages];
    const item: any = {
      type,
      name: `Requisito de tipo ${type}`,
      required: true
    };
    if (type === "FORM") {
      item.formFields = [
        { name: "campo_1", label: "Nombre del Campo", type: "text", required: true }
      ];
    }
    updated[sIdx].requirements.push(item);
    setTplStages(updated);
  };

  const removeReqFromStage = (sIdx: number, rIdx: number) => {
    const updated = [...tplStages];
    updated[sIdx].requirements.splice(rIdx, 1);
    setTplStages(updated);
  };

  const updateReqField = (sIdx: number, rIdx: number, field: string, value: any) => {
    const updated = [...tplStages];
    updated[sIdx].requirements[rIdx] = { ...updated[sIdx].requirements[rIdx], [field]: value };
    setTplStages(updated);
  };

  const addFormFieldToReq = (sIdx: number, rIdx: number) => {
    const updated = [...tplStages];
    const req = updated[sIdx].requirements[rIdx];
    if (!req.formFields) req.formFields = [];
    const count = req.formFields.length + 1;
    req.formFields.push({
      name: `campo_${count}`,
      label: `Nuevo Campo ${count}`,
      type: "text",
      required: true
    });
    setTplStages(updated);
  };

  const removeFormFieldFromReq = (sIdx: number, rIdx: number, fIdx: number) => {
    const updated = [...tplStages];
    const req = updated[sIdx].requirements[rIdx];
    if (req.formFields) {
      req.formFields.splice(fIdx, 1);
    }
    setTplStages(updated);
  };

  const updateFormFieldInReq = (sIdx: number, rIdx: number, fIdx: number, fieldKey: string, value: any) => {
    const updated = [...tplStages];
    const req = updated[sIdx].requirements[rIdx];
    if (req.formFields && req.formFields[fIdx]) {
      req.formFields[fIdx] = {
        ...req.formFields[fIdx],
        [fieldKey]: value
      };
      if (fieldKey === "label" && (!req.formFields[fIdx].name || req.formFields[fIdx].name.startsWith("campo_"))) {
        req.formFields[fIdx].name = value
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9_]/g, "_")
          .replace(/__+/g, "_");
      }
    }
    setTplStages(updated);
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* Sub Header tabs */}
      {(() => {
        const isAuditoriaSection = forcedTab === "stats" || forcedTab === "audit";
        const isConfiguracionSection = forcedTab === "admin_users" || forcedTab === "configuracion";
        const isTemplatesSection = forcedTab === "templates";
        const isTextosSection = forcedTab === "textos";

        return (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-4 gap-3">
            <div>
              <h2 className="text-lg font-display font-medium text-slate-900 flex items-center gap-2">
                {isAuditoriaSection ? "📊 Auditoría & Métricas" :
                 isConfiguracionSection ? (currentUser.role === "ADMIN" ? "🛡️ Configuración & Aprobaciones" : "🛡️ Gestión de Aprobaciones") :
                 isTextosSection ? "📝 Personalización de Textos" :
                 `⚙️ Diseñador de Plantillas`}
                <span className="text-[9px] bg-slate-50 border border-slate-200 text-slate-700 font-semibold font-mono px-2 py-0.5 rounded uppercase tracking-wider">
                  {currentUser.role === "ADMIN" ? "ADMIN" : "Gerencial"}
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {isAuditoriaSection 
                  ? "Supervise el rendimiento operativo, consulte estadísticas del negocio e inspeccione el registro de auditoría."
                  : isConfiguracionSection
                  ? (currentUser.role === "ADMIN"
                      ? "Administre las cuentas de asesores, configure canales de autenticación (Email/SMS) y solapas de la aplicación."
                      : "Administre las cuentas de los asesores, verifique sus estados y gestione las solicitudes de aprobación pendientes.")
                  : isTextosSection
                  ? "Personalice textos de inicio de sesión, explicaciones, botones y el glosario de términos."
                  : `Gestione y personalice las plantillas operativas de ${translations.casePlural.toLowerCase()} mediante automatización inteligente.`}
              </p>
            </div>

            {isAuditoriaSection && (
              <div className="flex flex-wrap items-center bg-slate-100/75 border border-slate-200/50 rounded-xl p-1 gap-1">
                <button
                  onClick={() => setActiveTab("stats")}
                  className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer duration-200 ${
                    activeTab === "stats"
                      ? "bg-slate-950 text-white shadow-xs"
                      : "text-slate-600 hover:bg-white hover:text-slate-950"
                  }`}
                >
                  <Zap className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                  Indicadores & Gestión
                </button>

                <button
                  onClick={() => setActiveTab("audit")}
                  className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer duration-200 ${
                    activeTab === "audit"
                      ? "bg-slate-950 text-white shadow-xs"
                      : "text-slate-600 hover:bg-white hover:text-slate-950"
                  }`}
                >
                  <History className="h-3.5 w-3.5" />
                  Historial de Auditoría
                </button>

                <div className="h-5 w-[1px] bg-slate-200 mx-1 hidden sm:block" />

                <button
                  onClick={onRefreshDashboard}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-900 transition-all text-xs font-bold cursor-pointer"
                  title="Refrescar Estadísticas"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refrescar
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {stats ? (
        ((activeTab === "admin_users" && (currentUser.role === "ADMIN" || currentUser.role === "MANAGER")) ||
         ((activeTab === "configuracion" || activeTab === "textos") && currentUser.role === "ADMIN")) ? (
          <div className="space-y-6 text-slate-800 animate-in fade-in duration-300">
            {/* Real-time alerts banner */}
            {adminStatusMsg && activeTab !== "textos" && (
              <div
                className={`p-4 rounded-xl border ${
                  adminStatusMsg.type === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-red-50 border-red-200 text-red-800"
                } flex items-center justify-between shadow-xs`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">
                    {adminStatusMsg.type === "success" ? "✓" : "⚠"}
                  </span>
                  <p className="text-xs font-semibold">{adminStatusMsg.text}</p>
                </div>
                <button
                  onClick={() => setAdminStatusMsg(null)}
                  className="text-xs opacity-60 hover:opacity-100 font-bold px-1.5 py-0.5 rounded"
                >
                  Cerrar
                </button>
              </div>
            )}

            {activeTab === "admin_users" ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column: Advisor Approval Registry & User Management */}
                <div className={`${(currentUser.role === "ADMIN" || currentUser.role === "MANAGER") ? "lg:col-span-7" : "lg:col-span-12"} bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6 text-left`}>
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="text-sm font-display font-semibold text-slate-900 flex items-center gap-1.5">
                    🪪 Gestión de Cuentas y Accesos
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Verifique el estado del código verificador, apruebe registros o modifique directamente los perfiles del personal.
                  </p>
                </div>

                <div className="space-y-4 max-h-[550px] overflow-y-auto pr-1 scrollbar-thin">
                  {editingUser ? (
                    <form onSubmit={handleSaveEditedUser} className="bg-slate-50/50 border border-slate-200/70 p-5 rounded-2xl space-y-4 text-left animate-in fade-in duration-250">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                        <span className="text-[10px] font-bold text-slate-500 uppercase font-mono tracking-wider">
                          Modificar Perfil: {editingUser.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditingUser(null)}
                          className="text-[10px] uppercase font-bold text-slate-500 hover:text-slate-900 cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {currentUser.role === "ADMIN" ? (
                          <>
                            <div className="sm:col-span-2">
                              <label className="block text-[9px] font-bold text-slate-400 uppercase font-mono mb-1">Nombre Completo</label>
                              <input
                                type="text"
                                required
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="bg-white text-slate-900 w-full border border-slate-200 rounded-xl p-2.5 text-xs focus:ring-4 focus:ring-slate-950/5 focus:border-slate-950 focus:outline-none font-medium transition-all"
                              />
                            </div>

                            <div className="sm:col-span-2">
                              <label className="block text-[9px] font-bold text-slate-400 uppercase font-mono mb-1">Dirección de Correo</label>
                              <input
                                type="email"
                                required
                                value={editEmail}
                                onChange={(e) => setEditEmail(e.target.value)}
                                className="bg-white text-slate-900 w-full border border-slate-200 rounded-xl p-2.5 text-xs focus:ring-4 focus:ring-slate-950/5 focus:border-slate-950 focus:outline-none font-mono transition-all"
                              />
                            </div>

                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 uppercase font-mono mb-1">Teléfono</label>
                              <input
                                type="text"
                                required
                                value={editPhone}
                                onChange={(e) => setEditPhone(e.target.value)}
                                className="bg-white text-slate-900 w-full border border-slate-200 rounded-xl p-2.5 text-xs focus:ring-4 focus:ring-slate-950/5 focus:border-slate-950 focus:outline-none font-medium transition-all"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 uppercase font-mono mb-1">Rol de Acceso Extendido</label>
                              <select
                                value={editRole}
                                onChange={(e) => setEditRole(e.target.value as any)}
                                className="w-full border border-slate-200 rounded-xl p-2.5 text-xs bg-white text-slate-900 font-semibold focus:ring-4 focus:ring-slate-950/5 focus:border-slate-950 focus:outline-none"
                              >
                                <option value="ASESOR">{translations.advisorSingular}</option>
                                <option value="MANAGER">{translations.managerSingular}</option>
                              </select>
                            </div>

                            <div className="sm:col-span-2">
                              <label className="block text-[9px] font-bold text-slate-400 uppercase font-mono mb-1">Dirección Física</label>
                              <input
                                type="text"
                                required
                                value={editAddress}
                                onChange={(e) => setEditAddress(e.target.value)}
                                className="bg-white text-slate-900 w-full border border-slate-200 rounded-xl p-2.5 text-xs focus:ring-4 focus:ring-slate-950/5 focus:border-slate-950 focus:outline-none font-medium transition-all"
                                placeholder="Dirección comercial / oficina"
                              />
                            </div>

                            <div className="sm:col-span-2">
                              <label className="block text-[9px] font-bold text-slate-400 uppercase font-mono mb-1">Estado de la Cuenta</label>
                              <select
                                value={editStatus}
                                onChange={(e) => setEditStatus(e.target.value)}
                                className="w-full border border-slate-200 rounded-xl p-2.5 text-xs bg-white text-slate-900 font-semibold focus:ring-4 focus:ring-slate-950/5 focus:border-slate-950 focus:outline-none"
                              >
                                <option value="PENDING">Pendiente de Token</option>
                                <option value="VERIFIED_PENDING_APPROVAL">Verificado (Pendiente Aprobación)</option>
                                <option value="APPROVED">Habilitado / Activo</option>
                                <option value="REJECTED">Bloqueado / Rechazado</option>
                              </select>
                            </div>
                          </>
                        ) : (
                          <div className="sm:col-span-2 bg-slate-100 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1 font-medium">
                            <p><strong>Asesor:</strong> {editingUser.name}</p>
                            <p><strong>Email:</strong> {editingUser.email}</p>
                            <p><strong>Estado:</strong> {editingUser.status === "APPROVED" ? "Activo" : "Pendiente"}</p>
                          </div>
                        )}

                        {editRole === "ASESOR" && (
                          <div className="sm:col-span-2 flex items-start gap-3 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 text-left">
                            <input
                              type="checkbox"
                              id="checkbox-can-create-cases"
                              checked={editCanCreateCases}
                              onChange={(e) => setEditCanCreateCases(e.target.checked)}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <div>
                              <label htmlFor="checkbox-can-create-cases" className="block text-xs font-bold text-indigo-950 cursor-pointer">
                                Habilitar Creación de Expedientes
                              </label>
                              <p className="text-[10px] text-indigo-700 mt-0.5 leading-normal">
                                Permite al asesor iniciar nuevos expedientes directamente sin solicitar aprobación previa del equipo gestor.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 justify-end pt-3 border-t border-slate-200/50 mt-4">
                        <button
                          type="button"
                          onClick={() => setEditingUser(null)}
                          className="px-3.5 py-2 border border-slate-200 text-slate-700 text-xs rounded-xl hover:bg-slate-100 font-semibold cursor-pointer transition-all"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 bg-slate-950 text-white text-xs rounded-xl hover:bg-slate-900 font-bold cursor-pointer shadow-xs transition-all"
                        >
                          Actualizar Datos
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      {(() => {
                        const displayUsers = adminUsers.filter(u => {
                          if (currentUser.role === "ADMIN") {
                            return u.id !== currentUser.id;
                          } else {
                            return u.role === "ASESOR";
                          }
                        });

                        if (displayUsers.length === 0) {
                          return (
                            <div className="text-center py-10 text-xs text-slate-400 font-medium font-mono border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                              No se encuentran registrados usuarios auditables en el sistema.
                            </div>
                          );
                        }

                        return displayUsers.map((u) => {
                          const isPendingCode = u.status === "PENDING";
                          const isPendingApproval = u.status === "VERIFIED_PENDING_APPROVAL";
                          const isApproved = u.status === "APPROVED";
                          const isRejected = u.status === "REJECTED";

                          return (
                            <div
                              key={u.id}
                              className="p-4 rounded-xl border border-slate-150 bg-white shadow-3xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-250 transition-all text-left"
                            >
                              <div className="flex items-start gap-3.5 min-w-0">
                                <img
                                  src={u.avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${u.name}`}
                                  alt={u.name}
                                  className="h-11 w-11 rounded-xl bg-slate-50 object-cover border border-slate-150 shadow-3xs"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="space-y-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h4 className="text-xs font-bold text-slate-900 truncate">{u.name}</h4>
                                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md font-mono border uppercase tracking-wider ${
                                      u.role === "MANAGER" ? "bg-indigo-50 text-indigo-700 border-indigo-200/60" : "bg-teal-50 text-teal-800 border-teal-200/60"
                                    }`}>
                                      {u.role === "MANAGER" ? translations.managerSingular.toUpperCase() : translations.advisorSingular.toUpperCase()}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-500 font-mono truncate">{u.email}</p>
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
                                    <span className="font-mono">📞 {u.phone || "Sin teléfono"}</span>
                                    {u.address && (
                                      <span className="text-indigo-650 truncate max-w-[150px]">📍 {u.address}</span>
                                    )}
                                  </div>
                                  {u.createdAt && (
                                    <p className="text-[9px] text-slate-400 font-mono">
                                      Alta: {new Date(u.createdAt).toLocaleDateString("es-ES")}
                                    </p>
                                  )}
                                  {u.role === "ASESOR" && (
                                    <div className="pt-0.5">
                                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md border uppercase tracking-wider ${
                                        u.canCreateCases 
                                          ? "bg-emerald-50 text-emerald-800 border-emerald-200/50" 
                                          : "bg-slate-50 text-slate-500 border-slate-200"
                                      }`}>
                                        {u.canCreateCases ? "🚀 Creación Directa" : "🔒 Solicitud Previa"}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 sm:self-center shrink-0">
                                {/* Status Badges */}
                                {isPendingCode && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-50 border border-amber-200 text-amber-800">
                                    ⏳ Token
                                  </span>
                                )}
                                {isPendingApproval && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-800 animate-pulse">
                                    ✓ Verificado
                                  </span>
                                )}
                                {isApproved && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-800">
                                    ● Activo
                                  </span>
                                )}
                                {isRejected && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-rose-50 border border-rose-250 text-rose-800">
                                    ✖ Bloqueado
                                  </span>
                                )}
                                {u.status === "SUSPENDED" && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-100 border border-amber-300 text-amber-800">
                                    ⏸ Suspendido
                                  </span>
                                )}
                                {u.status === "BANNED" && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-red-100 border border-red-200 text-red-800">
                                    🚫 Baneado
                                  </span>
                                )}

                                <div className="flex items-center gap-1">
                                  {currentUser.role === "ADMIN" ? (
                                    <>
                                      {/* Approve / Activate action for unapproved or suspended/banned/rejected states */}
                                      {(isPendingCode || isPendingApproval || isRejected || u.status === "SUSPENDED" || u.status === "BANNED") && (
                                        <button
                                          onClick={() => handleApproveAdvisor(u.id)}
                                          className="p-1 px-2.5 rounded-lg text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer"
                                          title="Habilitar y Activar cuenta"
                                        >
                                          Activar
                                        </button>
                                      )}
                                      
                                      {/* Reject action if not approved yet or active */}
                                      {(isPendingCode || isPendingApproval) && !isRejected && (
                                        <button
                                          onClick={() => handleRejectAdvisor(u.id)}
                                          className="p-1 px-2.5 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-rose-550 hover:bg-rose-50 text-rose-700 transition-colors cursor-pointer border border-slate-200"
                                          title="Rechazar solicitud"
                                        >
                                          Rechazar
                                        </button>
                                      )}

                                      {/* Suspend / Ban action if active (approved) */}
                                      {isApproved && (
                                        <>
                                          <button
                                            onClick={() => handleSuspendUser(u.id)}
                                            className="p-1 px-2.5 rounded-lg text-[10px] font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer"
                                            title="Suspender usuario temporalmente"
                                          >
                                            Suspender
                                          </button>
                                          <button
                                            onClick={() => handleBanUser(u.id)}
                                            className="p-1 px-2.5 rounded-lg text-[10px] font-bold bg-red-650 bg-red-600 hover:bg-red-700 text-white transition-colors cursor-pointer"
                                            title="Banear usuario permanentemente"
                                          >
                                            Banear
                                          </button>
                                        </>
                                      )}

                                      {/* Edit sensitive profiles */}
                                      <button
                                        type="button"
                                        onClick={() => startEditingUser(u)}
                                        className="p-1 px-2.5 rounded-lg text-[10px] font-bold bg-slate-950 hover:bg-slate-900 text-white transition-colors cursor-pointer"
                                        title="Editar datos sensibles del perfil"
                                      >
                                        Editar
                                      </button>

                                      {/* Toggle case creation permission for Advisors directly */}
                                      {u.role === "ASESOR" && (
                                        <button
                                          type="button"
                                          onClick={() => handleToggleCreatePermission(u)}
                                          className={`p-1 px-2.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                                            u.canCreateCases
                                              ? "bg-amber-50 text-amber-850 border-amber-300 hover:bg-amber-100"
                                              : "bg-emerald-50 text-emerald-850 border-emerald-300 hover:bg-emerald-100"
                                          }`}
                                          title={u.canCreateCases ? "Cambiar a Creación por Solicitud" : "Habilitar Creación Directa"}
                                        >
                                          {u.canCreateCases ? "🔒 Restringir" : "🚀 Habilitar"}
                                        </button>
                                      )}

                                      {/* Permanent Delete */}
                                      <button
                                        onClick={() => handleDeleteUser(u.id)}
                                        className="p-1 px-2.5 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-rose-600 text-slate-700 hover:text-white border border-slate-200 hover:border-rose-600 transition-colors cursor-pointer"
                                        title="Eliminar usuario definitivamente"
                                      >
                                        Eliminar
                                      </button>
                                    </>
                                  ) : (
                                    /* For MANAGER, show single direct permission toggle button */
                                    currentUser.role === "MANAGER" && u.role === "ASESOR" && (
                                      <button
                                        type="button"
                                        onClick={() => handleToggleCreatePermission(u)}
                                        className={`p-1 px-2.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                                          u.canCreateCases
                                            ? "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
                                            : "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                                        }`}
                                        title={u.canCreateCases ? "Cambiar a Creación por Solicitud" : "Habilitar Creación Directa"}
                                      >
                                        {u.canCreateCases ? "🔒 Restringir Creación" : "🚀 Habilitar Creación"}
                                      </button>
                                    )
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </>
                  )}
                </div>

                {/* Interactive Account & Contents Explorer */}
                <div className="border-t border-slate-100 pt-5 space-y-4">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-850 flex items-center gap-1.5 font-mono">
                      🔍 Explorador General de Cuentas y Contenidos
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5 font-sans">
                      Seleccione un manager o asesor para auditar detalladamente sus expedientes, de modo de ver lo que hay en sus cuentas en tiempo real.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3">
                    <div>
                      <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1 font-mono">
                        Seleccionar Cuenta
                      </label>
                      <select
                        value={selectedExploreUser?.id || ""}
                        onChange={(e) => {
                          const u = adminUsers.find((user) => user.id === e.target.value);
                          setSelectedExploreUser(u || null);
                        }}
                        className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white font-semibold focus:outline-none"
                      >
                        <option value="">-- Elija un Usuario --</option>
                        {adminUsers.map((user) => (
                          <option key={user.id} value={user.id}>
                            [{user.role === "ADMIN" ? "ADMIN" : user.role === "MANAGER" ? translations.managerSingular : translations.advisorSingular}] {user.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedExploreUser && (
                      <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={selectedExploreUser.avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${selectedExploreUser.name}`}
                            alt={selectedExploreUser.name}
                            className="h-9 w-9 rounded-md bg-white border border-slate-150 object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <h4 className="text-xs font-bold text-slate-900">{selectedExploreUser.name}</h4>
                            <span className="text-[9px] bg-slate-950 text-white font-bold px-1.5 py-0.5 rounded uppercase">
                              {selectedExploreUser.role === "ADMIN" ? "ADMIN" : selectedExploreUser.role === "MANAGER" ? translations.managerSingular : translations.advisorSingular}
                            </span>
                          </div>
                        </div>

                        {onSimulateUser && selectedExploreUser.id !== currentUser.id && (
                          <button
                            type="button"
                            onClick={() => onSimulateUser(selectedExploreUser)}
                            className="bg-slate-950 hover:bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1 shrink-0"
                          >
                            <span>🕶️ Simular esta Sesión</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {selectedExploreUser ? (
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-4 animate-in fade-in duration-200 text-left font-sans">
                      {/* Account Details Info */}
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-2 bg-white rounded-lg border border-slate-100">
                          <span className="text-[9px] text-slate-400 font-bold block uppercase font-mono">Correo de Ingreso</span>
                          <span className="font-mono text-slate-700 break-all select-all font-semibold block mt-0.5">{selectedExploreUser.email}</span>
                        </div>
                        <div className="p-2 bg-white rounded-lg border border-slate-100">
                          <span className="text-[9px] text-slate-400 font-bold block uppercase font-mono">Teléfono</span>
                          <span className="font-semibold text-slate-700 block mt-0.5">{selectedExploreUser.phone || "No registrado"}</span>
                        </div>
                        <div className="p-2 bg-white rounded-lg border border-slate-100">
                          <span className="text-[9px] text-slate-400 font-bold block uppercase font-mono">Alta Sistema</span>
                          <span className="font-semibold text-slate-700 block mt-0.5">
                            {selectedExploreUser.createdAt ? new Date(selectedExploreUser.createdAt).toLocaleDateString("es-ES") : "Automática"}
                          </span>
                        </div>
                        <div className="p-2 bg-white rounded-lg border border-slate-100">
                          <span className="text-[9px] text-slate-400 font-bold block uppercase font-mono">Estado Actual</span>
                          <span className={`inline-flex px-1.5 py-0.5 text-[9px] font-bold rounded uppercase mt-1 ${
                            selectedExploreUser.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                          }`}>
                            {selectedExploreUser.status}
                          </span>
                        </div>
                      </div>

                      {/* Cases associated with selection */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          📁 {translations.casePlural} Asociados a la Cuenta
                        </h4>

                        {(() => {
                          const targetCases = cases.filter(c =>
                            selectedExploreUser.role === "ASESOR"
                              ? c.advisorId === selectedExploreUser.id
                              : selectedExploreUser.role === "MANAGER"
                              ? (c.managerId === selectedExploreUser.id || (c.advisorId && c.advisorId !== "")) // lo propio + todos los asesores
                              : true // Admin sees everything
                          );

                          if (targetCases.length === 0) {
                            return (
                              <p className="text-[10px] text-slate-400 font-semibold py-4 text-center bg-white rounded-lg border border-slate-100 italic">
                                Sin {translations.casePlural.toLowerCase()} correspondientes en esta cuenta.
                              </p>
                            );
                          }

                          return (
                            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                              {targetCases.map(c => {
                                const tpl = templates.find(t => t.id === c.templateId);
                                const stages = (c.stages && c.stages.length > 0) ? c.stages : (tpl?.stages || []);
                                const totalStages = stages.length || 1;
                                const currentStageIndex = stages.findIndex(s => s.id === c.currentStageId);
                                const completedCount = currentStageIndex === -1 ? 0 : currentStageIndex;
                                const progressRate = Math.min(100, Math.round((completedCount / totalStages) * 100));
                                const currentStageName = stages.find(s => s.id === c.currentStageId)?.name || "N/D";

                                return (
                                  <div key={c.id} className="p-2.5 bg-white rounded-lg border border-slate-150 flex items-center justify-between gap-3 hover:border-slate-300 transition-colors">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                                          {c.code}
                                        </span>
                                        <h5 className="text-xs font-semibold text-slate-900 truncate font-sans">{c.title}</h5>
                                      </div>
                                      <p className="text-[10px] text-slate-500 mt-1">
                                        Fase: <span className="font-semibold text-slate-700">{currentStageName}</span>
                                      </p>
                                    </div>

                                    <div className="text-right flex flex-col items-end gap-1">
                                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                        c.status === "FINALIZADO" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" :
                                        c.status === "OBSERVADO" ? "bg-amber-50 border border-amber-250 text-amber-800" :
                                        "bg-indigo-50 border border-indigo-200 text-indigo-800"
                                      }`}>
                                        {c.status}
                                      </span>
                                      <div className="flex items-center gap-1">
                                        <div className="w-12 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                          <div className="bg-emerald-500 h-full" style={{ width: `${progressRate}%` }} />
                                        </div>
                                        <span className="text-[9px] font-mono text-slate-500">{progressRate}%</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Audit operations */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 font-sans">
                          <History className="h-3.5 w-3.5 text-slate-400" />
                          Acciones y Operaciones Auditadas
                        </h4>
                        {(() => {
                          const logs = (auditLogs || []).filter(log =>
                            log.userId === selectedExploreUser.id ||
                            log.userName?.toLowerCase() === selectedExploreUser.name?.toLowerCase()
                          );

                          if (logs.length === 0) {
                            return (
                              <p className="text-[10px] text-slate-400 font-semibold py-4 text-center bg-white rounded-lg border border-slate-100 italic">
                                Sin operaciones auditadas para este usuario.
                              </p>
                            );
                          }

                          return (
                            <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 font-mono text-[10px]">
                              {logs.map(log => (
                                <div key={log.id} className="p-2 bg-white rounded border border-slate-100 space-y-0.5 text-left">
                                  <div className="flex items-center justify-between text-slate-400">
                                    <span className="font-bold text-indigo-700 uppercase">{log.action}</span>
                                    <span>{new Date(log.createdAt).toLocaleString("es-ES")}</span>
                                  </div>
                                  <p className="text-slate-700 font-medium font-sans">{log.description}</p>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-medium">
                      No se ha seleccionado ninguna cuenta para expandir e inspeccionar. Seleccione una arriba.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Columns: Admin tools & Verification Setup */}
              {(currentUser.role === "ADMIN" || currentUser.role === "MANAGER") && (
                <div className="lg:col-span-5 space-y-6 text-left">
                {/* Section 1: Create Manager/Advisor Form */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
                  <div className="mb-4">
                    <h3 className="text-sm font-display font-semibold text-slate-900 flex items-center gap-1.5">
                      👤 Registrar Cuenta Oficial
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Las cuentas creadas por la administración ingresan directamente al sistema con aprobación inmediata.
                    </p>
                  </div>

                  {/* Role Switcher tabs layout inside the card */}
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-50 border border-slate-200 rounded-xl mb-4">
                    <button
                      type="button"
                      onClick={() => setNewUserRole("MANAGER")}
                      className={`py-2 text-center text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        newUserRole === "MANAGER"
                          ? "bg-slate-900 text-white shadow-xs"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {translations.managerSingular}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewUserRole("ASESOR")}
                      className={`py-2 text-center text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        newUserRole === "ASESOR"
                          ? "bg-slate-900 text-white shadow-xs"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {translations.advisorSingular}
                    </button>
                  </div>

                  <form onSubmit={handleCreateUserSubmit} className="space-y-4">
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Nombre Completo
                      </label>
                      <input
                        type="text"
                        required
                        value={newManagerName}
                        onChange={(e) => setNewManagerName(e.target.value)}
                        placeholder="ej. Alan Turing"
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-slate-950/5 focus:border-slate-950 focus:outline-none font-medium transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Email de la Cuenta
                      </label>
                      <input
                        type="email"
                        required
                        value={newManagerEmail}
                        onChange={(e) => setNewManagerEmail(e.target.value)}
                        placeholder="ej. alan@test.com"
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-slate-950/5 focus:border-slate-950 focus:outline-none font-mono transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Contraseña de Ingreso
                      </label>
                      <input
                        type="text"
                        required
                        value={newManagerPassword}
                        onChange={(e) => setNewManagerPassword(e.target.value)}
                        placeholder="Defina clave inicial segura"
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-slate-950/5 focus:border-slate-950 focus:outline-none font-mono transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Teléfono (Opcional)
                      </label>
                      <input
                        type="text"
                        value={newManagerPhone}
                        onChange={(e) => setNewManagerPhone(e.target.value)}
                        placeholder="ej. +34600112233"
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-slate-950/5 focus:border-slate-950 focus:outline-none font-medium transition-all"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={adminLoading}
                      className="w-full bg-slate-900 hover:bg-slate-950 disabled:bg-slate-300 text-white text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer mt-2 shadow-xs hover:shadow-sm"
                    >
                      {adminLoading ? "Conectando al Servidor..." : `Habilitar Cuenta de ${newUserRole === "ASESOR" ? translations.advisorSingular : translations.managerSingular}`}
                    </button>
                  </form>
                </div>

                {/* Section: Case Creation Requests */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
                  <div>
                    <h3 className="text-sm font-display font-semibold text-slate-900 flex items-center gap-1.5">
                      📂 Solicitudes de Apertura de Expedientes
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Asesores sin privilegios de creación directa envían solicitudes para abrir nuevos expedientes.
                    </p>
                  </div>

                  {/* Sub-tabs: PENDIENTES vs HISTORIAL */}
                  <div className="flex border-b border-slate-100 pb-1">
                    <button
                      type="button"
                      onClick={() => setCaseRequestsTab("PENDIENTES")}
                      className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                        caseRequestsTab === "PENDIENTES"
                          ? "border-slate-900 text-slate-900"
                          : "border-transparent text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      Pendientes ({caseRequests.filter(r => r.status === "PENDIENTE").length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCaseRequestsTab("HISTORIAL")}
                      className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                        caseRequestsTab === "HISTORIAL"
                          ? "border-slate-900 text-slate-900"
                          : "border-transparent text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      Historial ({caseRequests.filter(r => r.status !== "PENDIENTE").length})
                    </button>
                  </div>

                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 scrollbar-thin">
                    {caseRequestsTab === "PENDIENTES" ? (
                      caseRequests.filter(r => r.status === "PENDIENTE").length === 0 ? (
                        <p className="text-center py-8 text-xs text-slate-400 font-medium font-mono border border-dashed border-slate-150 rounded-xl bg-slate-50/55">
                          No hay solicitudes de apertura pendientes.
                        </p>
                      ) : (
                        caseRequests.filter(r => r.status === "PENDIENTE").map((req) => {
                          const requestAdvisor = adminUsers.find(u => u.id === req.advisorId);
                          const requestTemplate = templates.find(t => t.id === req.templateId);

                          const isConfirmingReject = rejectingCaseRequestId === req.id;

                          return (
                            <div key={req.id} className="p-3 bg-slate-50 rounded-xl border border-slate-150 space-y-2.5 text-xs text-left">
                              <div>
                                <div className="flex justify-between items-start gap-2">
                                  <span className="font-semibold text-slate-900 break-words block">{req.title}</span>
                                  <span className="text-[8px] bg-amber-50 text-amber-700 border border-amber-200 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider font-mono shrink-0">
                                    PENDIENTE
                                  </span>
                                </div>
                                {req.description && (
                                  <p className="text-slate-500 text-[11px] mt-1 italic break-words">"{req.description}"</p>
                                )}
                              </div>

                              <div className="pt-2 border-t border-slate-100 flex flex-col gap-1 text-[10px] text-slate-500">
                                <p className="font-mono text-left">
                                  👤 <strong className="text-slate-705 font-sans">Asesor:</strong> {requestAdvisor ? requestAdvisor.name : req.advisorId}
                                </p>
                                <p className="font-mono text-left">
                                  📋 <strong className="text-slate-705 font-sans">Flujo:</strong> {requestTemplate ? requestTemplate.name : "Por asignar"}
                                </p>
                                <p className="font-mono text-left">
                                  📅 <strong className="text-slate-705 font-sans">Fecha:</strong> {new Date(req.createdAt).toLocaleString("es-ES")}
                                </p>
                                {req.partyCounts && (
                                  <p className="font-mono text-left">
                                    👥 <strong className="text-slate-705 font-sans">Partes:</strong> Compradores: {req.partyCounts.compradores || 0} | Vendedores: {req.partyCounts.vendedores || 0} | Garantes: {req.partyCounts.garantes || 0}
                                  </p>
                                )}
                              </div>

                              <div className="flex gap-2 justify-end pt-1">
                                {isConfirmingReject ? (
                                  <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-100 rounded-lg p-1">
                                    <span className="text-[10px] font-bold text-rose-700 px-1 font-mono">¿Rechazar?</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleRejectCaseRequest(req.id);
                                        setRejectingCaseRequestId(null);
                                      }}
                                      className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded font-bold cursor-pointer text-[10px]"
                                    >
                                      Sí, rechazar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setRejectingCaseRequestId(null)}
                                      className="px-2 py-0.5 border border-slate-300 bg-white hover:bg-slate-100 text-slate-650 rounded font-semibold cursor-pointer text-[10px]"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setRejectingCaseRequestId(req.id)}
                                      className="px-2.5 py-1 border border-slate-200 text-slate-650 rounded hover:bg-slate-100 hover:text-slate-800 font-semibold cursor-pointer text-[10px]"
                                    >
                                      Rechazar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (onOpenCreateCaseModal) {
                                          onOpenCreateCaseModal({
                                            title: req.title,
                                            description: req.description || "",
                                            templateId: req.templateId,
                                            advisorId: req.advisorId,
                                            requestId: req.id,
                                            partyCounts: req.partyCounts
                                          });
                                        }
                                      }}
                                      className="px-3 py-1 bg-slate-950 text-white rounded hover:bg-slate-900 font-bold cursor-pointer text-[10px]"
                                    >
                                      Habilitar y Abrir
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )
                    ) : (
                      // HISTORIAL OF RESOLVED REQUESTS
                      caseRequests.filter(r => r.status !== "PENDIENTE").length === 0 ? (
                        <p className="text-center py-6 text-xs text-slate-400 font-medium font-mono">
                          No hay registros en el historial de solicitudes.
                        </p>
                      ) : (
                        caseRequests.filter(r => r.status !== "PENDIENTE").map((req) => {
                          const requestAdvisor = adminUsers.find(u => u.id === req.advisorId);
                          const requestTemplate = templates.find(t => t.id === req.templateId);

                          const isConfirmingDelete = deletingCaseRequestId === req.id;

                          return (
                            <div key={req.id} className="p-3 bg-slate-50/55 rounded-xl border border-slate-150 space-y-2 text-xs text-left">
                              <div className="flex justify-between items-start gap-2">
                                <div>
                                  <span className="font-semibold text-slate-800 break-words block">{req.title}</span>
                                  {req.description && (
                                    <p className="text-slate-500 text-[11px] mt-0.5 italic break-words">"{req.description}"</p>
                                  )}
                                </div>
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider font-mono shrink-0 ${
                                  req.status === "CREADO"
                                    ? "bg-teal-50 text-teal-700 border border-teal-200"
                                    : "bg-rose-50 text-rose-700 border border-rose-200"
                                }`}>
                                  {req.status === "CREADO" ? "Aprobado" : "Rechazado"}
                                </span>
                              </div>

                              <div className="pt-1.5 border-t border-slate-100 flex flex-col gap-0.5 text-[10px] text-slate-500">
                                <p className="font-mono text-left">
                                  👤 <strong className="text-slate-705 font-sans">Asesor:</strong> {requestAdvisor ? requestAdvisor.name : req.advisorId}
                                </p>
                                <p className="font-mono text-left">
                                  📋 <strong className="text-slate-705 font-sans">Flujo:</strong> {requestTemplate ? requestTemplate.name : "Por asignar"}
                                </p>
                                <p className="font-mono text-left">
                                  📅 <strong className="text-slate-705 font-sans">Fecha:</strong> {new Date(req.createdAt).toLocaleString("es-ES")}
                                </p>
                              </div>

                              {/* Only ADMIN (Director General) can delete records */}
                              {currentUser.role === "ADMIN" && (
                                <div className="flex justify-end pt-1">
                                  {isConfirmingDelete ? (
                                    <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-100 rounded-lg p-1 text-[10px]">
                                      <span className="font-bold text-rose-700 px-1 font-mono">¿Eliminar registro?</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleDeleteCaseRequest(req.id);
                                          setDeletingCaseRequestId(null);
                                        }}
                                        className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded cursor-pointer"
                                      >
                                        Eliminar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setDeletingCaseRequestId(null)}
                                        className="px-2 py-0.5 border border-slate-300 bg-white hover:bg-slate-100 text-slate-650 rounded font-semibold cursor-pointer"
                                      >
                                        No
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setDeletingCaseRequestId(req.id)}
                                      className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors flex items-center gap-1 text-[10px] font-semibold cursor-pointer"
                                      title="Eliminar registro definitivamente"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      Eliminar Registro
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === "textos" ? (
            <TextosCustomizerPanel
              adminSettings={adminSettings}
              setAdminSettings={setAdminSettings}
              adminLoading={adminLoading}
              onSaveSettings={handleSaveSettingsSubmit}
              adminStatusMsg={adminStatusMsg}
              setAdminStatusMsg={setAdminStatusMsg}
            />
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-300">
            {/* EXCLUSIVE SECTION: SECTOR DE NEGOCIO / GIRO COMERCIAL */}
            <div className="lg:col-span-12 bg-white rounded-xl border-2 border-indigo-600/20 p-6 shadow-xs space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-3 bg-indigo-50 text-indigo-600 rounded-bl-xl font-mono text-[9px] font-bold uppercase tracking-wider">
                Configuración Principal de Rubro
              </div>
              <div className="max-w-2xl">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  🏢 Configuración Exclusiva del Giro / Tipo de Negocio
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Defina el rubro comercial de la empresa. Al establecer esta configuración, <strong>todo el perfil</strong> de los asesores, managers y clientes se adaptará automáticamente a este rubro, personalizando los términos, nombres de legajos, roles y pantallas del sistema.
                </p>
              </div>

              <form onSubmit={handleSaveSettingsSubmit} className="max-w-2xl space-y-3 pt-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Giro Comercial / Destino de la Plataforma
                  </label>
                  <select
                    id="commercial-dest-select"
                    value={adminSettings.commercialFocus || "general"}
                    onChange={(e) =>
                      setAdminSettings({ ...adminSettings, commercialFocus: e.target.value })
                    }
                    className="w-full text-xs p-3 rounded-lg border border-slate-300 bg-slate-50 font-semibold focus:outline-none focus:border-indigo-500 focus:bg-white text-slate-900 cursor-pointer transition-all shadow-3xs"
                  >
                    <option value="general">💼 Corporate General (Expedientes / Asesores / Managers)</option>
                    <option value="juridico">⚖ Estudio Jurídico (Casos/Legajos / Abogados / Socios)</option>
                    <option value="inmobiliaria">🏠 Inmobiliaria / Corretaje (Propiedades / Operaciones / Agentes)</option>
                    <option value="escribania">✍ Escribanía / Notaría pública (Protocolos / Escrituras / Escribanos)</option>
                    <option value="financiero">📊 Financiero / Riesgo de Crédito (Legajos de Crédito / Analistas)</option>
                  </select>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-400 font-medium font-mono">
                    * Todos los cambios de nomenclatura se propagan instantáneamente a los perfiles de Asesores y Managers.
                  </span>
                  <button
                    type="submit"
                    disabled={adminLoading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm hover:shadow-md"
                  >
                    {adminLoading ? "Aplicando..." : "Guardar Tipo de Negocio"}
                  </button>
                </div>
              </form>
            </div>

            {/* Left Column: Real Channels Config */}
            <div className="lg:col-span-6 space-y-6">
              {/* Section 2: Real Channels Config (Resend & Twilio) */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                        ⚙ Canal de Envío de Fichas
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Canal oficial de dispersión física para el token rústico de 16 caracteres.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSaveSettingsSubmit} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                        Canal de Distribución de Registro
                      </label>
                      <select
                        value={adminSettings.verificationChannel || "EMAIL"}
                        onChange={(e) =>
                          setAdminSettings({ ...adminSettings, verificationChannel: e.target.value })
                        }
                        className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-slate-950 font-semibold"
                      >
                        <option value="EMAIL">Email Único (Resend API)</option>
                        <option value="SMS">SMS Único (Twilio SMS)</option>
                        <option value="BOTH">Doble Despacho (Email + SMS)</option>
                      </select>
                    </div>

                    {/* Permiso de productividad para asesores */}
                    <div className="pt-1 pb-1">
                      <label className="flex items-start gap-2.5 cursor-pointer bg-slate-50 hover:bg-slate-100/70 border border-slate-150 rounded-xl p-3 transition-colors">
                        <input
                          type="checkbox"
                          checked={!!adminSettings.allowAdvisorViewProductivity}
                          onChange={(e) =>
                            setAdminSettings({ ...adminSettings, allowAdvisorViewProductivity: e.target.checked })
                          }
                          className="h-4 w-4 mt-0.5 rounded border-slate-300 text-slate-950 focus:ring-slate-950 cursor-pointer"
                        />
                        <div className="text-left">
                          <p className="text-xs font-bold text-slate-800 leading-tight">Habilitar Vista de Productividad</p>
                          <p className="text-[9px] text-slate-500 mt-0.5 leading-normal">Habilita a los asesores a visualizar la productividad y carga de trabajo de sus colegas en su panel.</p>
                        </div>
                      </label>
                    </div>

                    {/* Resend configurations */}
                    {(adminSettings.verificationChannel === "EMAIL" ||
                      adminSettings.verificationChannel === "BOTH") && (
                      <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/70 space-y-3">
                        <span className="text-[10px] uppercase font-bold text-slate-500">Configuración RESEND API</span>
                        <div>
                          <label className="block text-[9 px] text-slate-500 mb-0.5">Resend API Key</label>
                          <input
                            type="password"
                            value={adminSettings.resendApiKey || ""}
                            onChange={(e) =>
                              setAdminSettings({ ...adminSettings, resendApiKey: e.target.value })
                            }
                            placeholder="re_xxxxxxxxxxxxxxxxxxxxxx"
                            className="w-full text-[11px] p-2 rounded border border-slate-200 focus:outline-none font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] text-slate-500 mb-0.5">Correo Remitente (From)</label>
                          <input
                            type="text"
                            value={adminSettings.resendFromEmail || "onboarding@resend.dev"}
                            onChange={(e) =>
                              setAdminSettings({ ...adminSettings, resendFromEmail: e.target.value })
                            }
                            className="w-full text-[11px] p-2 rounded border border-slate-200 focus:outline-none font-mono"
                          />
                        </div>
                      </div>
                    )}

                    {/* Twilio configurations */}
                    {(adminSettings.verificationChannel === "SMS" ||
                      adminSettings.verificationChannel === "BOTH") && (
                      <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/70 space-y-3">
                        <span className="text-[10px] uppercase font-bold text-slate-500">Configuración TWILIO</span>
                        <div>
                          <label className="block text-[9px] text-slate-500 mb-0.5">Account SID</label>
                          <input
                            type="text"
                            value={adminSettings.twilioSid || ""}
                            onChange={(e) =>
                              setAdminSettings({ ...adminSettings, twilioSid: e.target.value })
                            }
                            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxx"
                            className="w-full text-[11px] p-2 rounded border border-slate-200 focus:outline-none font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] text-slate-500 mb-0.5">Auth Token</label>
                          <input
                            type="password"
                            value={adminSettings.twilioAuthToken || ""}
                            onChange={(e) =>
                              setAdminSettings({ ...adminSettings, twilioAuthToken: e.target.value })
                            }
                            placeholder="Token Secreto"
                            className="w-full text-[11px] p-2 rounded border border-slate-200 focus:outline-none font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] text-slate-500 mb-0.5">Número Remitente Twilio</label>
                          <input
                            type="text"
                            value={adminSettings.twilioFromNumber || ""}
                            onChange={(e) =>
                              setAdminSettings({ ...adminSettings, twilioFromNumber: e.target.value })
                            }
                            placeholder="ej. +12345678"
                            className="w-full text-[11px] p-2 rounded border border-slate-200 focus:outline-none font-mono"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                        Plantilla de Mensaje
                      </label>
                      <textarea
                        rows={2}
                        value={adminSettings.messageTemplate || ""}
                        onChange={(e) =>
                          setAdminSettings({ ...adminSettings, messageTemplate: e.target.value })
                        }
                        placeholder="ej. Hola {{name}}, ingresa este token: {{token}}"
                        className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none"
                      />
                      <span className="text-[9px] text-slate-400 mt-0.5 leading-tight block">
                        Las macros de sustitución <b>{"{{name}}"}</b> y <b>{"{{token}}"}</b> serán reemplazadas automáticamente durante el envío de SMS/Email.
                      </span>
                    </div>

                    <button
                      type="submit"
                      disabled={adminLoading}
                      className="w-full bg-slate-900 hover:bg-slate-950 text-white text-xs font-semibold py-2 rounded-lg transition-all cursor-pointer"
                    >
                      {adminLoading ? "Salvando..." : "Guardar Preferencias de Notificación"}
                    </button>
                  </form>
                </div>
              </div>

              {/* Right Column: Custom Tabs Administrator */}
              <div className="lg:col-span-6 space-y-6">
                {/* Section 3: Custom Tabs Administrator */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      📁 Administrador de Solapas
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Cree solapas personalizadas que aparecerán de manera inmediata en el menú de navegación de todo el personal.
                    </p>
                  </div>

                  {/* Add Custom Tab Form */}
                  <form onSubmit={handleCreateCustomTabSubmit} className="space-y-4 border-b border-slate-100 pb-4 mb-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-800 mb-1">
                        Nombre de la Solapa
                      </label>
                      <input
                        type="text"
                        required
                        value={newTabName}
                        onChange={(e) => setNewTabName(e.target.value)}
                        placeholder="Ej. Legajos de RRHH, Guías Legales"
                        className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-slate-950 focus:bg-white font-medium"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-800 mb-1">
                          Icono Identificativo
                        </label>
                        <select
                          value={newTabIcon}
                          onChange={(e) => setNewTabIcon(e.target.value)}
                          className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 font-medium focus:outline-none"
                        >
                          <option value="Layout">🎴 Cuadrícula (Layout)</option>
                          <option value="Layers">🥞 Capas (Layers)</option>
                          <option value="FileText">📄 Archivo (FileText)</option>
                          <option value="ClipboardList">📋 Lista (ClipboardList)</option>
                          <option value="ShieldCheck">🛡 Seguridad (ShieldCheck)</option>
                        </select>
                      </div>

                      <div className="flex items-end">
                        <button
                          type="submit"
                          disabled={adminLoading || !newTabName.trim()}
                          className="w-full bg-slate-950 hover:bg-slate-900 disabled:bg-slate-300 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-all cursor-pointer h-9 flex items-center justify-center gap-1"
                        >
                          <Plus className="h-4 w-4" /> Crear Solapa
                        </button>
                      </div>
                    </div>
                  </form>

                  {/* Custom Tabs List */}
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Solapas Activas ({customTabs.length})
                    </h4>
                    {customTabs.length === 0 ? (
                      <p className="text-xs text-slate-400 italic text-center py-2 bg-slate-50 rounded-lg border border-slate-100">
                        No hay solapas personalizadas creadas.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {customTabs.map((tab) => (
                          <div key={tab.id} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-150 bg-slate-50 hover:bg-slate-100/50 transition-all text-xs">
                            <div className="flex items-center gap-2">
                              <span className="p-1.5 rounded-md bg-white border border-slate-200 text-slate-700">
                                {tab.icon === "Layers" ? <Layers className="h-3.5 w-3.5" /> :
                                 tab.icon === "ClipboardList" ? <ClipboardList className="h-3.5 w-3.5" /> :
                                 tab.icon === "ShieldCheck" ? <ShieldCheck className="h-3.5 w-3.5" /> :
                                 tab.icon === "FileText" ? <FileText className="h-3.5 w-3.5" /> :
                                 <Layers className="h-3.5 w-3.5" /> /* Fallback */}
                              </span>
                              <div>
                                <p className="font-semibold text-slate-900">{tab.name}</p>
                                <p className="text-[9px] text-slate-400 font-mono">{(tab.items || []).length} secciones</p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDeleteCustomTab(tab.id, tab.name)}
                              className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 rounded-md cursor-pointer transition-all"
                              title="Eliminar Solapa"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>
        ) : activeTab === "stats" ? (
          <div className="space-y-6">
            
            {/* Bento Grid Indicators */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="bg-white border border-slate-150 p-6 rounded-2xl shadow-xs relative overflow-hidden group hover:border-slate-300 transition-all duration-300">
                <span className="absolute -right-3 -bottom-3 text-slate-100/50 group-hover:scale-110 transition-transform duration-300"><Layers className="h-16 w-16" /></span>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Expedientes Totales</p>
                <div className="flex items-baseline gap-1 mt-3">
                  <span className="text-3xl font-bold tracking-tight text-slate-900 font-display">{stats.total}</span>
                  <span className="text-[11px] text-slate-400 font-bold font-mono uppercase tracking-wider">unidades</span>
                </div>
              </div>

              <div className="bg-white border border-slate-150 p-6 rounded-2xl shadow-xs relative overflow-hidden group hover:border-slate-300 transition-all duration-300">
                <span className="absolute -right-3 -bottom-3 text-slate-100/50 group-hover:scale-110 transition-transform duration-300"><Zap className="h-16 w-16" /></span>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Activos</p>
                <div className="flex items-baseline gap-1 mt-3">
                  <span className="text-3xl font-bold tracking-tight text-slate-900 font-display">{stats.active}</span>
                  <span className="text-[11px] text-slate-400 font-bold font-mono uppercase tracking-wider">procesos</span>
                </div>
              </div>

              <div className="bg-white border border-slate-150 p-6 rounded-2xl shadow-xs relative overflow-hidden group hover:border-slate-300 transition-all duration-300">
                <span className="absolute -right-3 -bottom-3 text-amber-50/50 group-hover:scale-110 transition-transform duration-300"><Clock className="h-16 w-16 text-amber-100" /></span>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Observados / Bloqueados</p>
                <div className="flex items-baseline gap-1 mt-3">
                  <span className="text-3xl font-bold tracking-tight text-amber-600 font-display">{stats.observed}</span>
                  <span className="text-[11px] text-amber-400 font-bold font-mono uppercase tracking-wider">Legajos</span>
                </div>
              </div>

              <div className="bg-white border border-slate-150 p-6 rounded-2xl shadow-xs relative overflow-hidden group hover:border-slate-300 transition-all duration-300">
                <span className="absolute -right-3 -bottom-3 text-emerald-50/50 group-hover:scale-110 transition-transform duration-300"><ShieldCheck className="h-16 w-16 text-emerald-100" /></span>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Finalizados</p>
                <div className="flex items-baseline gap-1 mt-3">
                  <span className="text-3xl font-bold tracking-tight text-emerald-600 font-display">{stats.finished}</span>
                  <span className="text-[11px] text-emerald-400 font-bold font-mono uppercase tracking-wider">cerrados</span>
                </div>
              </div>
            </div>

            {/* Middle: Advisor Assignments & Stages distribution */}
            <div className="w-full">
              
              {/* Combined Productivity & Recent Observations Panel */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6">
                <h3 className="font-display font-bold text-slate-900 text-sm mb-5 flex items-center gap-2 pb-3 border-b border-slate-100">
                  <User className="h-4.5 w-4.5 text-slate-500" />
                  Productividad y Carga de Trabajo de Asesores
                </h3>

                {/* Tabs / Solapas Navigation */}
                <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 border border-slate-200/60 p-1.5 rounded-xl mb-6 text-xs max-w-fit">
                  <button
                    onClick={() => setProdCardTab("asesor")}
                    className={`px-3.5 py-2 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      prodCardTab === "asesor" 
                        ? "bg-white text-slate-900 shadow-3xs border border-slate-200/50" 
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    👤 Asesor
                  </button>
                  <button
                    onClick={() => setProdCardTab("asignados")}
                    className={`px-3.5 py-2 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      prodCardTab === "asignados" 
                        ? "bg-white text-slate-900 shadow-3xs border border-slate-200/50" 
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    📁 Legajos Asignados
                  </button>
                  <button
                    onClick={() => setProdCardTab("activos")}
                    className={`px-3.5 py-2 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      prodCardTab === "activos" 
                        ? "bg-white text-indigo-600 shadow-3xs border border-slate-200/50" 
                        : "text-slate-500 hover:text-indigo-600"
                    }`}
                  >
                    ⚡ Activos
                  </button>
                  <button
                    onClick={() => setProdCardTab("completados")}
                    className={`px-3.5 py-2 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      prodCardTab === "completados" 
                        ? "bg-white text-emerald-600 shadow-3xs border border-slate-200/50" 
                        : "text-slate-500 hover:text-emerald-700"
                    }`}
                  >
                    ✅ Completados
                  </button>
                  <button
                    onClick={() => setProdCardTab("eficiencia")}
                    className={`px-3.5 py-2 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      prodCardTab === "eficiencia" 
                        ? "bg-white text-violet-600 shadow-3xs border border-slate-200/50" 
                        : "text-slate-500 hover:text-violet-700"
                    }`}
                  >
                    📈 Porcentaje Eficiencia
                  </button>
                  <button
                    onClick={() => setProdCardTab("observados")}
                    className={`px-3.5 py-2 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      prodCardTab === "observados" 
                        ? "bg-white text-amber-600 shadow-3xs border border-amber-250/60" 
                        : "text-slate-500 hover:text-amber-700"
                    }`}
                  >
                    ⚠️ Legajos Observados Recientes
                  </button>
                </div>

                {prodCardTab === "asesor" && (
                  <div className="space-y-6">
                    <div className="overflow-x-auto border border-slate-150 rounded-xl">
                      <table className="w-full text-sm text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-150 text-[10px] text-slate-400 font-bold uppercase font-mono bg-slate-50/75">
                            <th className="py-3 px-4">Asesor</th>
                            <th className="py-3 px-4 text-center">Legajos Asignados</th>
                            <th className="py-3 px-4 text-center">Activos</th>
                            <th className="py-3 px-4 text-center">Completados</th>
                            <th className="py-3 px-4">Porcentaje Eficiencia</th>
                            <th className="py-3 px-4 text-center">Observados</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {stats.casesByAdvisor && stats.casesByAdvisor.map((adv: any) => {
                            const rate = adv.totalCount > 0 ? Math.round((adv.completedCount / adv.totalCount) * 100) : 0;
                            const observedCount = adv.observedCount !== undefined ? adv.observedCount : (cases?.filter((c: any) => c.advisorId === adv.id && c.status === "OBSERVADO").length || 0);
                            const isSelected = selectedProdAdvisorId === adv.id;
                            return (
                              <tr key={adv.id} className={`transition-all duration-200 ${isSelected ? "bg-indigo-50/40 border-l-4 border-indigo-600 font-medium" : "hover:bg-slate-50/50"}`}>
                                <td 
                                  className="py-3.5 px-4 flex items-center gap-3 cursor-pointer group"
                                  onClick={() => {
                                    setSelectedProdAdvisorId(adv.id);
                                    setProdLegajoFilter("ALL");
                                  }}
                                  title="Ver perfil detallado del asesor"
                                >
                                  <img
                                    src={adv.avatarUrl || `https://ui-avatars.com/api/?name=${adv.name}`}
                                    alt={adv.name}
                                    className="h-8 w-8 rounded-xl object-cover group-hover:scale-105 transition-transform bg-slate-100 border border-slate-150"
                                    referrerPolicy="no-referrer"
                                  />
                                  <div>
                                    <p className="font-semibold text-slate-800 text-xs group-hover:text-indigo-600 transition-colors">
                                      {adv.name}
                                    </p>
                                    <p className="text-[10px] text-slate-400 font-medium">Asesor de Procesos</p>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  {adv.totalCount > 0 ? (
                                    <button
                                      onClick={() => {
                                        setSelectedProdAdvisorId(adv.id);
                                        setProdLegajoFilter("ALL");
                                      }}
                                      className="font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg px-2.5 py-1 text-xs transition-all cursor-pointer font-mono"
                                      title={`Ver los ${adv.totalCount} legajos asignados`}
                                    >
                                      {adv.totalCount}
                                    </button>
                                  ) : (
                                    <span className="text-slate-400 font-semibold text-xs font-mono">{adv.totalCount}</span>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  {adv.activeCount > 0 ? (
                                    <button
                                      onClick={() => {
                                        setSelectedProdAdvisorId(adv.id);
                                        setProdLegajoFilter("ACTIVE");
                                      }}
                                      className="font-bold text-indigo-655 hover:text-indigo-855 hover:bg-indigo-50 rounded-lg px-2.5 py-1 text-xs transition-all cursor-pointer font-mono"
                                      title={`Ver los ${adv.activeCount} legajos activos`}
                                    >
                                      {adv.activeCount}
                                    </button>
                                  ) : (
                                    <span className="text-slate-400 font-semibold text-xs font-mono">{adv.activeCount}</span>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  {adv.completedCount > 0 ? (
                                    <button
                                      onClick={() => {
                                        setSelectedProdAdvisorId(adv.id);
                                        setProdLegajoFilter("COMPLETED");
                                      }}
                                      className="font-bold text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg px-2.5 py-1 text-xs transition-all cursor-pointer font-mono"
                                      title={`Ver los ${adv.completedCount} legajos completados`}
                                    >
                                      {adv.completedCount}
                                    </button>
                                  ) : (
                                    <span className="text-slate-400 font-semibold text-xs font-mono">{adv.completedCount}</span>
                                  )}
                                </td>
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden">
                                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${rate}%` }} />
                                    </div>
                                    <span className="text-xs font-bold text-slate-700 font-mono">{rate}%</span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  {observedCount > 0 ? (
                                    <button
                                      onClick={() => {
                                        setSelectedProdAdvisorId(adv.id);
                                        setProdLegajoFilter("OBSERVADO");
                                      }}
                                      className="font-bold text-amber-600 hover:text-amber-800 hover:bg-amber-55/60 rounded-lg px-2.5 py-1 text-xs transition-all cursor-pointer font-mono"
                                      title={`Ver los ${observedCount} legajos observados`}
                                    >
                                      {observedCount}
                                    </button>
                                  ) : (
                                    <span className="text-slate-400 font-semibold text-xs font-mono">{observedCount}</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Detailed Interactive Advisor Profile Section */}
                    {selectedProdAdvisorId && (() => {
                      const selectedAdv = stats.casesByAdvisor?.find((a: any) => a.id === selectedProdAdvisorId);
                      const fullUser = adminUsers.find((u: any) => u.id === selectedProdAdvisorId) || selectedAdv;
                      
                      if (!selectedAdv) return null;

                      // Find cases for this advisor
                      const advisorCases = cases.filter((c: any) => c.advisorId === selectedProdAdvisorId);
                      const activeCases = advisorCases.filter((c: any) => c.status !== "FINALIZADO");
                      const completedCases = advisorCases.filter((c: any) => c.status === "FINALIZADO");
                      const observedCases = advisorCases.filter((c: any) => c.status === "OBSERVADO");

                      const displayedCases = prodLegajoFilter === "ALL" 
                        ? advisorCases 
                        : prodLegajoFilter === "ACTIVE" 
                        ? activeCases 
                        : prodLegajoFilter === "COMPLETED"
                        ? completedCases
                        : observedCases;

                      return (
                        <div className="mt-6 pt-6 border-t border-slate-200/80 space-y-5 animate-in fade-in duration-250 text-left">
                          <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-100">
                            <div className="flex items-center gap-3">
                              <div className="p-1 bg-white rounded-xl shadow-xs border border-slate-150">
                                <img
                                  src={fullUser?.avatarUrl || `https://ui-avatars.com/api/?name=${fullUser?.name}`}
                                  alt={fullUser?.name}
                                  className="h-11 w-11 rounded-lg object-cover bg-white"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-sm font-bold text-slate-900">{fullUser?.name}</h4>
                                  <span className="text-[9px] bg-slate-950 text-white font-mono font-bold px-1.5 py-0.5 rounded uppercase">
                                    {translations.advisorSingular}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-500 mt-0.5">Auditoría de Perfil y Productividad</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {onSimulateUser && fullUser?.id !== currentUser.id && (
                                <button
                                  type="button"
                                  onClick={() => onSimulateUser(fullUser)}
                                  className="bg-slate-950 hover:bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
                                >
                                  <span>🕶️ Simular esta Sesión</span>
                                </button>
                              )}
                              <button
                                onClick={() => setSelectedProdAdvisorId(null)}
                                className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200 transition-colors flex items-center justify-center h-7 w-7 text-sm font-bold font-mono"
                                title="Cerrar detalles"
                              >
                                ×
                              </button>
                            </div>
                          </div>

                          {/* Contact & Status details */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                              <span className="text-[9px] text-slate-400 font-bold block uppercase font-mono">Correo de Ingreso</span>
                              <span className="font-mono text-slate-700 break-all select-all font-semibold block mt-0.5">{fullUser?.email || "No disponible"}</span>
                            </div>
                            <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                              <span className="text-[9px] text-slate-400 font-bold block uppercase font-mono">Teléfono</span>
                              <span className="font-semibold text-slate-700 block mt-0.5">{fullUser?.phone || "No registrado"}</span>
                            </div>
                            <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                              <span className="text-[9px] text-slate-400 font-bold block uppercase font-mono">Alta Sistema</span>
                              <span className="font-semibold text-slate-700 block mt-0.5">
                                {fullUser?.createdAt ? new Date(fullUser.createdAt).toLocaleDateString("es-ES") : "Automática"}
                              </span>
                            </div>
                            <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                              <span className="text-[9px] text-slate-400 font-bold block uppercase font-mono">Estado Actual</span>
                              <span className={`inline-flex px-1.5 py-0.5 text-[9px] font-bold rounded-md uppercase mt-1 ${
                                fullUser?.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                              }`}>
                                {fullUser?.status || "ACTIVO"}
                              </span>
                            </div>
                          </div>

                          {/* Legajos Navigation and Filters */}
                          <div className="space-y-3.5 pt-1">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-2">
                              <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                📁 {translations.casePlural} Asociados al Asesor
                              </h5>
                              
                              <div className="flex items-center gap-1.5 bg-slate-100 p-0.5 rounded-lg text-[10px]">
                                <button
                                  onClick={() => setProdLegajoFilter("ALL")}
                                  className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                                    prodLegajoFilter === "ALL"
                                      ? "bg-white text-slate-900 shadow-xs"
                                      : "text-slate-500 hover:text-slate-900"
                                  }`}
                                >
                                  Todos ({advisorCases.length})
                                </button>
                                <button
                                  onClick={() => setProdLegajoFilter("ACTIVE")}
                                  className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                                    prodLegajoFilter === "ACTIVE"
                                      ? "bg-white text-indigo-600 shadow-xs"
                                      : "text-slate-500 hover:text-indigo-600"
                                  }`}
                                >
                                  Activos ({activeCases.length})
                                </button>
                                <button
                                  onClick={() => setProdLegajoFilter("COMPLETED")}
                                  className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                                    prodLegajoFilter === "COMPLETED"
                                      ? "bg-white text-emerald-600 shadow-xs"
                                      : "text-slate-500 hover:text-emerald-700"
                                  }`}
                                >
                                  Completados ({completedCases.length})
                                </button>
                                <button
                                  onClick={() => setProdLegajoFilter("OBSERVADO")}
                                  className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                                    prodLegajoFilter === "OBSERVADO"
                                      ? "bg-white text-amber-600 shadow-xs"
                                      : "text-slate-500 hover:text-amber-700"
                                  }`}
                                >
                                  Observados ({observedCases.length})
                                </button>
                              </div>
                            </div>

                            {/* Cases list */}
                            {displayedCases.length === 0 ? (
                              <p className="text-[10px] text-slate-400 font-semibold py-6 text-center bg-slate-50 rounded-xl border border-slate-150 italic">
                                Sin {translations.casePlural.toLowerCase()} correspondientes en esta categoría.
                              </p>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[240px] overflow-y-auto pr-1">
                                {displayedCases.map((c: any) => {
                                  const tpl = templates?.find((t: any) => t.id === c.templateId);
                                  const stages = (c.stages && c.stages.length > 0) ? c.stages : (tpl?.stages || []);
                                  const totalStages = stages.length || 1;
                                  const currentStageIndex = stages.findIndex((s: any) => s.id === c.currentStageId);
                                  const completedCount = currentStageIndex === -1 ? 0 : currentStageIndex;
                                  const progressRate = Math.min(100, Math.round((completedCount / totalStages) * 100));
                                  const currentStageName = stages.find((s: any) => s.id === c.currentStageId)?.name || "N/D";

                                  return (
                                    <div 
                                      key={c.id} 
                                      className="p-2.5 bg-white rounded-lg border border-slate-150 flex items-center justify-between gap-3 hover:border-slate-300 transition-all text-left"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[9px] font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                                            {c.code}
                                          </span>
                                          <h5 className="text-xs font-semibold text-slate-900 truncate font-sans">{c.title}</h5>
                                        </div>
                                        <p className="text-[10px] text-slate-500 mt-1">
                                          Fase: <span className="font-semibold text-slate-700">{currentStageName}</span>
                                        </p>
                                      </div>

                                      <div className="text-right flex flex-col items-end gap-1 shrink-0">
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                          c.status === "FINALIZADO" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" :
                                          c.status === "OBSERVADO" ? "bg-amber-50 border border-amber-250 text-amber-800" :
                                          "bg-indigo-50 border border-indigo-200 text-indigo-800"
                                        }`}>
                                          {c.status}
                                        </span>
                                        <div className="flex items-center gap-1">
                                          <div className="w-12 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                            <div className="bg-emerald-500 h-full" style={{ width: `${progressRate}%` }} />
                                          </div>
                                          <span className="text-[9px] font-mono text-slate-500">{progressRate}%</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Audited Logs section */}
                          <div className="space-y-2 pt-2 border-t border-slate-100">
                            <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 font-sans">
                              <History className="h-3.5 w-3.5 text-slate-400" />
                              Acciones y Operaciones Auditadas
                            </h5>
                            {(() => {
                              const logs = (auditLogs || []).filter((log: any) =>
                                log.userId === selectedProdAdvisorId ||
                                log.userName?.toLowerCase() === selectedAdv.name?.toLowerCase()
                              );

                              if (logs.length === 0) {
                                return (
                                  <p className="text-[10px] text-slate-400 font-semibold py-4 text-center bg-white rounded-lg border border-slate-100 italic">
                                    Sin operaciones auditadas para este usuario.
                                  </p>
                                );
                              }

                              return (
                                <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1 font-mono text-[10px] bg-white border border-slate-150 rounded-lg p-3">
                                  {logs.map((log: any) => (
                                    <div key={log.id} className="flex justify-between items-start gap-3 py-1 border-b border-slate-100 last:border-b-0">
                                      <div className="text-slate-600 text-left">
                                        <span className="font-bold text-slate-850">[{log.action}]</span> {log.details}
                                      </div>
                                      <span className="text-[9px] text-slate-400 shrink-0 font-medium">{new Date(log.timestamp).toLocaleString("es-ES")}</span>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {prodCardTab === "asignados" && (
                  <div className="space-y-4">
                    {cases.length === 0 ? (
                      <p className="text-sm text-slate-400 py-10 text-center italic">No hay legajos asignados en el sistema en este momento.</p>
                    ) : (
                      <div className="overflow-x-auto border border-slate-150 rounded-xl">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase font-mono bg-slate-50/75">
                              <th className="py-2.5 px-4">Código</th>
                              <th className="py-2.5 px-4">Legajo</th>
                              <th className="py-2.5 px-4">Asesor Asignado</th>
                              <th className="py-2.5 px-4">Fase Actual</th>
                              <th className="py-2.5 px-4 text-center">Progreso</th>
                              <th className="py-2.5 px-4 text-center">Estado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {cases.map((c: any) => {
                              const tpl = templates?.find((t: any) => t.id === c.templateId);
                              const stages = (c.stages && c.stages.length > 0) ? c.stages : (tpl?.stages || []);
                              const totalStages = stages.length || 1;
                              const currentStageIndex = stages.findIndex((s: any) => s.id === c.currentStageId);
                              const completedCount = currentStageIndex === -1 ? 0 : currentStageIndex;
                              const progressRate = Math.min(100, Math.round((completedCount / totalStages) * 100));
                              const currentStageName = stages.find((s: any) => s.id === c.currentStageId)?.name || "N/D";
                              const advisor = adminUsers.find((u: any) => u.id === c.advisorId);

                              return (
                                <tr key={c.id} className="hover:bg-slate-50/50 transition-colors text-left">
                                  <td className="py-3 px-4 font-mono font-bold text-slate-700">{c.code}</td>
                                  <td className="py-3 px-4 font-semibold text-slate-900">{c.title}</td>
                                  <td className="py-3 px-4 flex items-center gap-2">
                                    <span className="font-semibold text-slate-800">{advisor?.name || "No asignado"}</span>
                                  </td>
                                  <td className="py-3 px-4 font-medium text-slate-600">{currentStageName}</td>
                                  <td className="py-3 px-4 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                        <div className="bg-indigo-600 h-full" style={{ width: `${progressRate}%` }} />
                                      </div>
                                      <span className="font-mono text-[10px] text-slate-500">{progressRate}%</span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <span className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-bold uppercase ${
                                      c.status === "FINALIZADO" ? "bg-emerald-50 border border-emerald-100 text-emerald-800" :
                                      c.status === "OBSERVADO" ? "bg-amber-50 border border-amber-200 text-amber-800" :
                                      "bg-indigo-50 border border-indigo-100 text-indigo-800"
                                    }`}>
                                      {c.status}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {prodCardTab === "activos" && (
                  <div className="space-y-4">
                    {(() => {
                      const activeCasesList = cases.filter((c: any) => c.status !== "FINALIZADO");
                      if (activeCasesList.length === 0) {
                        return <p className="text-sm text-slate-400 py-10 text-center italic">No hay legajos activos en este momento.</p>;
                      }
                      return (
                        <div className="overflow-x-auto border border-slate-150 rounded-xl">
                          <table className="w-full text-xs text-left border-collapse">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase font-mono bg-slate-50/75">
                                <th className="py-2.5 px-4">Código</th>
                                <th className="py-2.5 px-4">Legajo</th>
                                <th className="py-2.5 px-4">Asesor Asignado</th>
                                <th className="py-2.5 px-4">Fase Actual</th>
                                <th className="py-2.5 px-4 text-center">Progreso</th>
                                <th className="py-2.5 px-4 text-center">Estado</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {activeCasesList.map((c: any) => {
                                const tpl = templates?.find((t: any) => t.id === c.templateId);
                                const stages = (c.stages && c.stages.length > 0) ? c.stages : (tpl?.stages || []);
                                const totalStages = stages.length || 1;
                                const currentStageIndex = stages.findIndex((s: any) => s.id === c.currentStageId);
                                const completedCount = currentStageIndex === -1 ? 0 : currentStageIndex;
                                const progressRate = Math.min(100, Math.round((completedCount / totalStages) * 100));
                                const currentStageName = stages.find((s: any) => s.id === c.currentStageId)?.name || "N/D";
                                const advisor = adminUsers.find((u: any) => u.id === c.advisorId);

                                return (
                                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors text-left">
                                    <td className="py-3 px-4 font-mono font-bold text-slate-700">{c.code}</td>
                                    <td className="py-3 px-4 font-semibold text-slate-900">{c.title}</td>
                                    <td className="py-3 px-4">
                                      <span className="font-semibold text-slate-800">{advisor?.name || "No asignado"}</span>
                                    </td>
                                    <td className="py-3 px-4 font-medium text-slate-600">{currentStageName}</td>
                                    <td className="py-3 px-4 text-center">
                                      <div className="flex items-center justify-center gap-2">
                                        <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                          <div className="bg-indigo-600 h-full" style={{ width: `${progressRate}%` }} />
                                        </div>
                                        <span className="font-mono text-[10px] text-slate-500">{progressRate}%</span>
                                      </div>
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                      <span className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-bold uppercase ${
                                        c.status === "OBSERVADO" ? "bg-amber-50 border border-amber-100 text-amber-800" :
                                        "bg-indigo-50 border border-indigo-100 text-indigo-800"
                                      }`}>
                                        {c.status}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {prodCardTab === "completados" && (
                  <div className="space-y-4">
                    {(() => {
                      const completedCasesList = cases.filter((c: any) => c.status === "FINALIZADO");
                      if (completedCasesList.length === 0) {
                        return <p className="text-sm text-slate-400 py-10 text-center italic">No hay legajos finalizados o cerrados en este momento.</p>;
                      }
                      return (
                        <div className="overflow-x-auto border border-slate-150 rounded-xl">
                          <table className="w-full text-xs text-left border-collapse">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase font-mono bg-slate-50/75">
                                <th className="py-2.5 px-4">Código</th>
                                <th className="py-2.5 px-4">Legajo</th>
                                <th className="py-2.5 px-4">Asesor Asignado</th>
                                <th className="py-2.5 px-4">Fase Final</th>
                                <th className="py-2.5 px-4 text-center">Progreso</th>
                                <th className="py-2.5 px-4 text-center">Estado</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {completedCasesList.map((c: any) => {
                                const tpl = templates?.find((t: any) => t.id === c.templateId);
                                const stages = (c.stages && c.stages.length > 0) ? c.stages : (tpl?.stages || []);
                                const totalStages = stages.length || 1;
                                const currentStageIndex = stages.findIndex((s: any) => s.id === c.currentStageId);
                                const progressRate = 100;
                                const currentStageName = stages[stages.length - 1]?.name || "N/D";
                                const advisor = adminUsers.find((u: any) => u.id === c.advisorId);

                                return (
                                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors text-left">
                                    <td className="py-3 px-4 font-mono font-bold text-slate-750">{c.code}</td>
                                    <td className="py-3 px-4 font-semibold text-slate-900">{c.title}</td>
                                    <td className="py-3 px-4">
                                      <span className="font-semibold text-slate-800">{advisor?.name || "No asignado"}</span>
                                    </td>
                                    <td className="py-3 px-4 font-medium text-slate-600">{currentStageName}</td>
                                    <td className="py-3 px-4 text-center">
                                      <div className="flex items-center justify-center gap-2">
                                        <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                          <div className="bg-emerald-500 h-full" style={{ width: `${progressRate}%` }} />
                                        </div>
                                        <span className="font-mono text-[10px] text-slate-500">{progressRate}%</span>
                                      </div>
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                      <span className="inline-block px-2 py-0.5 rounded-md text-[9px] font-bold uppercase bg-emerald-50 border border-emerald-100 text-emerald-800">
                                        {c.status}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {prodCardTab === "eficiencia" && (
                  <div className="space-y-6 text-left">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {stats.casesByAdvisor && stats.casesByAdvisor.map((adv: any) => {
                        const rate = adv.totalCount > 0 ? Math.round((adv.completedCount / adv.totalCount) * 100) : 0;
                        return (
                          <div key={adv.id} className="p-4 bg-slate-50 border border-slate-150 rounded-xl space-y-3.5 hover:border-indigo-400 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <img
                                  src={adv.avatarUrl || `https://ui-avatars.com/api/?name=${adv.name}`}
                                  alt={adv.name}
                                  className="h-9 w-9 rounded-xl object-cover bg-white border border-slate-200"
                                  referrerPolicy="no-referrer"
                                />
                                <div>
                                  <p className="font-bold text-slate-800 text-xs">{adv.name}</p>
                                  <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Asesor de Procesos</p>
                                </div>
                              </div>
                              <span className="text-xl font-bold font-mono text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
                                {rate}%
                              </span>
                            </div>

                            <div className="space-y-1.5">
                              <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase font-mono">
                                <span>Eficiencia de Cierre</span>
                                <span>{adv.completedCount} de {adv.totalCount} legajos</span>
                              </div>
                              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                                <div className="bg-indigo-600 h-full rounded-full transition-all duration-500" style={{ width: `${rate}%` }} />
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                              <div className="bg-white border border-slate-150 p-2 rounded-lg">
                                <span className="text-[9px] font-bold text-slate-400 block uppercase font-mono">Asignados</span>
                                <span className="font-mono text-slate-800 font-bold mt-0.5 block">{adv.totalCount}</span>
                              </div>
                              <div className="bg-white border border-slate-150 p-2 rounded-lg">
                                <span className="text-[9px] font-bold text-slate-400 block uppercase font-mono">Activos</span>
                                <span className="font-mono text-slate-800 font-bold mt-0.5 block">{adv.activeCount}</span>
                              </div>
                              <div className="bg-white border border-slate-150 p-2 rounded-lg">
                                <span className="text-[9px] font-bold text-slate-400 block uppercase font-mono">Completados</span>
                                <span className="font-mono text-slate-800 font-bold mt-0.5 block">{adv.completedCount}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {prodCardTab === "observados" && (
                  <div className="space-y-4 text-left">
                    <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100 mb-4">
                      <AlertCircle className="h-4.5 w-4.5 text-amber-500 animate-pulse" />
                      <div>
                        <h4 className="font-display font-bold text-slate-900 text-xs">Historial de Observaciones Activas en el Sistema</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Legajos con advertencias u observaciones que requieren atención inmediata.</p>
                      </div>
                    </div>

                    {stats.recentObservations && stats.recentObservations.length === 0 ? (
                      <p className="text-xs text-slate-400 py-10 text-center italic">No hay observaciones abiertas en este momento.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {stats.recentObservations && stats.recentObservations.map((obs: any) => (
                          <div key={obs.id} className="p-4 bg-amber-50/40 border border-amber-150/60 rounded-xl relative hover:bg-amber-50/75 hover:border-amber-300 transition-all text-left flex flex-col justify-between">
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[9px] font-bold text-amber-800 bg-amber-100/60 px-1.5 py-0.5 rounded uppercase font-mono">
                                  {obs.entityType}
                                </span>
                                <span className={`text-[9px] px-1.5 py-0.5 font-bold uppercase rounded-md ${
                                  obs.status === "ABIERTA" ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-emerald-100 text-emerald-800"
                                }`}>
                                  {obs.status}
                                </span>
                              </div>
                              <p className="text-xs text-slate-700 font-semibold italic leading-relaxed">
                                "{obs.message}"
                              </p>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-amber-100/40 mt-3.5 pt-2 font-medium">
                              <span>Autor: {obs.authorName}</span>
                              <span className="font-mono">{new Date(obs.createdAt).toLocaleDateString("es-ES")}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null
      ) : (
        <div className="py-12 text-center bg-white border border-slate-100 rounded-2xl">
          <RefreshCw className="h-6 w-6 text-slate-300 animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-500 mt-2">Cargando indicadores financieros...</p>
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === "templates" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50 p-4 border border-slate-200/70 rounded-xl gap-4">
            <div>
              <p className="text-xs text-slate-500 font-semibold">Configuración & Modelado</p>
              <h4 className="text-sm font-bold text-slate-800">
                Plantillas configurables para rubros diversos
              </h4>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                id="btn-manage-categories"
                onClick={() => setShowCategoryManager(!showCategoryManager)}
                className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-colors border ${
                  showCategoryManager 
                    ? "bg-amber-650 hover:bg-amber-700 text-white border-amber-650 shadow-xs" 
                    : "bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200"
                }`}
              >
                <Sliders className="h-3.5 w-3.5" />
                {showCategoryManager ? "Cerrar Gestor de Operaciones" : `Gestionar ${commercialFocus === "inmobiliaria" ? "Operaciones" : "Categorías"}`}
              </button>

              <button
                id="btn-trigger-ai-tpl"
                onClick={() => {
                  setUseAI(true);
                  setUsePDF(false);
                  setShowCreator(true);
                }}
                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-colors shadow-xs"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Diseñar con Gemini AI
              </button>

              <button
                id="btn-trigger-pdf-tpl"
                onClick={() => {
                  setUseAI(false);
                  setUsePDF(true);
                  setShowCreator(true);
                }}
                className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-colors shadow-xs"
              >
                <FileText className="h-3.5 w-3.5" />
                Subir PDF de Proceso
              </button>
              
              <button
                id="btn-trigger-manual-tpl"
                onClick={() => {
                  setUseAI(false);
                  setUsePDF(false);
                  setShowCreator(true);
                }}
                className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Nueva Manual
              </button>
            </div>
          </div>

          {/* Category/Operation Manager Panel */}
          {showCategoryManager && (
            <div className="bg-amber-50/45 border-2 border-amber-200 rounded-2xl p-6 shadow-xs animate-in fade-in duration-250 space-y-4">
              <div className="flex justify-between items-start border-b border-amber-250/50 pb-3">
                <div>
                  <h3 className="font-display font-bold text-amber-950 text-sm flex items-center gap-2">
                    🛠️ Gestor de {commercialFocus === "inmobiliaria" ? "Tipos de Operación" : "Categorías de Proceso"}
                  </h3>
                  <p className="text-[11px] text-amber-800/80 mt-0.5">
                    Modifique las opciones disponibles de categorías/operaciones para el rubro activo (<strong>{commercialFocus?.toUpperCase() || "General"}</strong>). Estos cambios afectarán a todos los managers y administradores al crear nuevas plantillas de procesos.
                  </p>
                </div>
                <button
                  onClick={() => setShowCategoryManager(false)}
                  className="text-amber-800 hover:text-amber-950 font-bold text-xs cursor-pointer"
                >
                  ✕ Cerrar
                </button>
              </div>

              {/* Form to add a new category */}
              <div className="flex flex-col sm:flex-row gap-2 max-w-lg">
                <input
                  type="text"
                  placeholder={commercialFocus === "inmobiliaria" ? "Ej: Alquiler Temporal, Venta de Lote..." : "Ej: Litigio Civil, Auditoría..."}
                  value={newCustomCategory}
                  onChange={(e) => setNewCustomCategory(e.target.value)}
                  className="flex-1 text-xs border border-amber-300 rounded-lg p-2.5 bg-white text-slate-900 focus:border-amber-550 focus:outline-hidden"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCategory();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  disabled={adminLoading}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="h-4 w-4" /> Agregar
                </button>
              </div>

              {/* Categories list table/bento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {categories.map((cat, idx) => (
                  <div
                    key={cat + idx}
                    className="flex items-center justify-between bg-white border border-amber-200/60 rounded-xl p-2.5 shadow-3xs hover:border-amber-300 transition-colors"
                  >
                    {editingCategoryIdx === idx ? (
                      <div className="flex items-center gap-1.5 w-full">
                        <input
                          type="text"
                          value={editingCategoryValue}
                          onChange={(e) => setEditingCategoryValue(e.target.value)}
                          className="flex-1 text-xs border border-slate-250 rounded p-1 bg-slate-50 text-slate-950 focus:outline-hidden"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleSaveEditedCategory(idx);
                            } else if (e.key === "Escape") {
                              setEditingCategoryIdx(null);
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEditedCategory(idx)}
                          className="text-emerald-600 hover:text-emerald-700 p-1 rounded cursor-pointer"
                          title="Guardar"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCategoryIdx(null)}
                          className="text-slate-400 hover:text-slate-600 p-1 rounded font-bold text-xs cursor-pointer"
                          title="Cancelar"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-xs font-semibold text-slate-800 truncate pr-2">
                          {cat}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCategoryIdx(idx);
                              setEditingCategoryValue(cat);
                            }}
                            className="text-slate-400 hover:text-slate-600 p-1 rounded transition-colors cursor-pointer"
                            title="Editar nombre"
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat)}
                            className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors cursor-pointer"
                            title="Eliminar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Create Template Modal / Form overlay */}
          {showCreator && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-md border-t-4 border-slate-900 animate-in fade-in zoom-in-95 duration-250">
              
              {/* Toggle switch head */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
                <div>
                  <h3 className="font-display font-bold text-slate-950 text-base">
                    {usePDF ? "Análisis de Plantilla PDF con Gemini" : useAI ? "Generación Inteligente asistida por Gemini" : "Creando Plantilla Operativa de Trabajo"}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Defina etapas secuenciales, formularios y subida de documentación obligatoria.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowCreator(false);
                    setUsePDF(false);
                    setUseAI(false);
                  }}
                  className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer text-xs font-bold px-2 py-1"
                >
                  Cerrar (✕)
                </button>
              </div>

              {usePDF ? (
                /* PDF Upload & Extraction View */
                <div className="space-y-4">
                  <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-8 text-center flex flex-col items-center justify-center space-y-3">
                    <div className="bg-emerald-50 text-emerald-700 p-3 rounded-full">
                      <FileText className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Subir Archivo PDF de Plantilla</h4>
                      <p className="text-[11px] text-slate-500 mt-1 max-w-sm">
                        Suba un documento PDF previamente creado con el proceso operativo. Gemini analizará el contenido para extraer etapas y requisitos automáticamente.
                      </p>
                    </div>

                    <input
                      type="file"
                      accept=".pdf"
                      id="pdf-template-upload"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadPDFTemplate(file);
                      }}
                    />
                    <label
                      htmlFor="pdf-template-upload"
                      className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg cursor-pointer transition-colors shadow-xs"
                    >
                      {pdfLoading ? "Procesando PDF..." : "Seleccionar Archivo PDF"}
                    </label>

                    {pdfLoading && (
                      <div className="flex items-center gap-2 text-xs text-indigo-700 font-semibold animate-pulse mt-2">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Analizando estructura del documento con Gemini 3.5...
                      </div>
                    )}
                  </div>

                  {pdfError && (
                    <div className="p-3 bg-red-50 border border-red-250 text-red-700 rounded-lg text-xs flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      <span>{pdfError}</span>
                    </div>
                  )}

                  <div className="flex gap-2 justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUsePDF(false);
                        setUseAI(false);
                      }}
                      className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      Boceto Manual
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUsePDF(false);
                        setUseAI(true);
                      }}
                      className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      Diseñar con Prompt de IA
                    </button>
                  </div>
                </div>
              ) : useAI ? (
                /* Gemini Form Integration */
                <form onSubmit={handleGenerateAI} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {commercialFocus === "general" ? (
                      <div className="md:col-span-1">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                          Rubro o Sector Comercial
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Ej: Odontología, Concesionaria, Escribanía..."
                          value={aiSector}
                          onChange={(e) => setAiSector(e.target.value)}
                          className="w-full text-xs border border-slate-250 rounded-lg p-2.5 bg-white text-slate-950 focus:border-slate-800 focus:outline-hidden"
                        />
                      </div>
                    ) : (
                      <div className="md:col-span-1">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                          {commercialFocus === "inmobiliaria" ? "Tipo de Operación" : "Tipo de Proceso"}
                        </label>
                        <select
                          value={operationType}
                          onChange={(e) => handleOperationTypeChange(e.target.value)}
                          className="w-full text-xs border border-slate-250 rounded-lg p-2.5 bg-white text-slate-950 focus:border-slate-800 focus:outline-hidden font-semibold cursor-pointer"
                        >
                          {categories.map((op) => (
                            <option key={op} value={op}>
                              {op}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Instrucciones opcionales del Proceso (Prompt)
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: proceso de suscripción de pólizas que incluya DNI, fotos de patente y perito técnico..."
                        value={aiDescription}
                        onChange={(e) => setAiDescription(e.target.value)}
                        className="w-full text-xs border border-slate-250 rounded-lg p-2.5 bg-white text-slate-950 focus:border-slate-800 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  {aiError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      <span>{aiError}</span>
                    </div>
                  )}

                  <div className="flex gap-2 justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setUseAI(false)}
                      className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      Boceto Manual
                    </button>
                    <button
                      type="submit"
                      disabled={aiLoading}
                      className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      {aiLoading ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          Generando con Gemini AI...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          Generar Plantilla Inteligente
                        </>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                /* Manual template builder form */
                <form onSubmit={handleCreateTemplateSubmit} className="space-y-6">
                  
                  {/* General settings */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Nombre del Proceso</label>
                      <input
                        type="text"
                        required
                        placeholder="Ej: Contrato de Fideicomiso"
                        value={tplName}
                        onChange={(e) => setTplName(e.target.value)}
                        className="w-full text-xs border border-slate-250 rounded-lg p-2.5 bg-white text-slate-900 focus:border-slate-800 focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Categoría</label>
                      <select
                        value={tplCategory}
                        onChange={(e) => setTplCategory(e.target.value)}
                        className="w-full text-xs border border-slate-250 rounded-lg p-2.5 bg-white text-slate-900 focus:border-slate-800 focus:outline-hidden"
                      >
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Breve Descripción</label>
                      <input
                        type="text"
                        placeholder="Propósito global..."
                        value={tplDescription}
                        onChange={(e) => setTplDescription(e.target.value)}
                        className="w-full text-xs border border-slate-250 rounded-lg p-2.5 bg-white text-slate-900 focus:border-slate-800 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  {/* Stages Stack */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Etapas del Proceso</span>
                      <button
                        type="button"
                        onClick={addStageRow}
                        className="text-[11px] font-bold text-slate-900 hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="h-3 w-3" /> Añadir Etapa
                      </button>
                    </div>

                    {tplStages.map((stage, sIdx) => (
                      <div key={sIdx} className="border border-slate-200 rounded-xl p-4 bg-slate-50 relative">
                        <button
                          type="button"
                          onClick={() => removeStageRow(sIdx)}
                          className="absolute right-3 top-3 text-red-500 hover:text-red-700 text-xs font-medium cursor-pointer"
                        >
                          Eliminar Etapa
                        </button>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-4xl">
                          <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500">Etapa {sIdx + 1} Título</label>
                            <input
                              type="text"
                              required
                              value={stage.name}
                              onChange={(e) => updateStageField(sIdx, "name", e.target.value)}
                              className="w-full text-xs border border-slate-250 rounded-lg p-1.5 mt-1 bg-white text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500">Instrucciones / Propósito</label>
                            <input
                              type="text"
                              value={stage.description}
                              onChange={(e) => updateStageField(sIdx, "description", e.target.value)}
                              className="w-full text-xs border border-slate-250 rounded-lg p-1.5 mt-1 bg-white"
                            />
                          </div>
                        </div>

                        {/* Stage Requirements Checklist */}
                        <div className="mt-4 pt-3 border-t border-slate-150 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-600 uppercase">Requisitos de Etapa {sIdx + 1}</span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => addRequirementToStage(sIdx, "DOCUMENT")}
                                className="text-[10px] font-semibold bg-slate-200 rounded px-2 py-1 hover:bg-slate-300 text-slate-800"
                              >
                                + Documento
                              </button>
                              <button
                                type="button"
                                onClick={() => addRequirementToStage(sIdx, "FORM")}
                                className="text-[10px] font-semibold bg-slate-200 rounded px-2 py-1 hover:bg-slate-300 text-slate-800"
                              >
                                + Formulario
                              </button>
                              <button
                                type="button"
                                onClick={() => addRequirementToStage(sIdx, "TASK")}
                                className="text-[10px] font-semibold bg-slate-200 rounded px-2 py-1 hover:bg-slate-300 text-slate-800"
                              >
                                + Tarea/Actividad
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {stage.requirements.length === 0 ? (
                              <p className="text-[11px] text-slate-400 italic">No hay requisitos para esta etapa. El asesor continuará sin bloqueos.</p>
                            ) : (
                              stage.requirements.map((req: any, rIdx: number) => (
                                <div key={rIdx} className="bg-white border border-slate-200 p-3.5 rounded-xl text-xs space-y-3 shadow-xs">
                                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                    {/* Type selector selector */}
                                    <select
                                      value={req.type}
                                      onChange={(e) => {
                                        const newType = e.target.value as any;
                                        updateReqField(sIdx, rIdx, "type", newType);
                                        if (newType === "FORM" && (!req.formFields || req.formFields.length === 0)) {
                                          updateReqField(sIdx, rIdx, "formFields", [
                                            { name: "campo_1", label: "Nombre del Campo", type: "text", required: true }
                                          ]);
                                        }
                                      }}
                                      className="text-[10px] font-bold border border-slate-200 rounded p-1 bg-slate-50 text-slate-700 focus:outline-none"
                                    >
                                      <option value="DOCUMENT">📄 DOCUMENTO</option>
                                      <option value="FORM">📋 FORMULARIO</option>
                                      <option value="TASK">✅ TAREA</option>
                                    </select>

                                    {/* Name input */}
                                    <input
                                      type="text"
                                      required
                                      placeholder="Nombre del requisito..."
                                      value={req.name}
                                      onChange={(e) => updateReqField(sIdx, rIdx, "name", e.target.value)}
                                      className="flex-1 text-xs border border-slate-250 rounded p-1.5 font-medium focus:border-slate-850 focus:outline-none bg-white text-slate-900"
                                    />

                                    <div className="flex items-center justify-between sm:justify-start gap-4">
                                      {/* Obligatorio checkbox */}
                                      <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 select-none cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={req.required}
                                          onChange={(e) => updateReqField(sIdx, rIdx, "required", e.target.checked)}
                                          className="rounded border-slate-300 text-slate-900 focus:ring-slate-950 h-3.5 w-3.5"
                                        />
                                        Obligatorio
                                      </label>

                                      {/* Remove button */}
                                      <button
                                        type="button"
                                        onClick={() => removeReqFromStage(sIdx, rIdx)}
                                        className="text-slate-400 hover:text-red-600 transition-colors cursor-pointer p-1 font-bold"
                                        title="Eliminar requisito"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </div>

                                  {/* Description input */}
                                  <div>
                                    <label className="block text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Instrucciones o Detalles para el Asesor</label>
                                    <input
                                      type="text"
                                      placeholder="Defina indicaciones específicas para que el asesor entienda cómo completar este requisito..."
                                      value={req.description || ""}
                                      onChange={(e) => updateReqField(sIdx, rIdx, "description", e.target.value)}
                                      className="w-full text-xs border border-slate-200 rounded p-1.5 bg-slate-50/50 text-slate-700 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-slate-300"
                                    />
                                  </div>

                                  {/* Custom Form Fields if type === "FORM" */}
                                  {req.type === "FORM" && (
                                    <div className="p-3 bg-slate-50/60 border border-slate-150 rounded-lg space-y-2 text-left">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">🗂️ Campos Personalizados del Formulario</span>
                                        <button
                                          type="button"
                                          onClick={() => addFormFieldToReq(sIdx, rIdx)}
                                          className="text-[9px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded cursor-pointer"
                                        >
                                          + Agregar Campo
                                        </button>
                                      </div>

                                      <div className="space-y-1.5">
                                        {(!req.formFields || req.formFields.length === 0) ? (
                                          <p className="text-[10px] text-slate-400 italic">No hay campos definidos para este formulario.</p>
                                        ) : (
                                          req.formFields.map((field: any, fIdx: number) => (
                                            <div key={fIdx} className="flex flex-col sm:flex-row sm:items-center gap-1.5 bg-white border border-slate-150 p-2 rounded text-[11px]">
                                              {/* Label Input */}
                                              <div className="flex-1">
                                                <input
                                                  type="text"
                                                  required
                                                  placeholder="Etiqueta (Ej: Dirección comercial)"
                                                  value={field.label || ""}
                                                  onChange={(e) => updateFormFieldInReq(sIdx, rIdx, fIdx, "label", e.target.value)}
                                                  className="w-full border-none p-1 font-semibold text-slate-800 placeholder-slate-400 bg-transparent focus:outline-none focus:ring-1 focus:ring-slate-300 rounded"
                                                />
                                              </div>

                                              {/* Name (hidden id of the field) */}
                                              <div className="w-24">
                                                <input
                                                  type="text"
                                                  placeholder="ID de clave"
                                                  value={field.name || ""}
                                                  onChange={(e) => updateFormFieldInReq(sIdx, rIdx, fIdx, "name", e.target.value)}
                                                  className="w-full text-[10px] font-mono text-slate-500 border-none p-1 bg-transparent focus:outline-none focus:ring-1 focus:ring-slate-300 rounded"
                                                  title="Identificador interno del campo"
                                                />
                                              </div>

                                              {/* Select Type */}
                                              <div>
                                                <select
                                                  value={field.type || "text"}
                                                  onChange={(e) => updateFormFieldInReq(sIdx, rIdx, fIdx, "type", e.target.value)}
                                                  className="bg-transparent font-medium text-slate-600 border-none p-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-slate-300 rounded focus:bg-white"
                                                >
                                                  <option value="text">Texto simple</option>
                                                  <option value="number">Número</option>
                                                  <option value="email">Email</option>
                                                  <option value="checkbox">SÍ/NO (Casillero)</option>
                                                  <option value="textarea">Área de texto grande</option>
                                                </select>
                                              </div>

                                              {/* Required Toggle */}
                                              <label className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 cursor-pointer select-none">
                                                <input
                                                  type="checkbox"
                                                  checked={field.required}
                                                  onChange={(e) => updateFormFieldInReq(sIdx, rIdx, fIdx, "required", e.target.checked)}
                                                  className="rounded text-slate-900 h-3 w-3"
                                                />
                                                Obligatorio
                                              </label>

                                              {/* Delete Field */}
                                              <button
                                                type="button"
                                                onClick={() => removeFormFieldFromReq(sIdx, rIdx, fIdx)}
                                                className="text-red-400 hover:text-red-650 p-1 font-bold text-[10px]"
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          ))
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowCreator(false)}
                      className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-slate-950 text-white text-xs font-bold rounded-lg hover:bg-slate-900"
                    >
                      Registrar en Sistema
                    </button>
                  </div>

                </form>
              )}

            </div>
          )}

          {/* List of current Available Process Templates */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((tpl) => (
              <div key={tpl.id} id={`tpl-card-${tpl.id}`} className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs relative hover:shadow-sm hover:border-slate-250 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 uppercase font-mono">
                      {tpl.category}
                    </span>
                    
                    {tpl.id.startsWith("tpl-ai-") && (
                      <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-150 rounded-md px-1.5 py-0.5 inline-flex items-center gap-1">
                        <Sparkles className="h-2.5 w-2.5" /> AI
                      </span>
                    )}
                  </div>

                  <h3 className="font-display font-bold text-slate-900 text-sm mt-3">{tpl.name}</h3>
                  <p className="text-slate-500 text-xs mt-1.5 leading-snug line-clamp-3">
                    {tpl.description}
                  </p>

                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <p className="text-[10px] uppercase font-bold text-slate-400 font-mono">Etapas Definidas ({tpl.stages.length})</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {tpl.stages.sort((a,b)=>a.order-b.order).map((stg) => (
                        <span key={stg.id} className="text-[10px] font-medium bg-slate-50 border border-slate-150 rounded-md px-1.5 py-0.5 text-slate-600">
                          {stg.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex justify-between items-center pt-3 border-t border-slate-100/50">
                  <span className="text-[10px] font-semibold text-slate-400">ID: {tpl.id}</span>
                  <button
                    onClick={() => onDeleteTemplate(tpl.id)}
                    className="p-1 text-slate-400 hover:text-red-500 cursor-pointer transition-colors"
                    title="Eliminar Plantilla"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit Logs Tab */}
      {activeTab === "audit" && (
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-3xs p-6 text-left">
          <div className="flex items-center gap-2.5 mb-6 border-b border-slate-100 pb-4">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-slate-900 text-sm">Registro de Auditoría Imparcial</h3>
              <p className="text-xs text-slate-500 mt-0.5">Historial histórico inmutable de logs del sistema distribuidos cronológicamente.</p>
            </div>
          </div>

          <div className="overflow-hidden border border-slate-200/60 rounded-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase font-mono bg-slate-50/75">
                    <th className="py-3 px-4">Fecha / Hora</th>
                    <th className="py-3 px-4">Usuario Emisor</th>
                    <th className="py-3 px-4">Rol</th>
                    <th className="py-3 px-4">Acción Registrada</th>
                    <th className="py-3 px-4">Entidad Afectada</th>
                    <th className="py-3 px-4">Descripción / Nota</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {(() => {
                    const filteredLogs = auditLogs.filter(log => {
                      if (currentUser.role === "ADMIN") return true;
                      if (currentUser.role === "MANAGER") {
                        // Own logs + all advisors' logs
                        return log.userId === currentUser.id || log.userRole === "ASESOR";
                      }
                      return log.userId === currentUser.id;
                    });

                    if (filteredLogs.length === 0) {
                      return (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-slate-400 font-medium font-mono">
                            No hay registros de auditoría disponibles correspondientes a su nivel de cuenta.
                          </td>
                        </tr>
                      );
                    }

                    return filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 text-slate-400 font-mono whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString("es-ES")}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">
                          {log.userName}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`inline-flex px-1.5 py-0.5 rounded-md text-[9px] font-bold border uppercase tracking-wider font-mono ${
                            log.userRole === "MANAGER" ? "bg-indigo-50 border-indigo-200/50 text-indigo-700" :
                            log.userRole === "ADMIN" ? "bg-rose-50 border-rose-200/50 text-rose-700" : "bg-teal-50 border-teal-200/50 text-teal-800"
                          }`}>
                            {log.userRole}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap font-mono">
                          {log.action}
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                          {log.entityType} <span className="text-slate-400">({log.entityId})</span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={log.description}>
                          {log.description}
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
