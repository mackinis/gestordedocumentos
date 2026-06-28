/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  FolderOpen, 
  Plus, 
  Search, 
  SlidersHorizontal,
  Clock,
  Sparkles,
  Layers,
  Inbox,
  AlertCircle,
  HelpCircle,
  TrendingUp,
  UserCheck,
  LogOut,
  X,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Users,
  History,
  Menu,
  ShieldCheck,
  ClipboardList,
  Settings,
  FileText,
  Mail,
  Bell
} from "lucide-react";
import Navbar from "./components/Navbar";
import ManagerDashboard from "./components/ManagerDashboard";
import AdvisorDashboard from "./components/AdvisorDashboard";
import CaseDetails from "./components/CaseDetails";
import ProfileModal from "./components/ProfileModal";
import CustomTabContent from "./components/CustomTabContent";
import MessagesView from "./components/MessagesView";
import NotificationsView from "./components/NotificationsView";
import { getTranslations, getText } from "./utils/commercialTranslations";
import { User, Case, ProcessTemplate, Notification, AuditLog, CaseRequest } from "./types";

export default function App() {
  // Navigation & States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<string>("cases"); // "cases" | "templates" | "audit"
  const [forcedSubTab, setForcedSubTab] = useState<"stats" | "templates" | "audit" | "admin_users" | "configuracion" | "textos">("stats");
  const [expandedGroups, setExpandedGroups] = useState({
    cases: true,
    templates: true,
    audit: true,
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hasPendingApprovals, setHasPendingApprovals] = useState(false);
  const [hasNewUnseenApprovals, setHasNewUnseenApprovals] = useState(false);
  const [commercialFocus, setCommercialFocus] = useState<string>("general");
  const [publicSettings, setPublicSettings] = useState<any>({ allowAdvisorViewProductivity: false });
  
  const [cases, setCases] = useState<Case[]>([]);
  const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [customTabs, setCustomTabs] = useState<any[]>([]);
  const [caseRequests, setCaseRequests] = useState<CaseRequest[]>([]);

  // Active Case Detail focus
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [caseDetails, setCaseDetails] = useState<any>(null);

  // Master UI element control states
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("TODOS"); // "TODOS", "ACTIVO", "OBSERVADO", "PENDIENTE", "FINALIZADO", "MIS_ASIGNADOS"
  const [loading, setLoading] = useState(true);

  // Case Creator Modal state
  const [showCaseModal, setShowCaseModal] = useState(false);
  const [activeCaseRequestId, setActiveCaseRequestId] = useState<string | null>(null);
  const [nCaseTitle, setNCaseTitle] = useState("");
  const [nCaseDesc, setNCaseDesc] = useState("");
  const [nCaseTplId, setNCaseTplId] = useState("");
  const [nCaseAdvId, setNCaseAdvId] = useState("");
  const [nCaseManagerId, setNCaseManagerId] = useState("");
  const [nCasePartRole, setNCasePartRole] = useState("Cliente");
  const [nCasePartName, setNCasePartName] = useState("");
  const [nCasePartSurname, setNCasePartSurname] = useState("");
  const [nCasePartDni, setNCasePartDni] = useState("");
  const [nCaseStagesDetermined, setNCaseStagesDetermined] = useState(true);
  const [nCaseCompradores, setNCaseCompradores] = useState(1);
  const [nCaseVendedores, setNCaseVendedores] = useState(1);
  const [nCaseGarantes, setNCaseGarantes] = useState(0);

  // Simulations, profiles & admin views states
  const [simulatedUser, setSimulatedUser] = useState<User | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [adminActiveTab, setAdminActiveTab] = useState<string>("cases");

  // Admin manually creating credentials states
  const [newCredName, setNewCredName] = useState("");
  const [newCredEmail, setNewCredEmail] = useState("");
  const [newCredPhone, setNewCredPhone] = useState("");
  const [newCredPassword, setNewCredPassword] = useState("");
  const [newCredRole, setNewCredRole] = useState("ASESOR");
  const [credSuccessMessage, setCredSuccessMessage] = useState("");
  const [credErrorMessage, setCredErrorMessage] = useState("");

  // Auth/Register/Verify credentials states
  const [authMode, setAuthMode] = useState<"login" | "register" | "verify">("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [verifyUserId, setVerifyUserId] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Session verification on app startup
  const checkStoredSession = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/auth/me", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (res.ok) {
        const userData = await res.json();
        setCurrentUser(userData);
      } else {
        localStorage.removeItem("token");
      }
    } catch (e) {
      console.error("Failed to restore previous session:", e);
    } finally {
      setLoading(false);
    }
  };

  // Hydrate lists from backend full REST API
  const syncData = async () => {
    try {
      const token = localStorage.getItem("token");
      const headersJSON: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headersJSON["Authorization"] = `Bearer ${token}`;
      }

      const usersRes = await fetch("/api/users");
      const usersData = await usersRes.json();
      setAvailableUsers(usersData);

      const focusRes = await fetch("/api/settings/public");
      if (focusRes.ok) {
        const focusData = await focusRes.json();
        setCommercialFocus(focusData.commercialFocus || "general");
        setPublicSettings(focusData);
        if (focusData.customTexts) {
          localStorage.setItem("customTexts", JSON.stringify(focusData.customTexts));
        } else {
          localStorage.removeItem("customTexts");
        }
      }

      const casesRes = await fetch("/api/cases", { headers: headersJSON });
      const casesData = await casesRes.json();
      setCases(casesData);

      const templatesRes = await fetch("/api/templates", { headers: headersJSON });
      const templatesData = await templatesRes.json();
      setTemplates(templatesData);
      if (templatesData.length > 0 && !nCaseTplId) {
        setNCaseTplId(templatesData[0].id);
      }

      const statsRes = await fetch("/api/dashboard/stats", { headers: headersJSON });
      const statsData = await statsRes.json();
      setStats(statsData);

      const auditRes = await fetch("/api/audit-logs", { headers: headersJSON });
      const auditData = await auditRes.json();
      setAuditLogs(auditData);

      const notifRes = await fetch("/api/notifications", { headers: headersJSON });
      const notifData = await notifRes.json();
      setNotifications(notifData);

      const msgRes = await fetch("/api/messages?box=inbox", { headers: headersJSON });
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        setMessages(msgData);
      }

      const customTabsRes = await fetch("/api/custom-tabs", { headers: headersJSON });
      if (customTabsRes.ok) {
        const customTabsData = await customTabsRes.json();
        setCustomTabs(customTabsData);
      }

      const caseReqsRes = await fetch("/api/case-requests", { headers: headersJSON });
      if (caseReqsRes.ok) {
        const caseReqsData = await caseReqsRes.json();
        setCaseRequests(caseReqsData);
      }

      const pendingAppRes = await fetch("/api/dashboard/pending-approvals", { headers: headersJSON });
      if (pendingAppRes.ok) {
        const pendingAppData = await pendingAppRes.json();
        setHasPendingApprovals(!!pendingAppData.hasPending);
      } else {
        setHasPendingApprovals(false);
      }

      // Hydrate selected case details in real-time
      if (activeCaseId) {
        await syncCaseDetails(activeCaseId);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
    }
  };

  const syncCaseDetails = async (caseId: string) => {
    try {
      const detailsRes = await fetch(`/api/cases/${caseId}`);
      if (detailsRes.ok) {
        const detailsData = await detailsRes.json();
        setCaseDetails(detailsData);
      }
    } catch (error) {
      console.error("Failed to sync case details:", error);
    }
  };

  useEffect(() => {
    const startup = async () => {
      await checkStoredSession();
    };
    startup();
  }, []);

  useEffect(() => {
    if (currentUser) {
      syncData();
    }
  }, [currentUser, activeCaseId]);

  useEffect(() => {
    if (!hasPendingApprovals) {
      setHasNewUnseenApprovals(false);
      return;
    }
    
    const isViewingAuditoria = activeTab === "templates" && (forcedSubTab === "stats" || forcedSubTab === "audit");
    if (isViewingAuditoria) {
      setHasNewUnseenApprovals(false);
    } else {
      setHasNewUnseenApprovals(true);
    }
  }, [activeTab, forcedSubTab, hasPendingApprovals]);

  // Log in user
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      setAuthError("Ingrese el correo y contraseña correspondientes.");
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    setAuthSuccess("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      
      let data: any;
      try {
        data = await response.json();
      } catch (parseErr) {
        throw new Error("El servidor de autenticación no devolvió un formato JSON válido.");
      }

      if (response.ok && data.success) {
        localStorage.setItem("token", data.token);
        setCurrentUser(data.user);
        setLoginEmail("");
        setLoginPassword("");
        setAuthSuccess("Acceso concedido.");
      } else {
        setAuthError(data.message || "Credenciales de acceso incorrectas.");
      }
    } catch (err: any) {
      console.error("Login Error:", err);
      setAuthError(err.message || "No se pudo conectar con el servidor de autenticación.");
    } finally {
      setAuthLoading(false);
    }
  };

  // Register advisor
  const handleRegisterAdvisorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName || !regEmail || !regPhone || !regPassword) {
      setAuthError("Todos los campos de registro son requeridos.");
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    setAuthSuccess("");
    try {
      const response = await fetch("/api/auth/register-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regName,
          email: regEmail,
          phone: regPhone,
          password: regPassword
        })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setVerifyUserId(data.userId);
        setAuthSuccess(data.message || "Registro inicial exitoso. Código de 16 caracteres enviado.");
        setAuthMode("verify");
      } else {
        setAuthError(data.message || "Error al completar el registro del asesor.");
      }
    } catch (err) {
      setAuthError("Error de red conectando con el registro.");
    } finally {
      setAuthLoading(false);
    }
  };

  // Verify registration token
  const handleVerifyTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationToken) {
      setAuthError("Ingrese el token de seguridad rústico de 16 caracteres.");
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    setAuthSuccess("");
    try {
      const response = await fetch("/api/auth/verify-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: verifyUserId,
          token: verificationToken
        })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setAuthSuccess("¡Contacto verificado con éxito! Su cuenta está en espera de aprobación final por el Director General.");
        setAuthMode("login");
        setVerificationToken("");
        setVerifyUserId("");
        setRegName("");
        setRegEmail("");
        setRegPhone("");
        setRegPassword("");
      } else {
        setAuthError(data.message || "El token de validación es incorrecto.");
      }
    } catch (err) {
      setAuthError("Error de comunicación verificando el token.");
    } finally {
      setAuthLoading(false);
    }
  };

  // Secure manual sign out action
  const handleLogout = () => {
    localStorage.removeItem("token");
    setCurrentUser(null);
    setSimulatedUser(null);
    setActiveCaseId(null);
    setCaseDetails(null);
    setAuthMode("login");
    setAuthError("");
    setAuthSuccess("");
  };

  // Select target case details
  const handleSelectCase = async (caseId: string) => {
    setActiveCaseId(caseId);
    await syncCaseDetails(caseId);
  };

  // Add Participant inside details view
  const handleAddParticipant = async (caseId: string, part: any) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(part)
      });
      if (response.ok) {
        await syncData();
      }
    } catch (err) {
      console.error("Error adding participant:", err);
    }
  };

  // Delete Participant
  const handleDeleteParticipant = async (caseId: string, partId: string) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/participants/${partId}`, {
        method: "DELETE"
      });
      if (response.ok) {
        await syncData();
      }
    } catch (err) {
      console.error("Error deleting participant:", err);
    }
  };

  // Upload document
  const handleUploadDocument = async (caseId: string, reqId: string, fileData: any) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/requirements/${reqId}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fileData)
      });
      if (response.ok) {
        await syncData();
      }
    } catch (err) {
      console.error("Error uploading document:", err);
    }
  };

  // Approve Document
  const handleApproveDocument = async (caseId: string, reqId: string) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/requirements/${reqId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser?.id })
      });
      if (response.ok) {
        await syncData();
      }
    } catch (err) {
      console.error("Error approving document:", err);
    }
  };

  // Reject Document
  const handleRejectDocument = async (caseId: string, reqId: string, reason: string) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/requirements/${reqId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, userId: currentUser?.id })
      });
      if (response.ok) {
        await syncData();
      }
    } catch (err) {
      console.error("Error rejecting document:", err);
    }
  };

  // Toggle requirement download permission for advisor
  const handleToggleDownloadPermission = async (caseId: string, reqId: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/requirements/${reqId}/toggle-download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ downloadEnabled: enabled, userId: currentUser?.id })
      });
      if (response.ok) {
        await syncData();
      }
    } catch (err) {
      console.error("Error toggling download permission:", err);
    }
  };

  // Request upload permission for advisor
  const handleRequestUploadPermission = async (caseId: string, reqId: string, reason?: string) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/requirements/${reqId}/request-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser?.id, reason })
      });
      if (response.ok) {
        await syncData();
      }
    } catch (err) {
      console.error("Error requesting upload permission:", err);
    }
  };

  // Create custom adjustment request (Advisor)
  const handleAddAdjustmentRequest = async (caseId: string, payload: any) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/adjustment-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, userId: currentUser?.id })
      });
      if (response.ok) {
        await syncData();
      }
    } catch (err) {
      console.error("Error creating adjustment request:", err);
    }
  };

  // Approve adjustment request (Manager/Admin)
  const handleApproveAdjustmentRequest = async (caseId: string, reqId: string) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/adjustment-requests/${reqId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser?.id })
      });
      if (response.ok) {
        await syncData();
      }
    } catch (err) {
      console.error("Error approving adjustment request:", err);
    }
  };

  // Reject adjustment request (Manager/Admin)
  const handleRejectAdjustmentRequest = async (caseId: string, reqId: string, rejectionReason: string) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/adjustment-requests/${reqId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser?.id, rejectionReason })
      });
      if (response.ok) {
        await syncData();
      }
    } catch (err) {
      console.error("Error rejecting adjustment request:", err);
    }
  };

  // Configure upload permission limits (manager/admin)
  const handleConfigureUploadPermission = async (caseId: string, reqId: string, config: any) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/requirements/${reqId}/configure-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, userId: currentUser?.id })
      });
      if (response.ok) {
        await syncData();
      }
    } catch (err) {
      console.error("Error configuring upload permission:", err);
    }
  };

  // Form submit requirement complete
  const handleCompleteForm = async (caseId: string, reqId: string, values: any) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/requirements/${reqId}/form`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      if (response.ok) {
        await syncData();
      }
    } catch (err) {
      console.error("Error completing form req:", err);
    }
  };

  // Complete field task toggle checkbox
  const handleToggleTask = async (caseId: string, reqId: string, status: "PENDIENTE" | "COMPLETA") => {
    try {
      const response = await fetch(`/api/cases/${caseId}/requirements/${reqId}/task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, userId: currentUser?.id })
      });
      if (response.ok) {
        await syncData();
      }
    } catch (err) {
      console.error("Error toggling task activity:", err);
    }
  };

  // Create Manual Observation
  const handleAddObservation = async (caseId: string, message: string, entityType: string, entityId: string) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/observations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, entityType, entityId, userId: currentUser?.id })
      });
      if (response.ok) {
        await syncData();
      }
    } catch (err) {
      console.error("Error creating observation:", err);
    }
  };

  // Respond & Resolve active Observation
  const handleResolveObservation = async (caseId: string, obsId: string, responseText: string) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/observations/${obsId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: responseText, userId: currentUser?.id })
      });
      if (response.ok) {
        await syncData();
      }
    } catch (err) {
      console.error("Error resolving observation:", err);
    }
  };

  // Stage advance transition callback
  const handleAdvanceStage = async (caseId: string) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/stage/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser?.id })
      });
      
      const resJson = await response.json();
      await syncData();
      return resJson; // allows CaseDetails to retrieve error details array
    } catch (err) {
      console.error("Error advancing stage:", err);
      return { error: true, message: "Error catastrófico en red." };
    }
  };

  const handleRetrocedeStage = async (caseId: string) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/stage/retrocede`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser?.id })
      });
      if (response.ok) {
        await syncData();
      }
    } catch (err) {
      console.error("Error retroceding stage:", err);
    }
  };

  // Notification Mark read
  const handleMarkNotifRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "POST" });
      await syncData();
    } catch (err) {
      console.error("Failed notification update", err);
    }
  };

  const handleMarkAllNotifsRead = async () => {
    try {
      await fetch(`/api/notifications/read-all`, { method: "POST" });
      await syncData();
    } catch (e) {
      console.error(e);
    }
  };

  // Create process template callback
  const handleCreateTemplate = async (templateObj: any) => {
    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateObj)
      });
      if (response.ok) {
        await syncData();
      }
    } catch (err) {
      console.error("Error creating template:", err);
    }
  };

  // Delete process template
  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("¿Está seguro de eliminar esta plantilla de procesos del catálogo?")) return;
    try {
      const response = await fetch(`/api/templates/${id}`, {
        method: "DELETE"
      });
      if (response.ok) {
        await syncData();
      }
    } catch (err) {
      console.error("Error deleting template:", err);
    }
  };

  // Edit Case parameters (re-save title, desc, advisorId)
  const handleUpdateCaseDetails = async (caseId: string, updatedFields: any) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedFields)
      });
      if (response.ok) {
        await syncData();
      }
    } catch (err) {
      console.error("Failed updating case:", err);
    }
  };

  // Claim Case (Managers Claim Unassigned Case)
  const handleClaimCase = async (caseId: string) => {
    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`/api/cases/${caseId}/claim`, {
        method: "POST",
        headers,
        body: JSON.stringify({ userId: currentUser?.id })
      });
      if (response.ok) {
        await syncData();
      } else {
        const errData = await response.json();
        alert(errData.message || "Error al reclamar expediente.");
      }
    } catch (err) {
      console.error("Failed claiming case:", err);
    }
  };

  // Create new active Legajo Case
  const handleCreateCaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nCaseTitle || !nCaseTplId) {
      alert("Título del expediente y plantilla de procesos obligatorios.");
      return;
    }

    const activeUser = simulatedUser || currentUser;
    const firstAdvisor = availableUsers.find(u => u.role === "ASESOR")?.id || "usr-asesor1";
    const firstManager = availableUsers.find(u => u.role === "MANAGER")?.id || "usr-manager";

    const casePayload = {
      title: nCaseTitle,
      description: nCaseDesc,
      templateId: nCaseTplId,
      advisorId: activeUser?.role === "ASESOR"
        ? activeUser.id 
        : (nCaseAdvId || firstAdvisor),
      managerId: activeUser?.role === "ADMIN"
        ? (nCaseManagerId || firstManager)
        : (activeUser?.role === "MANAGER" ? activeUser.id : (nCaseManagerId || firstManager)),
      stagesDetermined: nCaseStagesDetermined,
      partyCounts: {
        compradores: nCaseCompradores,
        vendedores: nCaseVendedores,
        garantes: nCaseGarantes
      },
      participants: nCasePartName ? [{
        role: nCasePartRole,
        name: nCasePartName,
        apellido: nCasePartSurname,
        dni: nCasePartDni,
      }] : []
    };

    try {
      const response = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(casePayload)
      });

      if (response.ok) {
        if (activeCaseRequestId) {
          try {
            const token = localStorage.getItem("token") || `real-jwt-token-for-${currentUser?.id}`;
            await fetch(`/api/case-requests/${activeCaseRequestId}/resolve`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
              },
              body: JSON.stringify({ status: "CREADO" })
            });
          } catch (resErr) {
            console.error("Failed resolving case request:", resErr);
          }
          setActiveCaseRequestId(null);
        }

        // Reset Creator Form
        setNCaseTitle("");
        setNCaseDesc("");
        setNCasePartName("");
        setNCasePartSurname("");
        setNCasePartDni("");
        setNCaseStagesDetermined(true);
        setShowCaseModal(false);
        await syncData();
      } else {
        const errJson = await response.json();
        alert(errJson.message || "Error al crear el expediente.");
      }
    } catch (err) {
      console.error("Failed creating case:", err);
    }
  };

  const handleOpenCreateCaseModal = (prefilledData?: { title: string; description: string; templateId: string; advisorId: string; requestId?: string; partyCounts?: { compradores: number; vendedores: number; garantes: number } }) => {
    if (prefilledData) {
      setNCaseTitle(prefilledData.title);
      setNCaseDesc(prefilledData.description);
      setNCaseTplId(prefilledData.templateId);
      setNCaseAdvId(prefilledData.advisorId);
      if (prefilledData.partyCounts) {
        setNCaseCompradores(prefilledData.partyCounts.compradores ?? 1);
        setNCaseVendedores(prefilledData.partyCounts.vendedores ?? 1);
        setNCaseGarantes(prefilledData.partyCounts.garantes ?? 0);
      } else {
        setNCaseCompradores(1);
        setNCaseVendedores(1);
        setNCaseGarantes(0);
      }
      if (prefilledData.requestId) {
        setActiveCaseRequestId(prefilledData.requestId);
      } else {
        setActiveCaseRequestId(null);
      }
    } else {
      setNCaseTitle("");
      setNCaseDesc("");
      setNCaseTplId(templates[0]?.id || "");
      setNCaseAdvId("");
      setNCaseCompradores(1);
      setNCaseVendedores(1);
      setNCaseGarantes(0);
      setActiveCaseRequestId(null);
    }
    setShowCaseModal(true);
  };

  const handleRequestCaseSubmit = async (title: string, desc: string, templateId: string, partyCounts?: { compradores: number; vendedores: number; garantes: number }) => {
    try {
      const token = localStorage.getItem("token") || `real-jwt-token-for-${currentUser?.id}`;
      const response = await fetch("/api/case-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          title,
          description: desc,
          templateId,
          partyCounts
        })
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.message || "Error al enviar la solicitud.");
      }

      await syncData();
    } catch (err: any) {
      alert(err.message || "Error de conexión al enviar la solicitud.");
    }
  };

  // Filter cases matrix based on SEARCH and FILTER options
  const getFilteredCases = () => {
    // 3 structural levels of case visibility:
    let baseCases = cases;
    if (currentUser?.role === "MANAGER") {
      baseCases = cases.filter(c => c.managerId === currentUser.id || (c.advisorId && c.advisorId !== ""));
    } else if (currentUser?.role === "ASESOR") {
      baseCases = cases.filter(c => c.advisorId === currentUser.id);
    } // ADMIN views all

    return baseCases.filter((c) => {
      // 1. Search term
      const matchesSearch = 
        c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.description.toLowerCase().includes(searchTerm.toLowerCase());

      // 2. Folder status filter
      let matchesFilter = true;
      if (filterStatus === "MIS_ASIGNADOS") {
        matchesFilter = c.advisorId === currentUser?.id;
      } else if (filterStatus === "ACTIVO") {
        matchesFilter = c.status === "ACTIVO" || c.status === "PENDIENTE";
      } else if (filterStatus !== "TODOS") {
        matchesFilter = c.status === filterStatus;
      }

      return matchesSearch && matchesFilter;
    });
  };

  const filteredCasesList = getFilteredCases();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-550 font-sans">
        <div className="text-center space-y-4">
          <div className="h-10 w-10 border-4 border-slate-950 border-t-transparent rounded-full animate-spin mx-auto" />
          <h3 className="font-display font-medium text-slate-800 text-sm">Orquestando Expedientes Generales...</h3>
          <p className="text-xs text-slate-400 font-mono">Cargando base de datos segura y configuraciones...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-slate-50 font-sans text-slate-800">
        {/* Left branding panel */}
        <div className="lg:col-span-5 bg-slate-950 text-white p-8 sm:p-12 flex flex-col items-center justify-center text-center relative overflow-hidden min-h-[350px] lg:min-h-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black opacity-80" />
          
          <div className="relative z-10 space-y-4 max-w-sm sm:max-w-md mx-auto flex flex-col items-center justify-center">
            <div className="flex items-center gap-2.5 justify-center">
              <Layers className="h-6 w-6 text-teal-400" />
              <span className="text-xs font-mono font-bold tracking-widest text-teal-400 uppercase">
                {getText("login.title", "Gestor de Legajos")}
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-display font-light tracking-tight mt-6 text-white leading-tight">
              {getText("login.subtitle", "Plataforma de Expedientes, Documentos y Procesos")}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-sm mt-3">
              {getText("login.welcome", "Inicie sesión o regístrese como Asesor de legajos para coordinar y verificar requisitos de forma fluida.")}
            </p>
          </div>

        </div>

        {/* Right authentication panel */}
        <div className="lg:col-span-7 flex items-center justify-center p-6 md:p-12">
          <div className="w-full max-w-md bg-white border border-slate-200 p-8 rounded-2xl shadow-xl space-y-6">
            
            {/* Header / Brand info */}
            <div className="flex flex-col items-center text-center justify-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded inline-block">
                Se Requiere Acceso Verificado
              </span>
              <h2 className="text-xl font-display font-semibold text-slate-950 mt-3">
                {authMode === "login" 
                  ? "Identificarse en el Sistema" 
                  : authMode === "register" 
                  ? "Registro de Nuevo Asesor" 
                  : "Verificar Código de Seguridad"}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {authMode === "login"
                  ? "Ingrese sus credenciales para iniciar sesión."
                  : authMode === "register"
                  ? "Registre su cuenta para ser evaluado y confirmado por la dirección."
                  : "Por favor confirme la acreditación de su contacto."}
              </p>
            </div>

            {/* Error & Success banner displays */}
            {authError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-lg">
                ⚠ {authError}
              </div>
            )}
            {authSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-205 text-emerald-800 text-xs font-semibold rounded-lg">
                ✓ {authSuccess}
              </div>
            )}

            {/* LoginForm */}
            {authMode === "login" && (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    {getText("login.emailLabel", "Correo Electrónico")}
                  </label>
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="ej. asesor@test.com"
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-800 font-medium font-sans"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    {getText("login.passwordLabel", "Contraseña")}
                  </label>
                  <div className="relative">
                    <input
                      type={showLoginPassword ? "text" : "password"}
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Contraseña segura"
                      className="w-full text-xs p-3 pr-10 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-800 font-medium font-sans"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                    >
                      {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-slate-950 hover:bg-slate-900 disabled:bg-slate-400 text-white font-bold text-xs py-3 rounded-xl transition-all cursor-pointer shadow-md shadow-slate-955/10"
                >
                  {authLoading ? "Verificando accesos..." : getText("login.button", "Iniciar Sesión")}
                </button>

                <div className="text-center pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-505 text-slate-500">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode("register");
                        setAuthError("");
                        setAuthSuccess("");
                      }}
                      className="text-teal-600 hover:underline font-bold"
                    >
                      {getText("login.registerPrompt", "¿Es un asesor nuevo? Regístrese aquí")}
                    </button>
                  </p>
                </div>
              </form>
            )}

            {/* RegisterForm */}
            {authMode === "register" && (
              <form onSubmit={handleRegisterAdvisorSubmit} className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Nombre Completo
                  </label>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="ej. Gabriel Benítez"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-800 font-medium font-sans"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="ej. Gabriel@test.com"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-800 font-medium font-sans"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Número de Celular (con código de país)
                  </label>
                  <input
                    type="text"
                    required
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    onFocus={() => {
                      if (!regPhone) {
                        setRegPhone("+54");
                      }
                    }}
                    onClick={() => {
                      if (!regPhone) {
                        setRegPhone("+54");
                      }
                    }}
                    placeholder="ej. +541122223333"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-800 font-medium font-sans"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Defina su Contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={showRegPassword ? "text" : "password"}
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Defina clave segura"
                      className="w-full text-xs p-2.5 pr-10 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-800 font-medium font-sans"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                    >
                      {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-slate-950 hover:bg-slate-900 disabled:bg-slate-400 text-white font-bold text-xs py-3 rounded-xl transition-all cursor-pointer mt-2"
                >
                  {authLoading ? "Procesando registro..." : "Enviar Código y Registrarse"}
                </button>

                <div className="text-center pt-3 border-t border-slate-100">
                  <p className="text-xs text-slate-500">
                    ¿Ya tiene una cuenta de asesor?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode("login");
                        setAuthError("");
                        setAuthSuccess("");
                      }}
                      className="text-teal-600 hover:underline font-bold"
                    >
                      Identifíquese aquí
                    </button>
                  </p>
                </div>
              </form>
            )}

            {/* Token Verification Form */}
            {authMode === "verify" && (
              <form onSubmit={handleVerifyTokenSubmit} className="space-y-4">
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs text-slate-600 leading-normal">
                  Hemos enviado un token de seguridad rústico de 16 caracteres compuesto por letras mayúsculas, minúsculas, números y símbolos para validar su titularidad. Ingréselo exactamente a continuación.
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Token Verificador de 16 Caracteres
                  </label>
                  <input
                    type="text"
                    required
                    value={verificationToken}
                    onChange={(e) => setVerificationToken(e.target.value)}
                    placeholder="Código de 16 caracteres"
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 font-mono text-center tracking-widest focus:outline-none focus:border-slate-900 text-slate-900 bg-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-bold text-xs py-3 rounded-xl transition-all cursor-pointer"
                >
                  {authLoading ? "Validando Token..." : "Confirmar Mi Contacto"}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("login");
                      setAuthError("");
                      setAuthSuccess("");
                      setVerificationToken("");
                    }}
                    className="text-xs text-slate-505 text-slate-500 hover:underline"
                  >
                    Regresar al Inicio de Sesión
                  </button>
                </div>
              </form>
            )}



          </div>
        </div>
      </div>
    );
  }

  const renderSidebarContent = () => {
    const unreadMessagesCount = messages.filter(m => !m.read && m.recipientId === currentUser?.id && !m.recipientTrash && !m.recipientDeleted).length;
    
    const visibleNotifs = notifications.filter(n => {
      if (n.archived) return false;
      if (currentUser?.role === "ADMIN") return true;
      if (currentUser?.role === "MANAGER") {
        if (n.userId === currentUser.id) return true;
        const targetUser = availableUsers.find((u) => u.id === n.userId);
        return targetUser && targetUser.role === "ASESOR";
      }
      return n.userId === currentUser?.id;
    });
    const unreadNotifsCount = visibleNotifs.filter(n => !n.read).length;

    return (
      <div className={`flex-1 overflow-y-auto p-4 ${sidebarCollapsed ? "space-y-4 px-2" : "space-y-2"}`}>
        {!sidebarCollapsed && (
          <div className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider px-3 mb-2">
            Navegación
          </div>
        )}

        {/* 1. Expedientes Generales */}
        <button
          onClick={() => {
            setActiveTab("cases");
            setActiveCaseId(null);
            setMobileSidebarOpen(false);
          }}
          className={`w-full flex items-center ${sidebarCollapsed ? "justify-center px-0" : "gap-3 px-4"} rounded-xl py-3 text-xs font-bold transition-all cursor-pointer ${
            activeTab === "cases"
              ? "bg-slate-950 text-white shadow-md shadow-slate-950/10"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
          title={sidebarCollapsed ? "Expedientes Generales" : undefined}
        >
          <FolderOpen className="h-4.5 w-4.5 shrink-0" />
          {!sidebarCollapsed && <span>Expedientes Generales</span>}
        </button>

        {/* Mensajes */}
        <button
          onClick={() => {
            setActiveTab("messages");
            setActiveCaseId(null);
            setMobileSidebarOpen(false);
          }}
          className={`w-full flex items-center justify-between ${sidebarCollapsed ? "justify-center px-0" : "gap-3 px-4"} rounded-xl py-3 text-xs font-bold transition-all cursor-pointer relative ${
            activeTab === "messages"
              ? "bg-slate-950 text-white shadow-md shadow-slate-950/10"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
          title={sidebarCollapsed ? "Mensajes" : undefined}
        >
          <div className="flex items-center gap-3">
            <Mail className="h-4.5 w-4.5 shrink-0" />
            {!sidebarCollapsed && <span>Mensajes</span>}
          </div>
          {!sidebarCollapsed && unreadMessagesCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
              {unreadMessagesCount}
            </span>
          )}
          {sidebarCollapsed && unreadMessagesCount > 0 && (
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          )}
        </button>

        {/* Notificaciones */}
        <button
          onClick={() => {
            setActiveTab("notifications");
            setActiveCaseId(null);
            setMobileSidebarOpen(false);
          }}
          className={`w-full flex items-center justify-between ${sidebarCollapsed ? "justify-center px-0" : "gap-3 px-4"} rounded-xl py-3 text-xs font-bold transition-all cursor-pointer relative ${
            activeTab === "notifications"
              ? "bg-slate-950 text-white shadow-md shadow-slate-950/10"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
          title={sidebarCollapsed ? "Notificaciones" : undefined}
        >
          <div className="flex items-center gap-3">
            <Bell className="h-4.5 w-4.5 shrink-0" />
            {!sidebarCollapsed && <span>Notificaciones</span>}
          </div>
          {!sidebarCollapsed && unreadNotifsCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
              {unreadNotifsCount}
            </span>
          )}
          {sidebarCollapsed && unreadNotifsCount > 0 && (
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          )}
        </button>

      {/* 2. Plantillas de Proceso */}
      {currentUser.role !== "ASESOR" && (
        <button
          onClick={() => {
            setActiveTab("templates");
            setForcedSubTab("templates");
            setActiveCaseId(null);
            setMobileSidebarOpen(false);
          }}
          className={`w-full flex items-center ${sidebarCollapsed ? "justify-center px-0" : "gap-3 px-4"} rounded-xl py-3 text-xs font-bold transition-all cursor-pointer ${
            activeTab === "templates" && forcedSubTab === "templates"
              ? "bg-slate-950 text-white shadow-md shadow-slate-950/10"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
          title={sidebarCollapsed ? "Plantillas de Proceso" : undefined}
        >
          <ClipboardList className="h-4.5 w-4.5 shrink-0" />
          {!sidebarCollapsed && <span>Plantillas de Proceso</span>}
        </button>
      )}

      {/* 3. Auditoría */}
      {currentUser.role !== "ASESOR" && (
        <button
          onClick={() => {
            setActiveTab("templates");
            setForcedSubTab("stats");
            setActiveCaseId(null);
            setMobileSidebarOpen(false);
          }}
          className={`w-full flex items-center ${sidebarCollapsed ? "justify-center px-0" : "gap-3 px-4"} rounded-xl py-3 text-xs font-bold transition-all cursor-pointer ${
            activeTab === "templates" && (forcedSubTab === "stats" || forcedSubTab === "audit")
              ? "bg-slate-950 text-white shadow-md shadow-slate-950/10"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
          title={sidebarCollapsed ? "Auditoría" : undefined}
        >
          <div className="relative shrink-0 flex items-center justify-center">
            <History className="h-4.5 w-4.5" />
            {sidebarCollapsed && hasNewUnseenApprovals && (
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
          </div>
          {!sidebarCollapsed && (
            <div className="flex items-center justify-between w-full">
              <span>Auditoría</span>
              {hasNewUnseenApprovals && (
                <span className="relative flex h-2 w-2 ml-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              )}
            </div>
          )}
        </button>
      )}

      {/* 4. Aprobaciones de Cuentas */}
      {(currentUser?.role === "ADMIN" || currentUser?.role === "MANAGER") && (
        <button
          onClick={() => {
            setActiveTab("templates");
            setForcedSubTab("admin_users");
            setActiveCaseId(null);
            setMobileSidebarOpen(false);
          }}
          className={`w-full flex items-center ${sidebarCollapsed ? "justify-center px-0" : "gap-3 px-4"} rounded-xl py-3 text-xs font-bold transition-all cursor-pointer ${
            activeTab === "templates" && forcedSubTab === "admin_users"
              ? "bg-slate-950 text-white shadow-md shadow-slate-950/10"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
          title={sidebarCollapsed ? "Aprobaciones" : undefined}
        >
          <ShieldCheck className="h-4.5 w-4.5 shrink-0" />
          {!sidebarCollapsed && <span>Aprobaciones</span>}
        </button>
      )}

      {/* 5. Configuración General */}
      {currentUser?.role === "ADMIN" && (
        <button
          onClick={() => {
            setActiveTab("templates");
            setForcedSubTab("configuracion");
            setActiveCaseId(null);
            setMobileSidebarOpen(false);
          }}
          className={`w-full flex items-center ${sidebarCollapsed ? "justify-center px-0" : "gap-3 px-4"} rounded-xl py-3 text-xs font-bold transition-all cursor-pointer ${
            activeTab === "templates" && forcedSubTab === "configuracion"
              ? "bg-slate-950 text-white shadow-md shadow-slate-950/10"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
          title={sidebarCollapsed ? "Configuración" : undefined}
        >
          <Settings className="h-4.5 w-4.5 shrink-0" />
          {!sidebarCollapsed && <span>Configuración</span>}
        </button>
      )}

      {/* 6. Personalizar Textos (Solo para ADMIN / Director General) */}
      {currentUser?.role === "ADMIN" && (
        <button
          onClick={() => {
            setActiveTab("templates");
            setForcedSubTab("textos");
            setActiveCaseId(null);
            setMobileSidebarOpen(false);
          }}
          className={`w-full flex items-center ${sidebarCollapsed ? "justify-center px-0" : "gap-3 px-4"} rounded-xl py-3 text-xs font-bold transition-all cursor-pointer ${
            activeTab === "templates" && forcedSubTab === "textos"
              ? "bg-slate-950 text-white shadow-md shadow-slate-950/10"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
          title={sidebarCollapsed ? "Textos" : undefined}
        >
          <FileText className="h-4.5 w-4.5 text-indigo-500 shrink-0" />
          {!sidebarCollapsed && <span>Textos</span>}
        </button>
      )}

      {/* Dynamic Custom Tabs */}
      {customTabs && customTabs.length > 0 && (
        <>
          {!sidebarCollapsed && (
            <div className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider px-3 mt-4 mb-2">
              Solapas Personalizadas
            </div>
          )}
          {customTabs.map((tab) => {
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(`custom_tab_${tab.id}`);
                  setActiveCaseId(null);
                  setMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center ${sidebarCollapsed ? "justify-center px-0" : "gap-3 px-4"} rounded-xl py-3 text-xs font-bold transition-all cursor-pointer ${
                  activeTab === `custom_tab_${tab.id}`
                    ? "bg-slate-950 text-white shadow-md shadow-slate-950/10"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
                title={sidebarCollapsed ? tab.name : undefined}
              >
                <div className="shrink-0">
                  {tab.icon === "Layers" ? <Layers className="h-4.5 w-4.5" /> :
                   tab.icon === "ClipboardList" ? <ClipboardList className="h-4.5 w-4.5" /> :
                   tab.icon === "ShieldCheck" ? <ShieldCheck className="h-4.5 w-4.5" /> :
                   <Layers className="h-4.5 w-4.5" /> /* Fallback */}
                </div>
                {!sidebarCollapsed && <span>{tab.name}</span>}
              </button>
            );
          })}
        </>
      )}
    </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col">
      
      {/* Navigation Top Header */}
      <Navbar
        currentUser={currentUser}
        onLogout={handleLogout}
        notifications={notifications}
        onMarkRead={handleMarkNotifRead}
        onMarkAllRead={handleMarkAllNotifsRead}
        currentTab={activeTab}
        onChangeTab={(tab) => {
          setActiveTab(tab);
          setActiveCaseId(null); // return to lists if tabs clicked
        }}
        commercialFocus={commercialFocus}
        onOpenProfile={() => setProfileModalOpen(true)}
        onToggleMobileSidebar={() => setMobileSidebarOpen(p => !p)}
        hasNewUnseenApprovals={hasNewUnseenApprovals}
      />

      {/* Main Container: Sidebar + Content */}
      <div className="flex flex-1 relative overflow-hidden">
        
        {/* Mobile Sidebar Overlay */}
        {mobileSidebarOpen && (
          <div 
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        {/* Mobile Sidebar Content */}
        <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white flex flex-col border-r border-slate-200 transform transition-transform duration-300 ease-in-out md:hidden ${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}>
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <span className="font-display font-bold text-sm text-slate-950">Menú de Navegación</span>
            <button onClick={() => setMobileSidebarOpen(false)} className="p-1 rounded text-slate-500 hover:bg-slate-100 cursor-pointer">
              <X className="h-5 w-5" />
            </button>
          </div>
          {renderSidebarContent()}
          <div className="p-4 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400 font-mono">
            <div>Rol: <span className="font-bold text-slate-600">{currentUser.role}</span></div>
            <div className="mt-1">Identificado como:</div>
            <div className="font-bold text-slate-700 truncate">{currentUser.name}</div>
          </div>
        </aside>

        {/* Desktop Left Sidebar */}
        <aside className={`${sidebarCollapsed ? "w-16" : "w-64"} bg-white border-r border-slate-200 hidden md:flex flex-col flex-shrink-0 transition-all duration-300 relative`}>
          {/* Collapse Toggle Button */}
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="absolute -right-3.5 top-10 z-30 bg-white border border-slate-200 rounded-full p-1 text-slate-500 hover:text-slate-800 shadow-md cursor-pointer hover:bg-slate-50 flex items-center justify-center h-7 w-7 focus:outline-none"
            title={sidebarCollapsed ? "Expandir menú" : "Colapsar menú"}
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>

          {renderSidebarContent()}
          
          {!sidebarCollapsed && (
            <div className="p-4 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400 font-mono">
              <div>Rol: <span className="font-bold text-slate-600">{currentUser.role}</span></div>
              <div className="mt-1">Identificado como:</div>
              <div className="font-bold text-slate-700 truncate">{currentUser.name}</div>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="p-4 border-t border-slate-100 bg-slate-50 text-center text-[10px] text-slate-400 font-mono truncate" title={`Rol: ${currentUser.role}\nIdentificado como: ${currentUser.name}`}>
              <span className="font-bold">{currentUser.role.slice(0, 3)}</span>
            </div>
          )}
        </aside>

        {/* Workspace Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">

        {/* Focused Case Legajo Detail Workspace */}
        {activeCaseId ? (
          <CaseDetails
            commercialFocus={commercialFocus}
            currentUser={currentUser}
            activeCaseId={activeCaseId}
            onBack={() => {
              setActiveCaseId(null);
              setCaseDetails(null);
              syncData();
            }}
            caseDetails={caseDetails}
            onAddParticipant={handleAddParticipant}
            onDeleteParticipant={handleDeleteParticipant}
            onUploadDocument={handleUploadDocument}
            onApproveDocument={handleApproveDocument}
            onRejectDocument={handleRejectDocument}
            onCompleteForm={handleCompleteForm}
            onToggleTask={handleToggleTask}
            onAddObservation={handleAddObservation}
            onResolveObservation={handleResolveObservation}
            onAdvanceStage={handleAdvanceStage}
            onRetrocedeStage={handleRetrocedeStage}
            allUsers={availableUsers}
            onUpdateCaseDetails={handleUpdateCaseDetails}
            onClaimCase={handleClaimCase}
            onToggleDownloadPermission={handleToggleDownloadPermission}
            onRequestUploadPermission={handleRequestUploadPermission}
            onConfigureUploadPermission={handleConfigureUploadPermission}
            onAddAdjustmentRequest={handleAddAdjustmentRequest}
            onApproveAdjustmentRequest={handleApproveAdjustmentRequest}
            onRejectAdjustmentRequest={handleRejectAdjustmentRequest}
          />
        ) : (
          activeTab === "messages" ? (
            <MessagesView
              currentUser={currentUser}
              availableUsers={availableUsers}
              onRefreshGlobalData={syncData}
            />
          ) : activeTab === "notifications" ? (
            <NotificationsView
              currentUser={currentUser}
              notifications={notifications}
              onRefreshNotifications={syncData}
            />
          ) : activeTab.startsWith("custom_tab_") ? (
            (() => {
              const tabId = activeTab.replace("custom_tab_", "");
              const currentTab = customTabs.find((t) => t.id === tabId);
              if (!currentTab) return <div className="text-xs text-slate-500">Solapa no encontrada o eliminada.</div>;
              return (
                <CustomTabContent
                  tab={currentTab}
                  currentUser={currentUser}
                  onRefresh={syncData}
                />
              );
            })()
          ) : activeTab === "cases" ? (
            <div className="space-y-6">

              {/* Show role specific advisor welcome card if Advisor logged in */}
              {currentUser.role === "ASESOR" && (
                <AdvisorDashboard
                  currentUser={currentUser}
                  cases={cases}
                  onSelectCase={handleSelectCase}
                  onRefreshDashboard={syncData}
                  commercialFocus={commercialFocus}
                  publicSettings={publicSettings}
                  stats={stats}
                  allAdvisors={availableUsers.filter(u => u.role === "ASESOR")}
                  onOpenCreateModal={() => {
                    const activeId = (simulatedUser || currentUser)?.id;
                    setNCaseAdvId(activeId || "");
                    setShowCaseModal(true);
                  }}
                  templates={templates}
                  caseRequests={caseRequests}
                  onRequestCaseSubmit={handleRequestCaseSubmit}
                />
              )}

              {/* Show KPI and visual statistics if Manager / Admin logged in */}
              {currentUser.role !== "ASESOR" && stats && (
                <div className="space-y-6">
                  {/* General Manager Banner */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white border border-slate-200 rounded-xl p-6 text-slate-900 shadow-xs gap-4 animate-in fade-in duration-300">
                    <div>
                      <span className="text-[9px] uppercase font-semibold text-slate-500 font-mono tracking-widest bg-slate-50 border border-slate-150 px-2 py-0.5 rounded">
                        Gestión General
                      </span>
                      <h2 className="text-lg font-display font-medium text-slate-950 tracking-tight mt-3">
                        Bienvenido, Director {currentUser.name}
                      </h2>
                      <p className="text-xs text-slate-505 text-slate-500 max-w-lg mt-1.5 leading-relaxed">
                        Administre legajos corporativos en tiempo real, habilite firmas de escrituras e instrumente flujos basados en plantillas inmutables.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2.5">
                      <button
                        id="btn-open-create-case"
                        onClick={() => setShowCaseModal(true)}
                        className="bg-slate-950 hover:bg-slate-905 hover:bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-lg inline-flex items-center gap-1.5 cursor-pointer transition-all"
                      >
                        <Plus className="h-4 w-4" />
                        {getText("btn.aperturarExpediente", "Aperturar Expediente")}
                      </button>
                    </div>
                  </div>

                  {/* High Level Metrics Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white border border-slate-150 p-4.5 rounded-xl flex items-center gap-3">
                      <div className="bg-slate-50 border border-slate-200 text-slate-600 p-2 rounded-lg"><Layers className="h-4.5 w-4.5" /></div>
                      <div>
                        <p className="text-[9px] uppercase font-semibold tracking-wider text-slate-400 font-mono">Total Expedientes</p>
                        <p className="text-base font-bold font-display text-slate-900 mt-0.5">{stats.total}</p>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-150 p-4.5 rounded-xl flex items-center gap-3">
                      <div className="bg-slate-50 border border-slate-200 text-slate-600 p-2 rounded-lg"><UserCheck className="h-4.5 w-4.5" /></div>
                      <div>
                        <p className="text-[9px] uppercase font-semibold tracking-wider text-slate-400 font-mono">Cerrados / Listos</p>
                        <p className="text-base font-bold font-display text-slate-900 mt-0.5">{stats.finished}</p>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-150 p-4.5 rounded-xl flex items-center gap-3">
                      <div className="bg-slate-50 border border-slate-200 text-slate-650 p-2 rounded-lg"><AlertCircle className="h-4.5 w-4.5" /></div>
                      <div>
                        <p className="text-[9px] uppercase font-semibold tracking-wider text-slate-400 font-mono">Con Observaciones</p>
                        <p className="text-base font-bold font-display text-amber-700 mt-0.5">{stats.observed}</p>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-150 p-4.5 rounded-xl flex items-center gap-3">
                      <div className="bg-slate-50 border border-slate-200 text-slate-605 text-slate-600 p-2 rounded-lg"><Clock className="h-4.5 w-4.5" /></div>
                      <div>
                        <p className="text-[9px] uppercase font-semibold tracking-wider text-slate-400 font-mono">Activos en Curso</p>
                        <p className="text-base font-bold font-display text-indigo-700 mt-0.5">{stats.active}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Search, Filter Toolbar & Explorer Grid & List */}
              <div className="space-y-4">
                
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3 border border-slate-150 rounded-xl shadow-xs">
                  {/* Search query input */}
                  <div className="relative flex-1">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <Search className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="Buscar por código, título, comprador o detalles..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 bg-white text-slate-900 rounded-lg focus:outline-none focus:border-slate-800"
                    />
                  </div>

                  {/* Directory / Status Filters */}
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] font-bold text-slate-400 font-mono mr-1.5 uppercase hidden sm:inline tracking-wider">Carpetas:</span>
                    {[
                      { key: "TODOS", label: "Todos" },
                      { key: "ACTIVO", label: "Activos" },
                      { key: "OBSERVADO", label: "Observados 🛑" },
                      { key: "FINALIZADO", label: "Finalizados ✓" },
                      { key: "MIS_ASIGNADOS", label: "Mis Asignaciones" }
                    ].map((f) => (
                      <button
                        key={f.key}
                        onClick={() => setFilterStatus(f.key)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                          filterStatus === f.key
                            ? "bg-slate-950 text-white"
                            : "bg-slate-50 text-slate-650 hover:bg-slate-100"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grid list of records */}
                {filteredCasesList.length === 0 ? (
                  <div className="py-20 text-center bg-white border border-slate-150 rounded-xl">
                    <FolderOpen className="h-10 w-10 text-slate-300 stroke-1 mx-auto" />
                    <p className="text-xs font-bold text-slate-800 mt-4">Sin legajos coincidentes</p>
                    <p className="text-xs text-slate-400 mt-1">Modifique los filtros o los términos de búsqueda en el buscador.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredCasesList.map((c) => {
                      const badgeColors = c.status === "OBSERVADO" 
                        ? "bg-amber-50 text-amber-800 border-amber-200/80 animate-pulse" 
                        : c.status === "FINALIZADO"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200/80 font-bold"
                        : c.status === "PENDIENTE"
                        ? "bg-slate-100 text-slate-800 border-slate-200/85"
                        : "bg-indigo-50 text-indigo-800 border-indigo-200/80";

                      const progressPercent = c.progress.total > 0 
                        ? Math.round((c.progress.currentIdx / c.progress.total) * 100) 
                        : 0;

                      return (
                        <div
                          key={c.id}
                          id={`case-card-${c.id}`}
                          onClick={() => handleSelectCase(c.id)}
                          className="bg-white border border-slate-150 rounded-2xl p-6 hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between cursor-pointer group animate-fade-in relative overflow-hidden"
                        >
                          <div>
                            {/* Card Header metadata */}
                            <div className="flex justify-between items-center whitespace-nowrap">
                              <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider">{c.code}</span>
                              <span className={`text-[9px] font-bold font-mono border rounded-md px-2 py-0.5 uppercase tracking-wide ${badgeColors}`}>
                                {c.status}
                              </span>
                            </div>

                            <h3 className="font-display font-semibold text-slate-900 text-base mt-4 group-hover:text-indigo-650 transition-colors leading-snug">
                              {c.title}
                            </h3>
                            <p className="text-[9px] text-slate-450 mt-1 uppercase tracking-wider font-bold font-mono">
                              Procedimiento: {c.templateName}
                            </p>
                            
                            <p className="text-slate-500 text-xs mt-3 line-clamp-2 leading-relaxed">
                              {c.description}
                            </p>

                            {/* Stepper position tracker */}
                            <div className="mt-5 p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
                              <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 font-mono uppercase tracking-wider">
                                <span>Etapa del Proceso</span>
                                <span>
                                  {c.progress.total > 0 
                                    ? `${c.progress.currentIdx}/${c.progress.total}` 
                                    : `etapa ${c.progress.currentIdx} / a determinar`}
                                </span>
                              </div>
                              <p className="text-slate-800 font-bold uppercase tracking-wide text-xs truncate">
                                {c.progress.currentName}
                              </p>
                              {/* Simple visual progress bar */}
                              {c.progress.total > 0 && (
                                <div className="w-full bg-slate-200/60 h-1 rounded-full overflow-hidden mt-1.5">
                                  <div className="bg-indigo-600 h-full rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Footer line details, observers, assignments */}
                          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                            <div className="flex gap-2">
                              {c.advisor && (
                                <div className="flex items-center gap-2">
                                  <img
                                    src={c.advisor.avatarUrl || `https://ui-avatars.com/api/?name=${c.advisor.name}`}
                                    alt={c.advisor.name}
                                    className="h-6 w-6 rounded-lg object-cover border border-slate-150"
                                    referrerPolicy="no-referrer"
                                  />
                                  <span className="text-[11px] text-slate-600 truncate max-w-[90px] font-semibold">{c.advisor.name}</span>
                                </div>
                              )}
                            </div>

                            <div className="flex gap-1.5 items-center">
                              {c.openObservationsCount > 0 && (
                                <span className="text-[9px] font-bold text-amber-700 bg-amber-50 rounded-md px-2 py-0.5 border border-amber-200">
                                  {c.openObservationsCount} obs
                                </span>
                              )}
                              
                              {c.pendingRequirementsCount > 0 ? (
                                <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 rounded-md px-2 py-0.5 border border-indigo-200">
                                  {c.pendingRequirementsCount} pdte
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 rounded-md px-2 py-0.5 border border-emerald-200">
                                  Al día ✓
                                </span>
                              )}
                            </div>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>



            </div>
          ) : (
            /* Templates manager and audit reports dashboard tab */
            <ManagerDashboard
              currentUser={currentUser}
              templates={templates}
              onCreateTemplate={handleCreateTemplate}
              onDeleteTemplate={handleDeleteTemplate}
              auditLogs={auditLogs}
              onRefreshDashboard={syncData}
              stats={stats}
              cases={cases}
              commercialFocus={commercialFocus}
              forcedTab={forcedSubTab}
              caseRequests={caseRequests}
              onOpenCreateCaseModal={handleOpenCreateCaseModal}
            />
          )
        )}

        {/* Profile Modal Overlay */}
        <ProfileModal
          isOpen={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          currentUser={currentUser}
          token={localStorage.getItem("token") || ""}
          onRefreshUser={async () => {
            await checkStoredSession();
            await syncData();
          }}
          commercialFocus={commercialFocus}
          onLogout={handleLogout}
        />

        {/* CREATE CASE MODAL OVERLAY (MANAGER/ASESOR ACCESSIBLE TOP LEVEL) */}
        {showCaseModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
            <form onSubmit={handleCreateCaseSubmit} className="bg-white border text-slate-905 border-slate-200 rounded-3xl p-6 w-full max-w-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
              <h3 className="font-display font-bold text-base text-slate-950 mb-1">{getText("title.aperturarNuevoExpediente", "Aperturar Nuevo Expediente")}</h3>
              <p className="text-xs text-slate-500 mb-5">
                Asigne una plantilla de proceso e inicie la verificación documental y tareas para el asesoramiento.
              </p>

              <div className="space-y-4">
                
                {/* Title & Template choices */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Título comercial del legajo</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Fideicomiso Torres de Belgrano"
                      value={nCaseTitle}
                      onChange={(e) => setNCaseTitle(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white text-slate-900 focus:outline-hidden focus:border-slate-800"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Plantilla de Flujo Operativo</label>
                    <select
                      required
                      value={nCaseTplId}
                      onChange={(e) => setNCaseTplId(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white text-slate-900 focus:outline-hidden focus:border-slate-800"
                    >
                      {templates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Advisor Assignment & Client name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Cuerpo o Notas del Expediente</label>
                    <input
                      type="text"
                      placeholder="Resumen ejecutivo..."
                      value={nCaseDesc}
                      onChange={(e) => setNCaseDesc(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white text-slate-900 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Asesor Asignado Auxiliar</label>
                    {currentUser.role === "ASESOR" ? (
                      <input
                        type="text"
                        disabled
                        value={`${(simulatedUser || currentUser)?.name || currentUser.name} (Tú)`}
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-slate-50 text-slate-500 focus:outline-hidden"
                      />
                    ) : (
                      <select
                        value={nCaseAdvId}
                        onChange={(e) => setNCaseAdvId(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white text-slate-900"
                      >
                        <option value="">Asignar asesor por defecto...</option>
                        {availableUsers.filter(u => u.role === "ASESOR").map(u => (
                          <option key={u.id} value={u.id}>{u.name} (Asesor)</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Control de Flujo de Etapas */}
                <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                  <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">Control del Flujo de Etapas</label>
                  <select
                    value={nCaseStagesDetermined ? "fixed" : "dynamic"}
                    onChange={(e) => setNCaseStagesDetermined(e.target.value === "fixed")}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white text-slate-900 focus:outline-hidden font-semibold"
                  >
                    <option value="fixed">Establecer total de etapas de inicio (Ej: "total 4 etapas")</option>
                    <option value="dynamic">Determinar etapas sobre la marcha / Dinámico (Ej: "a determinar")</option>
                  </select>
                  <p className="text-[10px] text-slate-450 mt-1">
                    En modo "Establecer de inicio", el asesor visualiza el número total de etapas. En modo "Sobre la marcha", figurará como "a determinar" para el asesor, y el manager podrá ir añadiendo o editando etapas a medida que se completa el proceso.
                  </p>
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
                        value={nCaseCompradores}
                        onChange={(e) => setNCaseCompradores(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full border border-slate-200 rounded p-1 text-xs bg-white text-slate-900 font-medium"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-600 block mb-1">Vendedores</label>
                      <input
                        type="number"
                        min="0"
                        value={nCaseVendedores}
                        onChange={(e) => setNCaseVendedores(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full border border-slate-200 rounded p-1 text-xs bg-white text-slate-900 font-medium"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-600 block mb-1">Garantes</label>
                      <input
                        type="number"
                        min="0"
                        value={nCaseGarantes}
                        onChange={(e) => setNCaseGarantes(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full border border-slate-200 rounded p-1 text-xs bg-white text-slate-900 font-medium"
                      />
                    </div>
                  </div>
                </div>

                {/* Participant Pre-fill */}
                <div className="pt-4 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-450 uppercase mb-3">Registrar Primer Participante (Opcional)</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-550 block mb-1">Rol</label>
                      <select
                        value={nCasePartRole}
                        onChange={(e) => setNCasePartRole(e.target.value)}
                        className="w-full border border-slate-200 rounded p-1 text-xs bg-white text-slate-900"
                      >
                        <option value="Cliente">Cliente</option>
                        <option value="Comprador">Comprador</option>
                        <option value="Vendedor">Vendedor</option>
                        <option value="Garante">Garante</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold text-slate-550 block mb-1">Nombre</label>
                      <input
                        type="text"
                        value={nCasePartName}
                        onChange={(e) => setNCasePartName(e.target.value)}
                        className="w-full border border-slate-200 rounded p-1 text-xs bg-white text-slate-900"
                        placeholder="Ej: Sofía"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold text-slate-550 block mb-1">Apellido</label>
                      <input
                        type="text"
                        value={nCasePartSurname}
                        onChange={(e) => setNCasePartSurname(e.target.value)}
                        className="w-full border border-slate-200 rounded p-1 text-xs bg-white text-slate-900"
                        placeholder="Ej: Ruiz"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold text-slate-550 block mb-1">DNI</label>
                      <input
                        type="text"
                        value={nCasePartDni}
                        onChange={(e) => setNCasePartDni(e.target.value)}
                        className="w-full border border-slate-200 rounded p-1 text-xs bg-white text-slate-900"
                        placeholder="Ej: 34123456"
                      />
                    </div>
                  </div>
                </div>

              </div>

              <div className="flex gap-2 justify-end mt-8 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCaseModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-705 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-950 text-white text-xs font-bold rounded-lg hover:bg-slate-900 cursor-pointer shadow-md shadow-slate-900/10"
                >
                  {getText("btn.registrarLegajo", "Registrar Legajo")}
                </button>
              </div>

            </form>
          </div>
        )}

      </main>
      </div>
    </div>
  );
}
