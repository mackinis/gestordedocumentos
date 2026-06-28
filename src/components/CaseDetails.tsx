/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Users,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronRight,
  Upload,
  UserPlus,
  Trash2,
  Edit2,
  MessageSquare,
  History,
  Send,
  Eye,
  Settings,
  Sliders,
  Plus,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  Info,
  X
} from "lucide-react";
import { Case, User, Participant, Observation } from "../types";
import { getTranslations } from "../utils/commercialTranslations";

interface CaseDetailsProps {
  commercialFocus?: string;
  currentUser: User;
  activeCaseId: string;
  onBack: () => void;
  // Hydrated details
  caseDetails: any; // Hydrated Case
  onAddParticipant: (caseId: string, part: any) => void;
  onDeleteParticipant: (caseId: string, partId: string) => void;
  onUploadDocument: (caseId: string, reqId: string, fileData: any) => void;
  onApproveDocument: (caseId: string, reqId: string) => void;
  onRejectDocument: (caseId: string, reqId: string, reason: string) => void;
  onCompleteForm: (caseId: string, reqId: string, values: any) => void;
  onToggleTask: (caseId: string, reqId: string, status: "PENDIENTE" | "COMPLETA") => void;
  onAddObservation: (caseId: string, message: string, entityType: string, entityId: string, bloquearRevision?: boolean) => void;
  onResolveObservation: (caseId: string, obsId: string, response: string) => void;
  onAdvanceStage: (caseId: string) => Promise<any>;
  onRetrocedeStage: (caseId: string) => void;
  allUsers: User[];
  onUpdateCaseDetails: (caseId: string, data: any) => void;
  onClaimCase?: (caseId: string) => void;
  onToggleDownloadPermission?: (caseId: string, reqId: string, enabled: boolean) => Promise<void>;
  onRequestUploadPermission?: (caseId: string, reqId: string, reason?: string) => Promise<void>;
  onConfigureUploadPermission?: (caseId: string, reqId: string, config: any) => Promise<void>;
  onAddAdjustmentRequest?: (caseId: string, payload: any) => void;
  onApproveAdjustmentRequest?: (caseId: string, reqId: string) => void;
  onRejectAdjustmentRequest?: (caseId: string, reqId: string, rejectionReason: string) => void;
  onRequestReview?: (caseId: string, type: "REVISION_SOLA" | "REVISION_Y_APROBACION") => Promise<{ success?: boolean; error?: boolean; message?: string }>;
  onCancelReview?: (caseId: string) => Promise<{ success?: boolean; error?: boolean; message?: string }>;
  onToggleReviewBlock?: (caseId: string, blocked: boolean, reason?: string) => Promise<void>;
  onResolveReview?: (caseId: string, action: "APROBAR" | "RECHAZAR") => Promise<void>;
}

export default function CaseDetails({
  commercialFocus = "general",
  currentUser,
  activeCaseId,
  onBack,
  caseDetails,
  onAddParticipant,
  onDeleteParticipant,
  onUploadDocument,
  onApproveDocument,
  onRejectDocument,
  onCompleteForm,
  onToggleTask,
  onAddObservation,
  onResolveObservation,
  onAdvanceStage,
  onRetrocedeStage,
  allUsers,
  onUpdateCaseDetails,
  onClaimCase,
  onToggleDownloadPermission,
  onRequestUploadPermission,
  onConfigureUploadPermission,
  onAddAdjustmentRequest,
  onApproveAdjustmentRequest,
  onRejectAdjustmentRequest,
  onRequestReview,
  onCancelReview,
  onToggleReviewBlock,
  onResolveReview
}: CaseDetailsProps) {
  
  const translations = getTranslations(commercialFocus);

  // Tab states: "requirements" | "participants" | "observations" | "adjustments"
  const [activeTab, setActiveTab] = useState<"requirements" | "participants" | "observations" | "adjustments">("requirements");

  // Rejection modal state
  const [rejectingReqId, setRejectingReqId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // New participant state
  const [showPartForm, setShowPartForm] = useState(false);
  const [partRole, setPartRole] = useState("Cliente");
  const [partName, setPartName] = useState("");
  const [partApellido, setPartApellido] = useState("");
  const [partDni, setPartDni] = useState("");
  const [partCuit, setPartCuit] = useState("");
  const [partEmail, setPartEmail] = useState("");
  const [partPhone, setPartPhone] = useState("");
  const [partObs, setPartObs] = useState("");

  // New general observation state
  const [newGeneralObs, setNewGeneralObs] = useState("");

  // Observation reply states
  const [replyObsId, setReplyObsId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  // Case settings/editor modal
  const [showSettings, setShowSettings] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editAdvisorId, setEditAdvisorId] = useState("");
  const [editManagerId, setEditManagerId] = useState("");
  const [editCompradores, setEditCompradores] = useState(1);
  const [editVendedores, setEditVendedores] = useState(1);
  const [editGarantes, setEditGarantes] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // States for the popup form group modals and tabbed content
  const [activeFormGroup, setActiveFormGroup] = useState<{ reqId: string; role: string } | null>(null);
  const [activeFormTab, setActiveFormTab] = useState<number>(0);

  // Block info warning modal state
  const [blockDetails, setBlockDetails] = useState<any | null>(null);

  // Timeline audit history states
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyData, setHistoryData] = useState<any>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Stage review / block states
  const [showReviewRequestModal, setShowReviewRequestModal] = useState(false);
  const [isRequestingReview, setIsRequestingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [bloquearRevision, setBloquearRevision] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState("");

  // Stage management states
  const [showStageManagement, setShowStageManagement] = useState(false);
  const [managedStages, setManagedStages] = useState<any[]>([]);
  const [managedStagesDetermined, setManagedStagesDetermined] = useState<boolean>(true);
  
  // State for adding a new requirement inline in a stage
  const [addingReqForStageId, setAddingReqForStageId] = useState<string | null>(null);
  const [newReqType, setNewReqType] = useState<'DOCUMENT' | 'TASK' | 'FORM'>('DOCUMENT');
  const [newReqName, setNewReqName] = useState('');
  const [newReqDesc, setNewReqDesc] = useState('');
  const [newReqRequired, setNewReqRequired] = useState(true);

  // States for editing an existing requirement inside a stage
  const [editingReqId, setEditingReqId] = useState<string | null>(null);
  const [editingReqName, setEditingReqName] = useState<string>("");
  const [editingReqDesc, setEditingReqDesc] = useState<string>("");
  const [editingReqRequired, setEditingReqRequired] = useState<boolean>(false);
  const [editingReqFields, setEditingReqFields] = useState<any[]>([]);

  const handleStartEditRequirement = (req: any) => {
    setEditingReqId(req.id);
    setEditingReqName(req.name);
    setEditingReqDesc(req.description || "");
    setEditingReqRequired(!!req.required);
    setEditingReqFields(req.formFields ? JSON.parse(JSON.stringify(req.formFields)) : []);
  };

  const handleAddEditingField = () => {
    const defaultName = `campo_${editingReqFields.length + 1}`;
    setEditingReqFields([
      ...editingReqFields,
      { name: defaultName, label: "Nuevo Campo", type: "text", required: true }
    ]);
  };

  const handleRemoveEditingField = (index: number) => {
    setEditingReqFields(editingReqFields.filter((_, idx) => idx !== index));
  };

  const handleUpdateEditingField = (index: number, key: string, value: any) => {
    setEditingReqFields(editingReqFields.map((field, idx) => {
      if (idx === index) {
        return { ...field, [key]: value };
      }
      return field;
    }));
  };

  // Form requirements state values
  const [tempFormValues, setTempFormValues] = useState<Record<string, Record<string, string>>>({});
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);

  // Upload request specification states
  const [promptingUploadReqId, setPromptingUploadReqId] = useState<string | null>(null);
  const [uploadRequestReason, setUploadRequestReason] = useState("");

  const getAdaptedFieldLabel = (label: string, role?: string) => {
    if (!label) return "";
    let clean = label;
    if (role && role !== "General") {
      clean = clean.replace(/de todos los propietarios/gi, `del propietario`);
      clean = clean.replace(/de todos los compradores/gi, `del comprador`);
      clean = clean.replace(/de todos los vendedores/gi, `del vendedor`);
      clean = clean.replace(/de todos los garantes/gi, `del garante`);
      
      clean = clean.replace(/de cada comprador/gi, `del comprador`);
      clean = clean.replace(/de cada vendedor/gi, `del vendedor`);
      clean = clean.replace(/de cada propietario/gi, `del propietario`);
      clean = clean.replace(/de cada garante/gi, `del garante`);
    } else {
      clean = clean.replace(/de todos los propietarios/gi, "del propietario");
      clean = clean.replace(/de todos los compradores/gi, "del comprador");
      clean = clean.replace(/de todos los vendedores/gi, "del vendedor");
      clean = clean.replace(/de todos los garantes/gi, "del garante");
    }
    return clean;
  };

  // Drag and drop / file uploader reference
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Dynamic document upload configuration & permissions states
  const [configuringReqId, setConfiguringReqId] = useState<string | null>(null);
  const [limitMaxCount, setLimitMaxCount] = useState<number>(1);
  const [limitFileType, setLimitFileType] = useState<string>("all");
  const [limitMaxWeight, setLimitMaxWeight] = useState<number>(5);
  const [limitEnabled, setLimitEnabled] = useState<boolean>(true);

  const handleSaveUploadConfig = async (reqId: string) => {
    if (onConfigureUploadPermission) {
      await onConfigureUploadPermission(caseDetails.id, reqId, {
        uploadEnabled: limitEnabled,
        maxCount: limitMaxCount,
        fileType: limitFileType,
        maxWeight: limitMaxWeight
      });
      setConfiguringReqId(null);
    }
  };

  // States for custom adjustment requests
  const [adjType, setAdjType] = useState<"FORM_COUNT" | "DOCUMENT_UPLOAD">("FORM_COUNT");
  const [adjTargetParty, setAdjTargetParty] = useState<"compradores" | "vendedores" | "garantes">("vendedores");
  const [adjAction, setAdjAction] = useState<"ADD" | "REMOVE">("ADD");
  const [adjQuantity, setAdjQuantity] = useState<number>(1);
  const [adjRequirementId, setAdjRequirementId] = useState<string>("");
  const [adjDetails, setAdjDetails] = useState<string>("");
  const [rejectionAdjId, setRejectionAdjId] = useState<string | null>(null);
  const [rejectionReasonText, setRejectionReasonText] = useState<string>("");

  // States for part adjustment request widget next to "Copias de DNI de las Partes"
  const [reqPartAction, setReqPartAction] = useState<"ADD" | "REMOVE">("ADD");
  const [reqPartRole, setReqPartRole] = useState<string>("comprador");
  const [reqPartCustomRole, setReqPartCustomRole] = useState<string>("");
  const [reqPartDetails, setReqPartDetails] = useState<string>("");

  const handleSendPartAdjustment = () => {
    if (!reqPartDetails.trim()) {
      alert("Por favor indique el motivo o especificación detallada del ajuste.");
      return;
    }

    const finalRole = reqPartRole === "otro" ? reqPartCustomRole.trim() : reqPartRole;
    if (!finalRole) {
      alert("Por favor especifique el rol.");
      return;
    }

    if (onAddAdjustmentRequest) {
      let targetPartyKey: any = "compradores";
      if (finalRole.toLowerCase() === "vendedor") targetPartyKey = "vendedores";
      else if (finalRole.toLowerCase() === "garante") targetPartyKey = "garantes";
      
      const actionLabel = reqPartAction === "ADD" ? "ALTA (Agregar)" : "BAJA (Quitar)";
      
      const payload: any = {
        type: "FORM_COUNT",
        targetParty: targetPartyKey,
        action: reqPartAction,
        quantity: 1,
        details: `[SOLICITUD ${actionLabel} - ROL: ${finalRole.toUpperCase()}] Justificación: ${reqPartDetails.trim()}`
      };

      onAddAdjustmentRequest(caseDetails.id, payload);

      // Reset form
      setReqPartDetails("");
      setReqPartCustomRole("");
      alert("¡Solicitud de ajuste enviada con éxito!");
    }
  };

  const handleCreateAdjustmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjDetails.trim()) {
      alert("Por favor indique el motivo o especificación detallada del ajuste.");
      return;
    }

    if (adjType === "DOCUMENT_UPLOAD" && !adjRequirementId) {
      alert("Por favor seleccione de qué requisito de documentación se trata.");
      return;
    }

    if (onAddAdjustmentRequest) {
      const payload: any = {
        type: adjType,
        details: adjDetails.trim(),
      };

      if (adjType === "FORM_COUNT") {
        payload.targetParty = adjTargetParty;
        payload.action = adjAction;
        payload.quantity = adjQuantity;
      } else {
        payload.requirementId = adjRequirementId;
      }

      onAddAdjustmentRequest(caseDetails.id, payload);

      // Reset form
      setAdjDetails("");
      setAdjRequirementId("");
    }
  };

  useEffect(() => {
    if (showStageManagement && caseDetails) {
      const initialStages = caseDetails.stages ? [...caseDetails.stages] : (caseDetails.template ? [...caseDetails.template.stages] : []);
      setManagedStages(JSON.parse(JSON.stringify(initialStages)));
      setManagedStagesDetermined(caseDetails.stagesDetermined !== false);
    }
  }, [showStageManagement, caseDetails]);

  const handleAddStage = () => {
    const newOrder = managedStages.length > 0 ? Math.max(...managedStages.map(s => s.order)) + 1 : 1;
    const newId = `stg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setManagedStages([
      ...managedStages,
      {
        id: newId,
        name: `Nueva Etapa ${managedStages.length + 1}`,
        description: "Descripción de la nueva etapa.",
        order: newOrder,
        requirements: []
      }
    ]);
  };

  const handleRemoveStage = (stageId: string) => {
    if (managedStages.length <= 1) {
      alert("El expediente debe contener al menos una etapa.");
      return;
    }
    if (caseDetails.currentStageId === stageId) {
      alert("No puedes eliminar la etapa en la que se encuentra actualmente el expediente.");
      return;
    }
    if (confirm("¿Estás seguro de que deseas eliminar esta etapa del expediente? El contenido de los requisitos ya aprobados en esta etapa se conservará en el historial, pero la etapa dejará de formar parte del pipeline.")) {
      setManagedStages(managedStages.filter(s => s.id !== stageId));
    }
  };

  const handleUpdateStageField = (stageId: string, field: string, value: any) => {
    setManagedStages(managedStages.map(s => s.id === stageId ? { ...s, [field]: value } : s));
  };

  const handleMoveStage = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === managedStages.length - 1) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const copy = [...managedStages];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;
    // Re-calculate orders based on final indices
    const reordered = copy.map((s, idx) => ({ ...s, order: idx + 1 }));
    setManagedStages(reordered);
  };

  const handleAddRequirement = (stageId: string) => {
    if (!newReqName.trim()) {
      alert("Debe especificar un nombre para el requisito.");
      return;
    }
    const reqId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newReq = {
      id: reqId,
      type: newReqType,
      name: newReqName,
      description: newReqDesc || "",
      required: newReqRequired
    };
    setManagedStages(managedStages.map(s => {
      if (s.id === stageId) {
        return {
          ...s,
          requirements: [...(s.requirements || []), newReq]
        };
      }
      return s;
    }));
    // Reset requirements form
    setNewReqName("");
    setNewReqDesc("");
    setNewReqRequired(true);
    setAddingReqForStageId(null);
  };

  const handleSaveReqEdit = (stageId: string, reqId: string) => {
    if (!editingReqName.trim()) {
      alert("Debe especificar un nombre para el requisito.");
      return;
    }
    setManagedStages(managedStages.map(s => {
      if (s.id === stageId) {
        return {
          ...s,
          requirements: (s.requirements || []).map((r: any) => {
            if (r.id === reqId) {
              return {
                ...r,
                name: editingReqName,
                description: editingReqDesc,
                required: editingReqRequired,
                formFields: r.type === "FORM" ? editingReqFields : r.formFields
              };
            }
            return r;
          })
        };
      }
      return s;
    }));
    setEditingReqId(null);
  };

  const handleRemoveRequirement = (stageId: string, reqId: string) => {
    if (confirm("¿Seguro que deseas quitar este requisito de la etapa?")) {
      setManagedStages(managedStages.map(s => {
        if (s.id === stageId) {
          return {
            ...s,
            requirements: (s.requirements || []).filter((r: any) => r.id !== reqId)
          };
        }
        return s;
      }));
    }
  };

  const handleSaveStages = async () => {
    try {
      if (onUpdateCaseDetails) {
        await onUpdateCaseDetails(caseDetails.id, {
          stages: managedStages,
          stagesDetermined: managedStagesDetermined
        });
        setShowStageManagement(false);
      }
    } catch (err) {
      console.error(err);
      alert("Error al guardar la configuración de etapas.");
    }
  };

  if (!caseDetails) {
    return (
      <div className="py-20 text-center font-sans">
        <Clock className="h-8 w-8 text-slate-300 animate-spin mx-auto" />
        <p className="text-sm font-medium text-slate-500 mt-2">Hydrating case folder, please wait...</p>
      </div>
    );
  }

  const {
    id,
    code,
    title,
    description,
    status,
    template,
    currentStage,
    participants,
    requirements,
    observations,
    advisorId,
    managerId,
    createdAt,
    partyCounts,
    reviewStatus,
    reviewButtonBlocked,
    reviewButtonBlockedReason
  } = caseDetails;

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/cases/${id}/timeline-history`);
      if (response.ok) {
        const data = await response.json();
        setHistoryData(data);
      }
    } catch (err) {
      console.error("Error fetching case timeline history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleOpenHistoryModal = () => {
    setShowHistoryModal(true);
    fetchHistory();
  };

  const exportHistoryToCSV = () => {
    if (!historyData || !historyData.allLogs) return;

    // Headers
    const headers = ["Fecha y Hora", "Usuario", "Rol", "Accion", "Descripcion"];
    const rows = historyData.allLogs.map((log: any) => [
      new Date(log.createdAt).toLocaleString(),
      log.userName || "Sistema",
      log.userRole || "ADMIN",
      log.action,
      log.description
    ]);

    // Stage history block
    const stageHeaders = ["Etapa", "Fecha Ingreso", "Fecha Egreso", "Duracion"];
    const stageRows = historyData.stageHistory.map((sh: any) => [
      sh.stageName,
      new Date(sh.enteredAt).toLocaleString(),
      sh.exitedAt ? new Date(sh.exitedAt).toLocaleString() : "Activa actualmente",
      sh.durationText
    ]);

    // Construct CSV content with a BOM for proper Excel Spanish accents support
    let csvContent = "\uFEFF";
    csvContent += "REPORTE DE AUDITORIA Y CRONOLOGIA DE EXPEDIENTE\n";
    csvContent += `Codigo: ${historyData.code}\n`;
    csvContent += `Titulo: ${historyData.title}\n`;
    csvContent += `Estado: ${historyData.status}\n\n`;

    csvContent += "DURACION DE ETAPAS\n";
    csvContent += stageHeaders.join(",") + "\n";
    stageRows.forEach((row: any) => {
      csvContent += row.map((field: any) => `"${String(field).replace(/"/g, '""')}"`).join(",") + "\n";
    });
    csvContent += "\n";

    csvContent += "CRONOLOGIA DE ACTIVIDADES & ACCIONES\n";
    csvContent += headers.join(",") + "\n";
    rows.forEach((row: any) => {
      csvContent += row.map((field: any) => `"${String(field).replace(/"/g, '""')}"`).join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Auditoria_Expediente_${historyData.code}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isCaseUnassigned = !managerId || managerId === "unassigned" || managerId === "";
  const canIntervene = 
    currentUser.role === "ADMIN" || 
    currentUser.role === "ASESOR" || 
    (currentUser.role === "MANAGER" && managerId === currentUser.id);

  const handleOpenSettings = () => {
    setEditTitle(title);
    setEditDesc(description || "");
    setEditAdvisorId(advisorId);
    setEditManagerId(managerId || "unassigned");
    setEditCompradores(partyCounts?.compradores ?? 1);
    setEditVendedores(partyCounts?.vendedores ?? 1);
    setEditGarantes(partyCounts?.garantes ?? 0);
    setShowDeleteConfirm(false);
    setShowSettings(true);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateCaseDetails(id, {
      title: editTitle,
      description: editDesc,
      advisorId: editAdvisorId,
      managerId: editManagerId === "unassigned" ? "unassigned" : editManagerId,
      partyCounts: {
        compradores: editCompradores,
        vendedores: editVendedores,
        garantes: editGarantes
      }
    });
    setShowSettings(false);
  };

  const handleFileChange = (reqId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      onUploadDocument(id, reqId, {
        fileName: file.name,
        fileType: file.type,
        fileSize: (file.size / (1024 * 1024)).toFixed(2) + " MB",
        fileContent: reader.result, // Base64
        userId: currentUser.id
      });
    };
    reader.readAsDataURL(file);
  };

  const triggerSelectFile = (reqId: string) => {
    fileInputRefs.current[reqId]?.click();
  };

  const submitFormRequirement = (reqId: string, instanceId?: string) => {
    const key = instanceId ? `${reqId}_${instanceId}` : reqId;
    const values = tempFormValues[key] || {};
    // Ensure all required fields are populated
    const reqDef = requirements.find((r: any) => r.id === reqId);
    if (!reqDef) return;

    const missing = (reqDef.formFields || []).some(
      (f: any) => f.required && (!values[f.name] || values[f.name].trim() === "")
    );

    if (missing) {
      alert("Por favor complete todos los campos obligatorios del formulario.");
      return;
    }

    onCompleteForm(id, reqId, {
      formValues: values,
      userId: currentUser.id,
      instanceId
    });
    
    if (instanceId && editingInstanceId === instanceId) {
      setEditingInstanceId(null);
    }
  };

  const updateFormValue = (reqId: string, fieldName: string, val: string, instanceId?: string) => {
    const key = instanceId ? `${reqId}_${instanceId}` : reqId;
    setTempFormValues(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        [fieldName]: val
      }
    }));
  };

  const handleAddParticipantSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partName || !partApellido || !partDni) {
      alert("Nombre, Apellido y DNI/Cédula son obligatorios.");
      return;
    }
    onAddParticipant(id, {
      role: partRole,
      name: partName,
      apellido: partApellido,
      dni: partDni,
      cuitCuil: partCuit,
      email: partEmail,
      telefono: partPhone,
      observaciones: partObs
    });

    // Reset Form
    setShowPartForm(false);
    setPartName("");
    setPartApellido("");
    setPartDni("");
    setPartCuit("");
    setPartEmail("");
    setPartPhone("");
    setPartObs("");
  };

  const handleAddGeneralObs = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGeneralObs) return;
    onAddObservation(id, newGeneralObs, "GENERAL", "general", bloquearRevision);
    setNewGeneralObs("");
    setBloquearRevision(false);
  };

  const handleResolveObsSubmit = (obsId: string) => {
    if (!replyText) return;
    onResolveObservation(id, obsId, replyText);
    setReplyObsId(null);
    setReplyText("");
  };

  const handleRequestReviewSubmit = async (type: "REVISION_SOLA" | "REVISION_Y_APROBACION") => {
    if (!onRequestReview) return;
    setIsRequestingReview(true);
    setReviewError(null);
    try {
      const res = await onRequestReview(id, type);
      if (res && res.error) {
        setReviewError(res.message || "Error al solicitar la revisión.");
      } else {
        setShowReviewRequestModal(false);
      }
    } catch (err: any) {
      setReviewError("Error en la conexión con el servidor.");
    } finally {
      setIsRequestingReview(false);
    }
  };

  const handleCancelReviewSubmit = async () => {
    if (!onCancelReview) return;
    setIsRequestingReview(true);
    setReviewError(null);
    try {
      const res = await onCancelReview(id);
      if (res && res.error) {
        setReviewError(res.message || "Error al cancelar la revisión.");
      } else {
        setShowReviewRequestModal(false);
      }
    } catch (err: any) {
      setReviewError("Error en la conexión con el servidor.");
    } finally {
      setIsRequestingReview(false);
    }
  };

  const handleToggleBlockSubmit = async (blocked: boolean, reason?: string) => {
    if (!onToggleReviewBlock) return;
    try {
      await onToggleReviewBlock(id, blocked, reason);
    } catch (err) {
      console.error("Error toggling review block", err);
    }
  };

  const handleResolveReviewSubmit = async (action: "APROBAR" | "RECHAZAR") => {
    if (!onResolveReview) return;
    try {
      await onResolveReview(id, action);
    } catch (err) {
      console.error("Error resolving review", err);
    }
  };

  const handleAdvanceClick = async () => {
    try {
      const response = await onAdvanceStage(id);
      if (response && response.error && response.details) {
        setBlockDetails(response.details);
      } else {
        setBlockDetails(null);
      }
    } catch (err: any) {
      // Checked error handled by server API return
    }
  };

  // Stepper elements
  const sortedStages = caseDetails.stages ? [...caseDetails.stages].sort((a, b) => a.order - b.order) : (template ? [...template.stages].sort((a, b) => a.order - b.order) : []);
  const currentStageIdx = sortedStages.findIndex((s) => s.id === currentStage?.id);

  return (
    <div className="space-y-6 font-sans">
      
      {/* Detail header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-200 pb-4 gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer text-xs font-semibold flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
          <div>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-xs font-bold text-slate-400 font-mono tracking-wider">{code}</span>
              <span className={`text-[9px] font-extrabold px-2 py-0.5 border rounded-full uppercase ${
                status === "OBSERVADO" ? "bg-amber-50 text-amber-800 border-amber-250" :
                status === "FINALIZADO" ? "bg-emerald-50 text-emerald-800 border-emerald-250 font-bold" :
                "bg-blue-50 text-blue-800 border-blue-250"
              }`}>
                {status}
              </span>
            </div>
            <h2 className="text-lg font-display font-bold text-slate-900 mt-1">{title}</h2>
            
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="font-semibold text-slate-400 uppercase text-[9px] font-mono tracking-wider">Asesor:</span>
                <span className="text-slate-700 font-medium">{allUsers.find(u => u.id === advisorId)?.name || "Sin asignar"}</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="font-semibold text-slate-400 uppercase text-[9px] font-mono tracking-wider">Manager:</span>
                {isCaseUnassigned ? (
                  <span className="bg-amber-100 text-amber-850 px-2 py-0.5 rounded-md font-bold text-[10px] animate-pulse">
                    A la espera de un manager ⌛
                  </span>
                ) : (
                  <span className="text-slate-700 font-medium">
                    {allUsers.find(u => u.id === managerId)?.name || managerId}
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Action stage change and tools */}
        <div className="flex flex-wrap gap-2">
          {isCaseUnassigned && currentUser.role === "MANAGER" && onClaimCase && (
            <button
              onClick={() => onClaimCase(id)}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg cursor-pointer shadow-xs flex items-center gap-1.5 transition-all"
            >
              ⚡ Tomar Expediente
            </button>
          )}

          {currentUser.role !== "ASESOR" && (
            <button
              onClick={handleOpenHistoryModal}
              className="px-3 py-2 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
              title="Historial de Auditoría & Cronología"
            >
              <History className="h-4 w-4" />
              <span>Historial de Caso</span>
            </button>
          )}

          {currentUser.role !== "ASESOR" && (currentUser.role === "ADMIN" || canIntervene) && (
            <button
              onClick={handleOpenSettings}
              className="p-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 rounded-lg transition-colors cursor-pointer"
              title={`Configuración / Asignar ${translations.advisorSingular.toLowerCase()}`}
            >
              <Settings className="h-4 w-4" />
            </button>
          )}

          {currentUser.role !== "ASESOR" && (currentUser.role === "ADMIN" || canIntervene) && (
            <button
              onClick={() => setShowStageManagement(true)}
              className="px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-indigo-600 hover:text-indigo-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              title="Gestionar Flujo y Etapas del Expediente"
            >
              <Sliders className="h-3.5 w-3.5 text-indigo-500" />
              <span>Gestionar Etapas</span>
            </button>
          )}

          {currentStageIdx > 0 && status !== "FINALIZADO" && currentUser.role !== "ASESOR" && canIntervene && (
            <button
              onClick={() => {
                if (confirm("¿Está seguro de retroceder la etapa? Toda documentación cargada en la etapa actual quedará retenida, pero avanzará el pipeline hacia atrás.")) {
                  onRetrocedeStage(id);
                }
              }}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold rounded-lg cursor-pointer"
            >
              ⬅ Retroceder Etapa
            </button>
          )}

          {currentUser.role === "ASESOR" && status !== "FINALIZADO" && (
            <button
              id="btn-request-review"
              onClick={() => {
                if (reviewButtonBlocked) {
                  alert(`Las solicitudes de revisión están bloqueadas temporalmente.\nMotivo: ${reviewButtonBlockedReason || "Por favor cumple con todas las observaciones pendientes antes de solicitar nueva revisión."}`);
                  return;
                }
                setReviewError(null);
                setShowReviewRequestModal(true);
              }}
              disabled={!!reviewButtonBlocked}
              className={`px-4 py-2 font-bold text-xs rounded-lg cursor-pointer transition-all flex items-center gap-1.5 ${
                reviewButtonBlocked 
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
              }`}
              title={reviewButtonBlocked ? `Bloqueado: ${reviewButtonBlockedReason}` : "Solicitar revisión o aprobación al manager"}
            >
              <span>Solicitar Revisión ⏳</span>
            </button>
          )}

          {status !== "FINALIZADO" && (currentUser.role === "ASESOR" || canIntervene) && (
            <button
              id="btn-advance-stage"
              onClick={handleAdvanceClick}
              className={`px-4 py-2 font-bold text-xs rounded-lg cursor-pointer transition-all flex items-center gap-1.5 ${
                currentStageIdx === sortedStages.length - 1
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white/95"
                  : "bg-slate-950 hover:bg-slate-900 text-white shadow-xs"
              }`}
            >
              {currentStageIdx === sortedStages.length - 1 ? "Concluir Expediente ✓" : "Siguiente Etapa ➡"}
            </button>
          )}
        </div>
      </div>

      {description && (
        <p className="text-xs text-slate-500 leading-relaxed max-w-3xl -mt-2">
          {description}
        </p>
      )}

      {/* SECCIÓN DE REVISIONES Y CONTROL (Asesores & Managers) */}
      {(reviewStatus || reviewButtonBlocked) && (
        <div className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          reviewStatus === "REVISION_SOLICITADA" || reviewStatus === "APROBACION_SOLICITADA"
            ? "bg-violet-50 border-violet-200"
            : reviewButtonBlocked
            ? "bg-rose-50 border-rose-250"
            : "bg-emerald-50 border-emerald-250"
        }`}>
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5">
              {reviewStatus === "REVISION_SOLICITADA" || reviewStatus === "APROBACION_SOLICITADA" ? "⏳" : reviewButtonBlocked ? "🚫" : "✅"}
            </span>
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                Control de Revisión de Etapa
              </h4>
              <p className="text-xs text-slate-700 mt-1">
                {reviewStatus === "REVISION_SOLICITADA" && (
                  <span>El asesor solicitó <strong>Revisión Simple</strong> para la etapa actual.</span>
                )}
                {reviewStatus === "APROBACION_SOLICITADA" && (
                  <span>El asesor solicitó <strong>Revisión con Aprobación Automática</strong> de la etapa. Al aprobar, el expediente avanzará automáticamente.</span>
                )}
                {reviewStatus === "REVISADO" && (
                  <span>La etapa actual ha sido <strong>Revisada</strong> con éxito (pendiente avance manual).</span>
                )}
                {reviewStatus === "APROBADO" && (
                  <span>La etapa actual ha sido <strong>Aprobada</strong>.</span>
                )}
                {!reviewStatus && reviewButtonBlocked && (
                  <span>El botón de revisión para el asesor está <strong>Bloqueado</strong> por observaciones pendientes.</span>
                )}
              </p>
              {reviewButtonBlocked && (
                <p className="text-[11px] text-rose-800 italic mt-1 bg-white/50 px-2 py-1 rounded-md border border-rose-100">
                  <strong>Motivo de bloqueo:</strong> {reviewButtonBlockedReason || "Por favor cumpla con todas las observaciones registradas antes de solicitar nueva revisión."}
                </p>
              )}
            </div>
          </div>

          {/* Acciones para Managers / Admins */}
          {currentUser.role !== "ASESOR" && (
            <div className="flex flex-wrap items-center gap-2 self-end md:self-center">
              {(reviewStatus === "REVISION_SOLICITADA" || reviewStatus === "APROBACION_SOLICITADA") && (
                <>
                  <button
                    onClick={() => handleResolveReviewSubmit("APROBAR")}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1 shadow-2xs transition-colors"
                  >
                    <span>Aprobar ✓</span>
                  </button>
                  <button
                    onClick={() => handleResolveReviewSubmit("RECHAZAR")}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1 shadow-2xs transition-colors"
                  >
                    <span>Rechazar con Observaciones ✗</span>
                  </button>
                </>
              )}
              
              <button
                onClick={() => {
                  if (reviewButtonBlocked) {
                    handleToggleBlockSubmit(false);
                  } else {
                    const r = prompt("Ingrese el motivo de bloqueo para el asesor (ej. faltan firmas, documentación errónea):");
                    if (r !== null) {
                      handleToggleBlockSubmit(true, r);
                    }
                  }
                }}
                className={`px-3 py-1.5 border text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                  reviewButtonBlocked
                    ? "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                    : "bg-rose-100 border-rose-250 text-rose-800 hover:bg-rose-200"
                }`}
              >
                {reviewButtonBlocked ? "🔓 Desbloquear Botón de Revisión" : "🔒 Bloquear Botón de Revisión"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Visual Pipeline Stepper */}
      <div className="bg-white border border-slate-150 rounded-xl p-4 shadow-3xs">
        <p className="text-[9px] font-bold text-slate-400 font-mono uppercase tracking-wider mb-3">
          Pipeline de Procesos de Negocio
        </p>
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 overflow-x-auto">
          {sortedStages.map((stg, sIdx) => {
            const isActive = stg.id === currentStage?.id;
            const isCompleted = sIdx < currentStageIdx || status === "FINALIZADO";
            
            return (
              <div key={stg.id} className="flex-1 flex items-center gap-2">
                <div className={`flex-1 flex items-center gap-3 p-2.5 rounded-xl border text-xs text-left transition-all ${
                  isActive 
                    ? "bg-slate-950 border-slate-950 text-white font-medium shadow-xs" 
                    : isCompleted
                    ? "bg-slate-50 border-slate-200 text-slate-800"
                    : "bg-white border-slate-150 text-slate-400"
                }`}>
                  <span className={`h-5 w-5 rounded-md font-bold flex items-center justify-center font-mono text-[9px] ${
                    isActive ? "bg-white text-slate-950" : isCompleted ? "bg-slate-200 text-slate-700" : "bg-slate-100 text-slate-400"
                  }`}>
                    {isCompleted ? "✓" : sIdx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold truncate text-[10px] uppercase tracking-wide ${isActive ? "text-white" : "text-slate-800"}`}>{stg.name}</p>
                    <p className={`text-[9px] truncate opacity-80 ${isActive ? "text-slate-300" : "text-slate-400"}`}>{stg.description || "Sin descripción"}</p>
                  </div>
                </div>

                {sIdx < sortedStages.length - 1 && (
                  <span className="hidden md:inline text-slate-300">
                    <ChevronRight className="h-4 w-4" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {currentUser.role === "MANAGER" && !canIntervene && (
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center gap-3 text-slate-600 text-xs shadow-3xs animate-in fade-in duration-300">
          <Info className="h-4 w-4 text-slate-400 shrink-0" />
          <p>
            <span className="font-bold text-slate-800">Modo de Vista de Lectura:</span> Este expediente está siendo gestionado por el manager <span className="font-semibold text-slate-900">{allUsers.find(u => u.id === managerId)?.name || managerId}</span>. Puedes visualizar la información del legajo, pero sin intervenir en el proceso.
          </p>
        </div>
      )}

      {/* CRITICAL CONSTRAINTS BLOCK ERROR BANNER */}
      {blockDetails && (
        <div className="bg-red-50 border border-red-250/90 text-red-950 p-4.5 rounded-2xl flex items-start gap-3.5 shadow-xs animate-in fade-in duration-300">
          <div className="bg-red-100 p-2 rounded-xl text-red-700">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="flex-1 text-xs">
            <h4 className="font-bold font-display text-slate-900">Control de Avance: Avance Bloqueado</h4>
            <p className="text-rose-900 mt-1 leading-relaxed">
              No es posible pasar a la siguiente etapa de legajo. Debe resolver los siguientes elementos pendientes o con anomalías en la etapa actual:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 max-w-3xl border-t border-red-200/55 pt-3">
              {blockDetails.missingDocs && blockDetails.missingDocs.length > 0 && (
                <div>
                  <p className="font-bold text-red-800 text-[11px] uppercase font-mono mb-1">Documentos Obligatorios Faltantes:</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-700">
                    {blockDetails.missingDocs.map((d: string, i: number) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
              )}
              {blockDetails.rejectedDocs && blockDetails.rejectedDocs.length > 0 && (
                <div>
                  <p className="font-bold text-red-800 text-[11px] uppercase font-mono mb-1">Documentos Rechazados (Asesor debe re-subir):</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-700">
                    {blockDetails.rejectedDocs.map((d: string, i: number) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
              )}
              {blockDetails.pendingTasks && blockDetails.pendingTasks.length > 0 && (
                <div>
                  <p className="font-bold text-red-800 text-[11px] uppercase font-mono mb-1">Tareas, Visitas o Formularios pendientes:</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-700">
                    {blockDetails.pendingTasks.map((t: string, i: number) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              )}
              {blockDetails.openObservations && blockDetails.openObservations.length > 0 && (
                <div>
                  <p className="font-bold text-red-800 text-[11px] uppercase font-mono mb-1">Observaciones Críticas Abiertas:</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-700">
                    {blockDetails.openObservations.map((o: string, i: number) => <li key={i}>{o}</li>)}
                  </ul>
                </div>
              )}
              {blockDetails.reviewingDocs && blockDetails.reviewingDocs.length > 0 && (
                <div>
                  <p className="font-bold text-amber-800 text-[11px] uppercase font-mono mb-1">Cargados en cola de revisión (Manager debe visar):</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-700">
                    {blockDetails.reviewingDocs.map((o: string, i: number) => <li key={i}>{o}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Workspace Tabs navigation */}
      <div className="flex border-b border-slate-150 text-xs font-medium gap-2">
        <button
          onClick={() => setActiveTab("requirements")}
          className={`pb-3 px-4 border-b-2 transition-all cursor-pointer ${
            activeTab === "requirements" 
              ? "border-slate-950 text-slate-950 font-semibold" 
              : "border-transparent text-slate-400 hover:text-slate-800"
          }`}
        >
          Requisitos & Tareas
        </button>

        <button
          onClick={() => setActiveTab("participants")}
          className={`pb-3 px-4 border-b-2 transition-all cursor-pointer ${
            activeTab === "participants" 
              ? "border-slate-950 text-slate-950 font-semibold" 
              : "border-transparent text-slate-400 hover:text-slate-800"
          }`}
        >
          Participantes ({participants.length})
        </button>

        <button
          onClick={() => setActiveTab("observations")}
          className={`pb-3 px-4 border-b-2 transition-all cursor-pointer ${
            activeTab === "observations" 
              ? "border-slate-950 text-slate-950 font-semibold" 
              : "border-transparent text-slate-400 hover:text-slate-800"
          }`}
        >
          Intervenciones & Observaciones ({observations.length})
        </button>

        <button
          onClick={() => setActiveTab("adjustments")}
          className={`pb-3 px-4 border-b-2 transition-all cursor-pointer ${
            activeTab === "adjustments" 
              ? "border-slate-950 text-slate-950 font-semibold" 
              : "border-transparent text-slate-400 hover:text-slate-800"
          }`}
        >
          Solicitudes de Ajustes ({caseDetails.adjustmentRequests?.length || 0})
        </button>
      </div>

      {/* Main Tabs panels */}

      {/* REQUIREMENTS LIST */}
      {activeTab === "requirements" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center text-xs text-slate-500 font-bold font-mono uppercase bg-slate-100 p-3 rounded-xl border border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1">
              <span>Etapa actual: {currentStage ? currentStage.name : "N/A"}</span>
              <span className="text-slate-400 font-sans font-medium text-[10px] lowercase normal-case bg-white px-2 py-0.5 rounded border border-slate-200 ml-0 sm:ml-2">
                {caseDetails.stagesDetermined !== false 
                  ? `(Etapa ${currentStageIdx + 1} de ${sortedStages.length})` 
                  : "(Cantidad de etapas: a determinar)"}
              </span>
            </div>
            <span>{requirements.length} Requisitos estipulados</span>
          </div>

          <div className="divide-y divide-slate-150 border border-slate-200 rounded-2xl bg-white shadow-xs overflow-hidden">
            {requirements.map((req: any) => {
              const { id: rId, type, name: rName, description: rDesc, required: rRequired, document, task } = req;
              return (
                <div key={rId} className="p-4 sm:p-5 flex flex-col gap-4 bg-white hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-0">
                  
                  {/* Row 1: Header (Title, description, meta details) and Status Badges / Document Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    
                    {/* Left: Requisite details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase ${
                          type === "DOCUMENT" ? "bg-blue-100 text-blue-700" :
                          type === "FORM" ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {type === "DOCUMENT" ? "Documento" : type === "FORM" ? "Formulario" : "Tarea de Campo"}
                        </span>
                        {rRequired && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase bg-red-100 text-red-700">
                            Obligatorio
                          </span>
                        )}
                        {type === "DOCUMENT" && currentUser.role !== "ASESOR" && (
                          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md border ${
                            req.uploadEnabled ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-500"
                          }`}>
                            SUBIDA: {req.uploadEnabled ? "HABILITADA" : "BLOQUEADA"}
                          </span>
                        )}
                      </div>
                      <h4 className="font-semibold text-slate-900 text-xs sm:text-sm mt-1.5 font-display">
                        {rName}
                      </h4>
                      {rDesc && (
                        <p className="text-slate-400 text-xs mt-0.5 leading-snug">
                          {rDesc}
                        </p>
                      )}

                      {/* Meta state representation for uploaded items */}
                      {type === "DOCUMENT" && document && (
                        <div className="mt-3 inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2 text-[11px] text-slate-500 font-mono">
                          <span className="font-bold">{document.fileName}</span>
                          <span className="text-slate-300">|</span>
                          <span>{document.fileSize}</span>
                          <span className="text-slate-300">|</span>
                          <span>v{document.version}</span>
                          <span className="text-slate-300">|</span>
                          <span className="font-bold text-slate-600">Por {document.uploadedBy}</span>
                        </div>
                      )}
                    </div>

                    {/* Right side: overall status badges & quick document buttons */}
                    <div className="flex items-center gap-3 self-start shrink-0">
                      {type === "DOCUMENT" && (
                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                          
                          {/* Current Badge Status */}
                          {document ? (
                            <span className={`text-[10px] font-bold py-1 px-2.5 rounded-full border text-center ${
                              document.status === "APROBADO" ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
                              document.status === "RECHAZADO" ? "bg-red-50 border-red-200 text-red-800" :
                              document.status === "EN_REVISION" ? "bg-amber-50 border-amber-200 text-amber-800" :
                              "bg-slate-50 border-slate-200 text-slate-600"
                            }`}>
                              {document.status === "APROBADO" ? "APROBADO ✓" :
                               document.status === "RECHAZADO" ? "RECHAZADO ✕" : "EN REVISIÓN ⌛"}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold py-1 px-2.5 rounded-full border border-slate-200 text-slate-400 bg-slate-50">
                              PENDIENTE △
                            </span>
                          )}

                          {/* Advisor subida upload triggers */}
                          {currentUser.role === "ASESOR" && status !== "FINALIZADO" && (!document || document.status !== "APROBADO") && (
                            <>
                              {req.uploadEnabled ? (
                                <div className="flex flex-col items-end gap-1.5">
                                  <div className="relative">
                                    <input
                                      type="file"
                                      className="hidden"
                                      ref={(el) => { fileInputRefs.current[rId] = el; }}
                                      onChange={(e) => handleFileChange(rId, e)}
                                      accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                                    />
                                    <button
                                      id={`btn-upload-${rId}`}
                                      onClick={() => triggerSelectFile(rId)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
                                    >
                                      <Upload className="h-3.5 w-3.5" />
                                      Cargar Archivo
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {promptingUploadReqId === rId ? (
                                    <div className="bg-slate-50 border border-indigo-100 p-2 rounded-lg flex flex-col gap-1.5 max-w-xs text-left">
                                      <label className="text-[9px] font-bold text-indigo-700 uppercase block">¿Qué vas a subir?</label>
                                      <input
                                        type="text"
                                        value={uploadRequestReason}
                                        onChange={(e) => setUploadRequestReason(e.target.value)}
                                        placeholder="Ej: DNI, escritura, etc."
                                        className="w-full text-xs p-1 border border-slate-200 rounded bg-white focus:outline-hidden"
                                        autoFocus
                                      />
                                      <div className="flex justify-end gap-1.5">
                                        <button
                                          onClick={() => {
                                            setPromptingUploadReqId(null);
                                            setUploadRequestReason("");
                                          }}
                                          className="px-2 py-0.5 text-[9px] bg-slate-200 text-slate-700 rounded hover:bg-slate-300 font-medium cursor-pointer"
                                        >
                                          Cancelar
                                        </button>
                                        <button
                                          onClick={async () => {
                                            if (!uploadRequestReason.trim()) {
                                              return;
                                            }
                                            if (onRequestUploadPermission) {
                                              await onRequestUploadPermission(id, rId, uploadRequestReason.trim());
                                            }
                                            setPromptingUploadReqId(null);
                                            setUploadRequestReason("");
                                          }}
                                          className="px-2 py-0.5 text-[9px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded cursor-pointer"
                                        >
                                          Solicitar
                                        </button>
                                      </div>
                                    </div>
                                  ) : req.uploadRequestStatus === "SOLICITADO" ? (
                                    <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1 font-bold animate-pulse">
                                      ⌛ Solicitado
                                    </span>
                                  ) : req.uploadRequestStatus === "RECHAZADO" ? (
                                    <div className="flex flex-col items-end gap-1">
                                      <span className="text-[10px] text-red-600 font-bold bg-red-50 border border-red-200 px-2 py-1 rounded">
                                        ✕ Subida Denegada
                                      </span>
                                      <button
                                        onClick={() => {
                                          setPromptingUploadReqId(rId);
                                          setUploadRequestReason("");
                                        }}
                                        className="text-[9px] font-bold text-slate-700 hover:text-indigo-600 underline cursor-pointer"
                                      >
                                        Solicitar de nuevo
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setPromptingUploadReqId(rId);
                                        setUploadRequestReason("");
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-150 text-indigo-700 text-[11px] font-bold rounded-lg cursor-pointer transition-colors"
                                    >
                                      <Upload className="h-3 w-3" />
                                      Solicitar Subida
                                    </button>
                                  )}
                                </>
                              )}
                            </>
                          )}

                          {/* Manager approval decision triggers */}
                          {status !== "FINALIZADO" && currentUser.role !== "ASESOR" && canIntervene && document && document.status === "EN_REVISION" && (
                            <div className="flex gap-1">
                              <button
                                id={`btn-approve-doc-${rId}`}
                                onClick={() => onApproveDocument(id, rId)}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg cursor-pointer"
                                title="Aprobar Documento"
                              >
                                Aprobar
                              </button>
                              <button
                                id={`btn-reject-doc-trigger-${rId}`}
                                onClick={() => {
                                  setRejectingReqId(rId);
                                  setRejectReason("");
                                }}
                                className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold rounded-lg cursor-pointer"
                                title="Rechazar con Nota"
                              >
                                Rechazar
                              </button>
                            </div>
                          )}

                          {/* Preview / Visualizer trigger */}
                          {document && document.fileUrl && (
                            <>
                              {currentUser.role !== "ASESOR" || req.downloadEnabled ? (
                                <a
                                  href={document.fileUrl}
                                  download={document.fileName}
                                  className="px-2.5 py-1.5 border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-500 text-xs font-semibold"
                                  title="Descargar documento original"
                                >
                                  Descargar
                                </a>
                              ) : (
                                <span 
                                  className="px-2.5 py-1.5 bg-slate-100 border border-slate-200 text-slate-400 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-not-allowed select-none"
                                  title="La descarga de este documento no ha sido habilitada en su perfil por el Administrador"
                                >
                                  🔒 Bloqueado
                                </span>
                              )}
                            </>
                          )}

                          {/* Manager control panel buttons */}
                          {currentUser.role !== "ASESOR" && (
                            <div className="flex items-center gap-1 pl-1 border-l border-slate-100">
                              {/* Toggle download permission */}
                              <button
                                onClick={() => {
                                  if (onToggleDownloadPermission) {
                                    onToggleDownloadPermission(id, rId, !req.downloadEnabled);
                                  }
                                }}
                                className={`px-2 py-1.5 text-[10px] font-bold rounded-lg border transition-all cursor-pointer inline-flex items-center gap-1 ${
                                  req.downloadEnabled 
                                    ? "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100" 
                                    : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                                }`}
                                title={req.downloadEnabled ? "Descarga habilitada para el asesor. Clic para bloquear." : "Descarga bloqueada para el asesor. Clic para habilitar."}
                              >
                                {req.downloadEnabled ? "✓ Descarga OK" : "🔒 Descarga Bloq."}
                              </button>

                              {/* Configure upload limits button */}
                              <button
                                onClick={() => {
                                  setConfiguringReqId(configuringReqId === rId ? null : rId);
                                  setLimitMaxCount(req.uploadConfig?.maxCount || 1);
                                  setLimitFileType(req.uploadConfig?.fileType || "all");
                                  setLimitMaxWeight(req.uploadConfig?.maxWeight || 5);
                                  setLimitEnabled(!!req.uploadEnabled);
                                }}
                                className={`p-1.5 border rounded-lg transition-colors cursor-pointer ${
                                  req.uploadEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                                }`}
                                title="Configurar límites y permisos de subida"
                              >
                                <Settings className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}

                        </div>
                      )}

                      {type === "FORM" && (
                        <div className="flex items-center gap-2">
                          {(() => {
                            const isFormComplete = task && task.formInstances && task.formInstances.length > 0
                              ? task.formInstances.every((inst: any) => inst.status === "COMPLETA")
                              : task && task.status === "COMPLETA";
                            
                            return isFormComplete ? (
                              <span className="text-[10px] font-bold py-1 px-2.5 rounded-full border border-teal-200 bg-teal-50 text-teal-800">
                                COMPLETO ✓
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold py-1 px-2.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800 animate-pulse">
                                PENDIENTE ✍
                              </span>
                            );
                          })()}
                        </div>
                      )}

                      {type === "TASK" && (
                        <div className="flex items-center gap-2">
                          {task && task.status === "COMPLETA" ? (
                            <span className="text-[10px] font-bold py-1 px-2.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800">
                              REALIZADA ✓
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold py-1 px-2.5 rounded-full border border-slate-200 text-slate-400 bg-slate-50">
                              PENDIENTE ✕
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                  </div>

                  {/* Row 2: Full-width Interactive block for Forms & Tasks */}
                  {(type === "FORM" || type === "TASK") && (
                    <div className="w-full mt-2 border-t border-slate-100 pt-4">
                      
                      {/* FORM Requirement Details */}
                      {type === "FORM" && (
                        <div className="w-full space-y-4">
                          {task && task.formInstances && task.formInstances.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                              {(() => {
                                // Group instances by role
                                const groups: Record<string, any[]> = {};
                                task.formInstances.forEach((inst: any) => {
                                  const r = inst.role || "General";
                                  if (!groups[r]) groups[r] = [];
                                  groups[r].push(inst);
                                });

                                return Object.entries(groups).map(([role, list]) => {
                                  const completedCount = list.filter((inst: any) => inst.status === "COMPLETA").length;
                                  const totalCount = list.length;
                                  const isAllComplete = completedCount === totalCount;
                                  
                                  // Pick a nice color accent for each role
                                  let roleTitle = role;
                                  let colorClasses = "bg-indigo-50/40 border-indigo-100 text-indigo-800";
                                  let bgHoverClasses = "hover:bg-indigo-50 hover:border-indigo-300";
                                  let progressColor = "bg-indigo-600";
                                  
                                  const normalizedRole = role.toLowerCase();
                                  if (normalizedRole === "comprador") {
                                    roleTitle = "Compradores";
                                    colorClasses = "bg-sky-50/40 border-sky-100 text-sky-850";
                                    bgHoverClasses = "hover:bg-sky-50 hover:border-sky-300";
                                    progressColor = "bg-sky-600";
                                  } else if (normalizedRole === "vendedor") {
                                    roleTitle = "Vendedores";
                                    colorClasses = "bg-teal-50/40 border-teal-100 text-teal-850";
                                    bgHoverClasses = "hover:bg-teal-50 hover:border-teal-300";
                                    progressColor = "bg-teal-600";
                                  } else if (normalizedRole === "garante") {
                                    roleTitle = "Garantes";
                                    colorClasses = "bg-purple-50/40 border-purple-100 text-purple-850";
                                    bgHoverClasses = "hover:bg-purple-50 hover:border-purple-300";
                                    progressColor = "bg-purple-600";
                                  } else if (normalizedRole === "escribano") {
                                    roleTitle = "Escribanos";
                                    colorClasses = "bg-amber-50/40 border-amber-100 text-amber-850";
                                    bgHoverClasses = "hover:bg-amber-50 hover:border-amber-300";
                                    progressColor = "bg-amber-650";
                                  }

                                  return (
                                    <button
                                      key={role}
                                      type="button"
                                      onClick={() => {
                                        setActiveFormGroup({ reqId: rId, role });
                                        setActiveFormTab(0);
                                      }}
                                      className={`p-4.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer shadow-3xs group ${colorClasses} ${bgHoverClasses}`}
                                    >
                                      <div className="w-full">
                                        <div className="flex items-center justify-between mb-2">
                                          <div className="flex items-center gap-1.5">
                                            <div className="p-1.5 bg-white rounded-lg shadow-4xs group-hover:scale-105 transition-transform">
                                              <Users className="h-3.5 w-3.5" />
                                            </div>
                                            <span className="font-display font-bold text-xs tracking-tight text-slate-800">
                                              {roleTitle}
                                            </span>
                                          </div>
                                          {isAllComplete ? (
                                            <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md uppercase font-mono">
                                              Listo ✓
                                            </span>
                                          ) : (
                                            <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-md uppercase font-mono animate-pulse">
                                              Pendiente
                                            </span>
                                          )}
                                        </div>

                                        <p className="text-[10px] text-slate-500 mb-3 leading-relaxed">
                                          Registrar los datos de {roleTitle.toLowerCase()} para este {translations.caseSingular.toLowerCase()}.
                                        </p>
                                      </div>

                                      <div className="w-full space-y-1.5 mt-auto">
                                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 font-mono">
                                          <span>Completados</span>
                                          <span>{completedCount} de {totalCount}</span>
                                        </div>
                                        <div className="w-full bg-slate-200/60 h-1 rounded-full overflow-hidden">
                                          <div
                                            className={`h-full rounded-full transition-all duration-300 ${progressColor}`}
                                            style={{ width: `${(completedCount/totalCount)*100}%` }}
                                          />
                                        </div>
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-650 group-hover:translate-x-1 transition-transform pt-1">
                                          <span>Ver / Completar</span>
                                          <ArrowRight className="h-3 w-3" />
                                        </div>
                                      </div>
                                    </button>
                                  );
                                });
                              })()}
                            </div>
                          ) : (
                            /* Fallback legacy single form behavior if case is old or has no party instances */
                            task && task.status === "COMPLETA" ? (
                              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 text-xs">
                                <div className="flex items-center justify-between mb-2.5 border-b border-slate-150 pb-2">
                                  <span className="font-bold text-teal-800">Formulario Completado ✓</span>
                                  <span className="text-[9px] text-slate-400 font-mono">Por {task.completedBy}</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white p-3 rounded-xl border border-slate-200/50">
                                  {Object.entries(task.formValues || {}).map(([key, value]) => (
                                    <p key={key} className="text-[10px] leading-relaxed">
                                      <b className="font-semibold text-slate-400 uppercase text-[9px] font-mono tracking-wider block mb-0.5">{key}:</b> 
                                      <span className="text-slate-900 font-medium">{String(value)}</span>
                                    </p>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              status !== "FINALIZADO" && (
                                <div className="bg-slate-50 p-4 border border-slate-200 rounded-2xl space-y-3 text-left">
                                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Ingreso de Datos Obligatorios</p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {(req.formFields || []).map((field: any) => (
                                      <div key={field.name}>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                          {field.label} {field.required && "*"}
                                        </label>
                                        <input
                                          type={field.type === "number" ? "number" : "text"}
                                          required={field.required}
                                          value={tempFormValues[rId]?.[field.name] || ""}
                                          onChange={(e) => updateFormValue(rId, field.name, e.target.value)}
                                          placeholder={`Completar...`}
                                          className="w-full border border-slate-200/85 rounded-xl px-3 py-2 text-xs bg-white text-slate-900 focus:outline-hidden focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 font-medium transition-all"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                  <button
                                    onClick={() => submitFormRequirement(rId)}
                                    className="w-full py-2 text-[11px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl mt-3 cursor-pointer shadow-xs focus:ring-4 focus:ring-indigo-600/10"
                                  >
                                    Guardar Formulario
                                  </button>
                                </div>
                              )
                            )
                          )}
                        </div>
                      )}

                      {/* TASK Requirement Details */}
                      {type === "TASK" && (
                        <div className="flex items-center gap-2">
                          {task && task.status === "COMPLETA" ? (
                            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl px-3.5 py-2 text-xs font-bold">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              <span>Completada</span>
                              {status !== "FINALIZADO" && (
                                <button
                                  onClick={() => onToggleTask(id, rId, "PENDIENTE")}
                                  className="text-[10px] underline text-emerald-900 ml-3 hover:no-underline font-bold uppercase tracking-wider cursor-pointer"
                                >
                                  Deshacer
                                </button>
                              )}
                            </div>
                          ) : (
                            status !== "FINALIZADO" && (
                              <button
                                id={`btn-complete-task-${rId}`}
                                onClick={() => onToggleTask(id, rId, "COMPLETA")}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl cursor-pointer transition-all shadow-xs flex items-center gap-1.5"
                              >
                                <span>Marcar Realizada ✓</span>
                              </button>
                            )
                          )}
                        </div>
                      )}

                    </div>
                  )}

                  {/* SUB-PANEL: Manager requests notice (SOLICITADO) */}
                  {type === "DOCUMENT" && currentUser.role !== "ASESOR" && req.uploadRequestStatus === "SOLICITADO" && (
                    <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2 mt-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] font-bold text-amber-800 flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                          El asesor solicita permiso para subir documento en este requisito.
                        </span>
                        <button
                          onClick={() => {
                            setConfiguringReqId(rId);
                            setLimitMaxCount(req.uploadConfig?.maxCount || 1);
                            setLimitFileType(req.uploadConfig?.fileType || "all");
                            setLimitMaxWeight(req.uploadConfig?.maxWeight || 5);
                            setLimitEnabled(true);
                          }}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] rounded-lg cursor-pointer shrink-0"
                        >
                          Aprobar y Configurar
                        </button>
                      </div>
                      {req.uploadRequestReason && (
                        <div className="p-2 bg-white rounded-lg border border-amber-100 text-xs text-slate-700">
                          <span className="font-bold text-slate-500 text-[9px] uppercase block mb-0.5">Motivo / Especificación de subida:</span>
                          "{req.uploadRequestReason}"
                        </div>
                      )}
                    </div>
                  )}

                  {/* SUB-PANEL: Limits Config Form */}
                  {type === "DOCUMENT" && configuringReqId === rId && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 mt-2">
                      <h5 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider font-mono">Parámetros de Subida Documental</h5>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Permiso de Subida</label>
                          <select 
                            value={limitEnabled ? "true" : "false"}
                            onChange={(e) => setLimitEnabled(e.target.value === "true")}
                            className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
                          >
                            <option value="true">Habilitado</option>
                            <option value="false">Inhabilitado / Bloqueado</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Formato Exigido</label>
                          <select 
                            value={limitFileType}
                            onChange={(e) => setLimitFileType(e.target.value)}
                            className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
                          >
                            <option value="all">Cualquiera (PDF/Img/Word)</option>
                            <option value="pdf">Solo PDF (.pdf)</option>
                            <option value="image">Imágenes (PNG/JPG)</option>
                            <option value="word">Word (.doc, .docx)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Peso Máximo</label>
                          <select 
                            value={limitMaxWeight}
                            onChange={(e) => setLimitMaxWeight(Number(e.target.value))}
                            className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
                          >
                            <option value="2">2 MB</option>
                            <option value="5">5 MB</option>
                            <option value="10">10 MB</option>
                            <option value="20">20 MB</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setConfiguringReqId(null)}
                          className="px-3 py-1.5 border border-slate-200 text-slate-600 text-[10px] font-bold rounded-lg bg-white hover:bg-slate-50 cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveUploadConfig(rId)}
                          className="px-3 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-lg hover:bg-slate-800 cursor-pointer"
                        >
                          Guardar Configuración
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Widget de Alta o Baja de Formulario/Parte (Asesores) */}
                  {rName === "Copias de DNI de las Partes" && currentUser.role === "ASESOR" && status !== "FINALIZADO" && (
                    <div className="mt-4 p-4.5 bg-indigo-50/20 border border-indigo-150/80 rounded-2xl space-y-3 text-left">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-indigo-650" />
                        <span className="text-xs font-bold text-slate-800">Solicitar Alta o Baja de Participantes / Formularios</span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-normal">
                        Si falta o sobra algún comprador, vendedor, garante, escribano u otro participante, solicite la alta o baja completando los datos a continuación:
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Acción Solicitada</label>
                          <select
                            value={reqPartAction}
                            onChange={(e) => setReqPartAction(e.target.value as "ADD" | "REMOVE")}
                            className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-medium"
                          >
                            <option value="ADD">Solicitar ALTA (Agregar)</option>
                            <option value="REMOVE">Solicitar BAJA (Quitar)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Rol / Tipo de Parte</label>
                          <select
                            value={reqPartRole}
                            onChange={(e) => {
                              setReqPartRole(e.target.value);
                              if (e.target.value !== "otro") {
                                setReqPartCustomRole("");
                              }
                            }}
                            className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-medium"
                          >
                            <option value="comprador">Comprador</option>
                            <option value="vendedor">Vendedor</option>
                            <option value="garante">Garante</option>
                            <option value="escribano">Escribano</option>
                            <option value="otro">Otro (Especificar)</option>
                          </select>
                        </div>

                        {reqPartRole === "otro" && (
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Especificar Rol</label>
                            <input
                              type="text"
                              value={reqPartCustomRole}
                              onChange={(e) => setReqPartCustomRole(e.target.value)}
                              placeholder="Ej: Escribano suplente, etc."
                              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-medium"
                            />
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Campo de Aclaración Específica (Para el Manager/Admin)</label>
                        <textarea
                          rows={2.5}
                          value={reqPartDetails}
                          onChange={(e) => setReqPartDetails(e.target.value)}
                          placeholder="Ej: Faltan agregar 2 vendedores ya que hay dos firmas en la escritura, o remover 1 comprador..."
                          className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-4 focus:ring-indigo-500/10"
                        />
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={handleSendPartAdjustment}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-3xs"
                        >
                          <Send className="h-3.5 w-3.5" />
                          Enviar Solicitud
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>

          {/* Rejection comment form overlay */}
          {rejectingReqId && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl space-y-3 animate-in fade-in duration-200">
              <h5 className="text-xs font-bold text-red-900">Motivo del Rechazo de Documento</h5>
              <p className="text-[11px] text-red-700 -mt-2">
                Explique con claridad qué anomalía impide aprobar el documento. Se notificará al asesor y se creará una observación.
              </p>
              <textarea
                rows={2}
                placeholder="Ej: Las firmas de la foja 3 salieron recortadas o la resolución es muy baja..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-900"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setRejectingReqId(null)}
                  className="px-3 py-1.5 border border-slate-200 text-slate-700 text-[11px] font-semibold rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (!rejectReason) {
                      alert("El motivo es obligatorio.");
                      return;
                    }
                    onRejectDocument(id, rejectingReqId, rejectReason);
                    setRejectingReqId(null);
                  }}
                  className="px-3 py-1.5 bg-red-650 bg-red-600 hover:bg-red-700 text-white text-[11px] font-extrabold rounded-lg cursor-pointer"
                >
                  Registrar Rechazo
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* PARTICIPANTS TAB */}
      {activeTab === "participants" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-slate-500 font-mono uppercase">Participantes e Integrantes del Expediente</h3>
            {status !== "FINALIZADO" && canIntervene && (
              <button
                onClick={() => setShowPartForm(!showPartForm)}
                className="inline-flex items-center gap-1 bg-slate-950 hover:bg-slate-900 text-white text-xs font-bold px-3 py-2 rounded-lg cursor-pointer"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Añadir Participante
              </button>
            )}
          </div>

          {/* Add participant form overlay */}
          {showPartForm && (
            <form onSubmit={handleAddParticipantSubmit} className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-4 animate-in slide-in-from-top-1.5 duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">Rol en el Expediente</label>
                  <select
                    value={partRole}
                    onChange={(e) => setPartRole(e.target.value)}
                    className="w-full border border-slate-200 rounded p-1.5 text-xs bg-white text-slate-900"
                  >
                    <option value="Cliente">Cliente principal</option>
                    <option value="Comprador">Comprador</option>
                    <option value="Vendedor">Vendedor</option>
                    <option value="Garante">Garante Fiador</option>
                    <option value="Apoderado">Apoderado</option>
                    <option value="Escribano">Escribano / Intermediario</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">Nombre</label>
                  <input
                    type="text"
                    required
                    value={partName}
                    onChange={(e) => setPartName(e.target.value)}
                    className="w-full border border-slate-200 rounded p-1.5 text-xs bg-white text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">Apellido</label>
                  <input
                    type="text"
                    required
                    value={partApellido}
                    onChange={(e) => setPartApellido(e.target.value)}
                    className="w-full border border-slate-200 rounded p-1.5 text-xs bg-white text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">DNI / Carnet</label>
                  <input
                    type="text"
                    required
                    placeholder="Sin puntos, ej: 32444555"
                    value={partDni}
                    onChange={(e) => setPartDni(e.target.value)}
                    className="w-full border border-slate-200 rounded p-1.5 text-xs bg-white text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">CUIT/CUIL</label>
                  <input
                    type="text"
                    placeholder="Ej: 20-32444555-3"
                    value={partCuit}
                    onChange={(e) => setPartCuit(e.target.value)}
                    className="w-full border border-slate-200 rounded p-1.5 text-xs bg-white text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">Email</label>
                  <input
                    type="email"
                    value={partEmail}
                    onChange={(e) => setPartEmail(e.target.value)}
                    className="w-full border border-slate-200 rounded p-1.5 text-xs bg-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={partPhone}
                    onChange={(e) => setPartPhone(e.target.value)}
                    className="w-full border border-slate-200 rounded p-1.5 text-xs bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">Observaciones / Notas adicionales</label>
                <input
                  type="text"
                  placeholder="Ej: Solo responde llamadas por la tarde..."
                  value={partObs}
                  onChange={(e) => setPartObs(e.target.value)}
                  className="w-full border border-slate-200 rounded p-1.5 text-xs bg-white"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowPartForm(false)}
                  className="px-3.5 py-1.5 text-xs border border-slate-205 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs text-white bg-slate-900 hover:bg-slate-800 rounded-lg font-bold cursor-pointer"
                >
                  Guardar Participante
                </button>
              </div>
            </form>
          )}

          {/* Participants Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            {participants.length === 0 ? (
              <p className="text-xs text-slate-400 py-10 text-center">No hay participantes registrados todavía.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-150 text-slate-400 uppercase font-mono font-bold bg-slate-50/50">
                      <th className="py-2.5 px-4">Nombre Completo</th>
                      <th className="py-2.5 px-4">Rol</th>
                      <th className="py-2.5 px-4">DNI / Identificación</th>
                      <th className="py-2.5 px-4">CUIL/CUIT</th>
                      <th className="py-2.5 px-4">Email & Teléfono</th>
                      <th className="py-2.5 px-4">Notas</th>
                      {status !== "FINALIZADO" && <th className="py-2.5 px-4">Acción</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {participants.map((p: Participant) => (
                      <tr key={p.id} className="hover:bg-slate-50/60">
                        <td className="py-3.5 px-4 font-semibold text-slate-900 text-xs whitespace-nowrap">
                          {p.name} {p.apellido}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="bg-slate-100 border border-slate-200 font-bold px-2 py-0.5 rounded-md text-[10px] text-slate-800 uppercase font-mono">
                            {p.role}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-650 truncate max-w-ws">{p.dni}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-650 truncate max-w-ws">{p.cuitCuil || "—"}</td>
                        <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">
                          <div>{p.email || "—"}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{p.telefono || ""}</div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate" title={p.observaciones}>
                          {p.observaciones || "—"}
                        </td>
                        {status !== "FINALIZADO" && canIntervene && (
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <button
                              onClick={() => {
                                if (confirm(`¿Eliminar de legajo a ${p.name} ${p.apellido}?`)) {
                                  onDeleteParticipant(id, p.id);
                                }
                              }}
                              className="text-red-500 hover:text-red-700 cursor-pointer"
                              title="Remover"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* OBSERVATIONS PANEL */}
      {activeTab === "observations" && (
        <div className="space-y-6">
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left list: active feed */}
            <div className="lg:col-span-2 space-y-4">
              <h3 className="text-xs font-bold text-slate-500 font-mono uppercase">Intervenciones y Observaciones Realizadas</h3>

              {observations.length === 0 ? (
                <div className="py-12 text-center bg-white border border-slate-200 rounded-2xl">
                  <MessageSquare className="h-8 w-8 text-slate-300 stroke-1 mx-auto" />
                  <p className="text-xs font-medium text-slate-500 mt-2">No hay observaciones u objeciones sobre este expediente.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {observations.map((obs: Observation) => {
                    const linkedDoc = requirements.find((r: any) => r.document && r.document.id === obs.entityId);
                    
                    return (
                      <div key={obs.id} className={`border p-4 rounded-2xl shadow-xs relative ${
                        obs.status === "ABIERTA" 
                          ? "bg-amber-50/55 border-amber-250 ring-1 ring-amber-100" 
                          : "bg-emerald-50/30 border-emerald-150 text-slate-700"
                      }`}>
                        
                        {/* Header line context */}
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-805">
                              {obs.authorName} (Manager)
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(obs.createdAt).toLocaleString()}
                            </span>
                          </div>

                          <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 border rounded-full ${
                            obs.status === "ABIERTA" ? "bg-amber-100 text-amber-800 border-amber-350" : "bg-emerald-100 text-emerald-800 border-emerald-3D0"
                          }`}>
                            {obs.status === "ABIERTA" ? "ABIERTA ⌛" : "CORREGIDA ✓"}
                          </span>
                        </div>

                        {/* Objection Message */}
                        <p className="text-xs text-slate-800 mt-2.5 leading-relaxed font-sans font-medium whitespace-pre-line">
                          "{obs.message}"
                        </p>

                        {/* If linked to specific requirement, show context */}
                        {linkedDoc && (
                          <div className="mt-3 inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-1.5 text-[10px] text-slate-500 font-mono font-bold uppercase">
                            <FileText className="h-3.5 w-3.5 text-slate-400" />
                            documento: {linkedDoc.name}
                          </div>
                        )}

                        {/* Action buttons or response display */}
                        {obs.status === "ABIERTA" ? (
                          currentUser.role === "ASESOR" ? (
                            <div className="mt-4 pt-3.5 border-t border-amber-200/60">
                              {replyObsId === obs.id ? (
                                <div className="space-y-2">
                                  <textarea
                                    rows={2}
                                    placeholder="Explique qué medidas correctivas tomó para suplir las observaciones..."
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-950"
                                  />
                                  <div className="flex gap-2 justify-end">
                                    <button
                                      onClick={() => setReplyObsId(null)}
                                      className="px-3 py-1.5 text-[11px] border border-slate-250 rounded-lg hover:bg-slate-100 bg-white"
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      onClick={() => handleResolveObsSubmit(obs.id)}
                                      className="px-3 py-1.5 text-[11px] bg-slate-900 border border-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg"
                                    >
                                      Enviar Respuesta
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setReplyObsId(obs.id)}
                                  className="text-[11px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-100 transition-colors cursor-pointer"
                                >
                                  Responder y Resolver Observación
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="mt-3.5 text-[11px] italic text-amber-800">
                              ⌛ Esperando aclaración o recarga correctiva por parte del Asesor asignado.
                            </div>
                          )
                        ) : (
                          /* Observation is resolved! Show resolution reply details */
                          obs.response && (
                            <div className="mt-3.5 p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl text-xs text-slate-650">
                              <p className="font-bold text-emerald-800 text-[10px] font-mono">RESPUESTA RESOLUTIVA DEL ASESOR:</p>
                              <p className="mt-1 leading-snug italic font-medium text-slate-700">
                                "{obs.response}"
                              </p>
                              {obs.respondedAt && (
                                <p className="text-[9px] text-slate-400 mt-2 font-mono uppercase text-right">
                                  Resuelto el {new Date(obs.respondedAt).toLocaleString()}
                                </p>
                              )}
                            </div>
                          )
                        )}

                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right block: Add general remark (Managers only) */}
            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs self-start">
              <h4 className="font-display font-bold text-slate-900 text-sm mb-3">Registrar Observación General</h4>
              <p className="text-xs text-slate-500 leading-snug mb-4">
                Los Managers pueden asentar notas de auditoría o solicitar correcciones manuales sobre la marcha. Las observaciones bloquean el avance por default.
              </p>
              {currentUser.role !== "ASESOR" && canIntervene ? (
                <form onSubmit={handleAddGeneralObs} className="space-y-3">
                  <textarea
                    rows={3}
                    placeholder="Escriba la especificación del requerimiento que la asesoría debe corregir..."
                    value={newGeneralObs}
                    onChange={(e) => setNewGeneralObs(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-250 bg-white text-slate-900 rounded-lg focus:outline-hidden focus:border-slate-800"
                  />
                  <label className="flex items-center gap-2 cursor-pointer py-1 select-none">
                    <input
                      type="checkbox"
                      checked={bloquearRevision}
                      onChange={(e) => setBloquearRevision(e.target.checked)}
                      className="rounded text-rose-600 focus:ring-rose-500 h-3.5 w-3.5 accent-rose-600"
                    />
                    <span className="text-[11px] font-bold text-slate-700">🚫 Bloquear solicitudes de revisión al asesor</span>
                  </label>
                  <button
                    type="submit"
                    className="w-full py-2 bg-slate-950 text-white font-bold text-xs rounded-lg hover:bg-slate-800 cursor-pointer inline-flex items-center justify-center gap-1.5"
                  >
                    <Send className="h-3 w-3" />
                    Registrar e Investigar
                  </button>
                </form>
              ) : !canIntervene ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 italic text-center">
                  ⚠️ No puedes registrar observaciones en este expediente (vista de lectura).
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border rounded-xl text-[11px] text-slate-400 italic text-center">
                  Solo disponible para administradores y managers.
                </div>
              )}
            </div>

          </div>

        </div>
      )}

      {/* ADJUSTMENTS PANEL */}
      {activeTab === "adjustments" && (
        <div className="space-y-6">
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
            <div>
              <p className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
                <Sliders className="h-4 w-4 text-indigo-600" />
                Gestión Dinámica de Requisitos y Formularios
              </p>
              <p className="text-slate-500 mt-1">
                El asesor puede solicitar agregar o remover participantes/formularios o habilitar subidas específicas de archivos. Todo ajuste debe estar justificado y aprobado por un Manager.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left side: History/List of requests */}
            <div className="lg:col-span-2 space-y-4">
              <h3 className="text-xs font-bold text-slate-500 font-mono uppercase text-left">Historial de Solicitudes de Ajustes</h3>

              {(!caseDetails.adjustmentRequests || caseDetails.adjustmentRequests.length === 0) ? (
                <div className="py-12 text-center bg-white border border-slate-200 rounded-2xl">
                  <Sliders className="h-8 w-8 text-slate-300 stroke-1 mx-auto" />
                  <p className="text-xs font-medium text-slate-500 mt-2">No se han registrado solicitudes de ajuste en este expediente.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {[...caseDetails.adjustmentRequests].reverse().map((req: any) => (
                    <div 
                      key={req.id} 
                      className={`border p-4 rounded-2xl shadow-xs relative transition-all bg-white text-left ${
                        req.status === "PENDIENTE" ? "border-amber-250 bg-amber-50/10" :
                        req.status === "APROBADO" ? "border-emerald-200 bg-emerald-50/10" :
                        "border-slate-200 bg-slate-50/50"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-800">
                              {req.requestedByName || "Asesor"}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(req.createdAt).toLocaleString()}
                            </span>
                          </div>

                          <div className="text-xs mt-1 text-slate-700 font-medium">
                            <span className="font-bold text-indigo-700 uppercase font-mono text-[9px] bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded mr-1.5">
                              {req.type === "FORM_COUNT" ? "Ajuste de Formulario" : "Subida de Archivo"}
                            </span>
                            {req.details}
                          </div>
                        </div>

                        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 border rounded-full font-mono ${
                          req.status === "PENDIENTE" ? "bg-amber-100 text-amber-800 border-amber-300" :
                          req.status === "APROBADO" ? "bg-emerald-100 text-emerald-800 border-emerald-300" :
                          "bg-rose-100 text-rose-800 border-rose-300"
                        }`}>
                          {req.status === "PENDIENTE" ? "PENDIENTE ⌛" : req.status === "APROBADO" ? "APROBADO ✓" : "RECHAZADO ✕"}
                        </span>
                      </div>

                      {/* Details of processor response */}
                      {req.status !== "PENDIENTE" && (
                        <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
                          <p className="font-semibold text-slate-700">
                            Procesado por {req.processedByName || "Manager"} el {req.processedAt ? new Date(req.processedAt).toLocaleString() : ""}
                          </p>
                          {req.status === "RECHAZADO" && req.rejectionReason && (
                            <p className="mt-1 text-rose-700 bg-rose-50 border border-rose-150 rounded p-2 italic">
                              Motivo de rechazo: "{req.rejectionReason}"
                            </p>
                          )}
                        </div>
                      )}

                      {/* Manager action controls (if PENDIENTE and user is Manager/Admin) */}
                      {req.status === "PENDIENTE" && currentUser.role !== "ASESOR" && (
                        <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end gap-2">
                          {rejectionAdjId === req.id ? (
                            <div className="w-full space-y-2">
                              <textarea
                                value={rejectionReasonText}
                                onChange={(e) => setRejectionReasonText(e.target.value)}
                                placeholder="Escriba el motivo del rechazo aquí..."
                                className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white"
                                rows={2}
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setRejectionAdjId(null);
                                    setRejectionReasonText("");
                                  }}
                                  className="px-3 py-1 text-[11px] border border-slate-200 rounded-lg bg-white"
                                >
                                  Cancelar
                                </button>
                                <button
                                  onClick={() => {
                                    if (onRejectAdjustmentRequest) {
                                      onRejectAdjustmentRequest(caseDetails.id, req.id, rejectionReasonText || "No cumple los criterios.");
                                    }
                                    setRejectionAdjId(null);
                                    setRejectionReasonText("");
                                  }}
                                  className="px-3 py-1 text-[11px] bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg"
                                >
                                  Confirmar Rechazo
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setRejectionAdjId(req.id);
                                  setRejectionReasonText("");
                                }}
                                className="px-3 py-1 text-[11px] border border-slate-200 hover:bg-rose-50 hover:text-rose-700 text-slate-600 font-semibold rounded-lg cursor-pointer"
                              >
                                Rechazar
                              </button>
                              <button
                                onClick={() => {
                                  if (onApproveAdjustmentRequest) {
                                    onApproveAdjustmentRequest(caseDetails.id, req.id);
                                  }
                                }}
                                className="px-3 py-1 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer shadow-xs"
                              >
                                Aprobar y Ejecutar
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right side: Request Form (Advisor only or editable) */}
            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs self-start space-y-4">
              <div>
                <h4 className="font-display font-bold text-slate-900 text-sm text-left">Nueva Solicitud de Ajuste</h4>
                <p className="text-xs text-slate-400 mt-1 text-left">Complete los detalles para solicitar cambios en los requisitos del expediente.</p>
              </div>

              {currentUser.role === "ASESOR" ? (
                <form onSubmit={handleCreateAdjustmentSubmit} className="space-y-4 text-xs text-slate-700 text-left">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tipo de Ajuste</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAdjType("FORM_COUNT")}
                        className={`py-2 px-3 border rounded-xl text-center font-semibold cursor-pointer transition-all ${
                          adjType === "FORM_COUNT" 
                            ? "border-slate-950 bg-slate-950 text-white shadow-sm" 
                            : "border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                        }`}
                      >
                        Formulario
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdjType("DOCUMENT_UPLOAD")}
                        className={`py-2 px-3 border rounded-xl text-center font-semibold cursor-pointer transition-all ${
                          adjType === "DOCUMENT_UPLOAD" 
                            ? "border-slate-950 bg-slate-950 text-white shadow-sm" 
                            : "border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                        }`}
                      >
                        Subida de Archivo
                      </button>
                    </div>
                  </div>

                  {adjType === "FORM_COUNT" ? (
                    <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Acción</label>
                        <select
                          value={adjAction}
                          onChange={(e: any) => setAdjAction(e.target.value)}
                          className="w-full p-2 border border-slate-200 bg-white rounded-lg text-xs"
                        >
                          <option value="ADD">Agregar (+)</option>
                          <option value="REMOVE">Remover (-)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Formulario de Rol</label>
                        <select
                          value={adjTargetParty}
                          onChange={(e: any) => setAdjTargetParty(e.target.value)}
                          className="w-full p-2 border border-slate-200 bg-white rounded-lg text-xs"
                        >
                          <option value="vendedores">Vendedores (Propietarios)</option>
                          <option value="compradores">Compradores</option>
                          <option value="garantes">Garantes</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Cantidad</label>
                        <input
                          type="number"
                          min={1}
                          max={5}
                          value={adjQuantity}
                          onChange={(e) => setAdjQuantity(Math.max(1, Number(e.target.value)))}
                          className="w-full p-2 border border-slate-200 bg-white rounded-lg text-xs"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Requisito de Documento</label>
                        <select
                          value={adjRequirementId}
                          onChange={(e) => setAdjRequirementId(e.target.value)}
                          className="w-full p-2 border border-slate-200 bg-white rounded-lg text-xs"
                        >
                          <option value="">-- Seleccionar Requisito --</option>
                          {requirements
                            .filter((r: any) => r.type === "DOCUMENT")
                            .map((r: any) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Detalle / Justificación</label>
                    <textarea
                      rows={3}
                      value={adjDetails}
                      onChange={(e) => setAdjDetails(e.target.value)}
                      placeholder={
                        adjType === "FORM_COUNT"
                          ? "Ej: Faltan agregar 2 vendedores ya que hay dos firmas en la escritura, o remover 1 comprador..."
                          : "Ej: Se necesita subir el DNI del cónyuge ya que está casado bajo régimen ganancial..."
                      }
                      className="w-full p-2 border border-slate-250 bg-white rounded-lg text-xs text-slate-900 focus:outline-hidden"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Send className="h-3 w-3" />
                    Enviar Solicitud
                  </button>
                </form>
              ) : (
                <div className="p-3 bg-slate-50 border rounded-xl text-[11px] text-slate-500 text-center italic">
                  Las solicitudes de ajuste son creadas únicamente por los asesores. Como Manager, tienes el rol de evaluar, aprobar y ejecutar o rechazar estas solicitudes desde el panel izquierdo.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Case settings / Assignments overlay */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <form onSubmit={handleSaveSettings} className="bg-white border text-slate-900 border-slate-200 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative animate-in zoom-in-95 duration-200">
            <h3 className="font-display font-bold text-base mb-2">Editar Metadatos del {translations.caseSingular}</h3>
            <p className="text-xs text-slate-400 mb-4">Cambie el título comercial o reasigne {translations.casePlural.toLowerCase()} para balancear cargas.</p>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Título de la Carpeta</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Cuerpo / Descripción</label>
                <textarea
                  rows={2}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">{translations.advisorSingular} Asignado Responsable</label>
                <select
                  value={editAdvisorId}
                  onChange={(e) => setEditAdvisorId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white text-slate-900"
                >
                  {allUsers.filter(u => u.role === "ASESOR").map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>

              {currentUser.role === "ADMIN" && (
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Manager Asignado Responsable</label>
                  <select
                    value={editManagerId}
                    onChange={(e) => setEditManagerId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white text-slate-900"
                  >
                    <option value="unassigned">Sin asignar / En cola</option>
                    {allUsers.filter(u => u.role === "MANAGER").map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Cantidad de personas por parte editable */}
              {(currentUser.role === "ADMIN" || currentUser.role === "MANAGER") && (
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-2">
                  <label className="text-[10px] font-bold text-slate-600 uppercase block">Cantidad de Personas por Parte (Formularios)</label>
                  <p className="text-[9px] text-slate-400">Si modifica estos valores, se sincronizarán y crearán/eliminarán los formularios individuales correspondientes para este legajo.</p>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div>
                      <label className="text-[9px] font-semibold text-slate-500 block mb-0.5">Compradores</label>
                      <input
                        type="number"
                        min="0"
                        value={editCompradores}
                        onChange={(e) => setEditCompradores(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full border border-slate-200 rounded p-1 text-xs bg-white text-slate-900 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-semibold text-slate-500 block mb-0.5">Vendedores</label>
                      <input
                        type="number"
                        min="0"
                        value={editVendedores}
                        onChange={(e) => setEditVendedores(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full border border-slate-200 rounded p-1 text-xs bg-white text-slate-900 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-semibold text-slate-500 block mb-0.5">Garantes</label>
                      <input
                        type="number"
                        min="0"
                        value={editGarantes}
                        onChange={(e) => setEditGarantes(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full border border-slate-200 rounded p-1 text-xs bg-white text-slate-900 font-semibold"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Custom In-App Deletion Confirmation Card */}
            {showDeleteConfirm && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl space-y-3 animate-in slide-in-from-top-4 duration-200">
                <div className="flex gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
                  <div>
                    <h4 className="font-bold text-red-800 text-xs">¿Confirmar eliminación definitiva del expediente?</h4>
                    <p className="text-[10px] text-red-600 mt-1 leading-relaxed">
                      Esta acción eliminará todos los documentos, tareas, participantes, comentarios, observaciones e historial de auditoría de este expediente de forma irreversible para todos los usuarios.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 text-[10px] font-semibold rounded hover:bg-slate-50 cursor-pointer"
                  >
                    No, mantener expediente
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const response = await fetch(`/api/cases/${id}`, {
                          method: "DELETE"
                        });
                        if (response.ok) {
                          setShowSettings(false);
                          setShowDeleteConfirm(false);
                          alert("Expediente eliminado con éxito.");
                          onBack();
                        } else {
                          const err = await response.json();
                          alert(err.message || "Error al eliminar el expediente.");
                        }
                      } catch (err) {
                        console.error("Error deleting case:", err);
                        alert("Error de conexión al eliminar el expediente.");
                      }
                    }}
                    className="px-2.5 py-1.5 bg-red-600 text-white text-[10px] font-bold rounded hover:bg-red-700 cursor-pointer"
                  >
                    Sí, eliminar definitivamente
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-100 gap-2">
              {(currentUser.role === "ADMIN" || currentUser.role === "MANAGER") ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-3 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </button>
              ) : <div />}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 text-xs rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={showDeleteConfirm}
                  className={`px-4 py-2 bg-slate-950 text-white text-xs font-bold rounded-lg hover:bg-slate-900 cursor-pointer ${showDeleteConfirm ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  Guardar Modificaciones
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* SOLICITAR REVISIÓN MODAL */}
      {showReviewRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white border text-slate-900 border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowReviewRequestModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer font-bold text-lg p-1"
            >
              ✕
            </button>
            
            <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider font-mono">
              Solicitud de Control de Calidad
            </p>
            <h3 className="font-display font-black text-lg text-slate-900 mt-0.5">
              Solicitar Revisión de Etapa
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              ¿Qué modalidad de revisión desea enviar a su Manager/Director asignado para la etapa actual?
            </p>

            {reviewError && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                ⚠️ {reviewError}
              </div>
            )}

            <div className="mt-6 space-y-4">
              {/* Opción 1: Solo revisión */}
              <div
                className={`p-4 border rounded-xl transition-all ${
                  reviewStatus === "APROBACION_SOLICITADA"
                    ? "opacity-40 bg-slate-50 border-slate-200 cursor-not-allowed"
                    : reviewStatus === "REVISION_SOLICITADA"
                    ? "border-amber-300 bg-amber-50/20"
                    : "border-slate-200 hover:border-slate-800 hover:bg-slate-50 cursor-pointer"
                }`}
                onClick={() => {
                  if (reviewStatus !== "REVISION_SOLICITADA" && reviewStatus !== "APROBACION_SOLICITADA" && !isRequestingReview) {
                    handleRequestReviewSubmit("REVISION_SOLA");
                  }
                }}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-xs text-slate-900 font-sans flex items-center gap-1.5">
                    Solo Revisión Simple 🔍
                    {reviewStatus === "REVISION_SOLICITADA" && (
                      <span className="animate-pulse inline-block w-2 h-2 rounded-full bg-amber-500" />
                    )}
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    reviewStatus === "REVISION_SOLICITADA"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-100 text-slate-700"
                  }`}>
                    {reviewStatus === "REVISION_SOLICITADA" ? "Solicitada" : "Manual"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  El manager verificará la etapa para encontrar observaciones. No avanzará automáticamente al finalizar; deberás avanzar manualmente cuando esté todo conforme.
                </p>

                {reviewStatus === "REVISION_SOLICITADA" && (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      disabled={isRequestingReview}
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent triggering outer container click
                        handleCancelReviewSubmit();
                      }}
                      className="px-3 py-1 text-[11px] font-bold bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <span>✕ Cancelar Solicitud</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Opción 2: Revisión + Aprobación */}
              <div
                className={`p-4 border rounded-xl transition-all ${
                  reviewStatus === "REVISION_SOLICITADA"
                    ? "opacity-40 bg-slate-50 border-slate-200 cursor-not-allowed"
                    : reviewStatus === "APROBACION_SOLICITADA"
                    ? "border-indigo-300 bg-indigo-50/20"
                    : "border-indigo-100 hover:border-indigo-600 hover:bg-indigo-50/40 cursor-pointer"
                }`}
                onClick={() => {
                  if (reviewStatus !== "REVISION_SOLICITADA" && reviewStatus !== "APROBACION_SOLICITADA" && !isRequestingReview) {
                    handleRequestReviewSubmit("REVISION_Y_APROBACION");
                  }
                }}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-xs text-indigo-850 font-sans flex items-center gap-1.5">
                    Revisión y Aprobación Automática ⚡
                    {reviewStatus === "APROBACION_SOLICITADA" && (
                      <span className="animate-pulse inline-block w-2 h-2 rounded-full bg-indigo-500" />
                    )}
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    reviewStatus === "APROBACION_SOLICITADA"
                      ? "bg-indigo-100 text-indigo-800"
                      : "bg-slate-100 text-slate-700"
                  }`}>
                    {reviewStatus === "APROBACION_SOLICITADA" ? "Solicitada" : "Automático"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Si el manager aprueba, el sistema dará por superada la etapa y avanzará al expediente a la siguiente etapa de forma 100% automática.
                </p>

                {reviewStatus === "APROBACION_SOLICITADA" && (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      disabled={isRequestingReview}
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent triggering outer container click
                        handleCancelReviewSubmit();
                      }}
                      className="px-3 py-1 text-[11px] font-bold bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <span>✕ Cancelar Solicitud</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => setShowReviewRequestModal(false)}
                disabled={isRequestingReview}
                className="px-3.5 py-1.5 text-xs font-bold border border-slate-250 hover:bg-slate-100 bg-white text-slate-700 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CASE AUDIT HISTORY MODAL */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white border text-slate-900 border-slate-200 rounded-2xl p-6 w-full max-w-4xl max-h-[85vh] overflow-y-auto shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start border-b border-slate-100 pb-4 mb-4">
              <div>
                <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider font-mono">Panel de Auditoría de Expediente</p>
                <h3 className="font-display font-black text-lg text-slate-900">
                  Historial Cronológico de Actividades
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  Expediente: <b className="font-bold text-slate-800 font-sans">{code}</b> — {title}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={exportHistoryToCSV}
                  disabled={!historyData || loadingHistory}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Descargar CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowHistoryModal(false)}
                  className="px-3 py-1.5 border border-slate-200 text-slate-700 text-xs rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>

            {loadingHistory ? (
              <div className="py-20 text-center">
                <Clock className="h-8 w-8 text-indigo-500 animate-spin mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-500">Recopilando logs y calculando tiempos de etapas...</p>
              </div>
            ) : !historyData ? (
              <div className="py-10 text-center text-slate-400 text-xs">
                No se pudo cargar la información histórica.
              </div>
            ) : (
              <div className="space-y-6">
                
                {/* PART 1: STAGE PROGRESSION & DURATIONS */}
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-indigo-500" />
                    <span>Tiempo de Permanencia por Etapa</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {historyData.stageHistory && historyData.stageHistory.map((sh: any, index: number) => {
                      const isActive = sh.exitedAt === null;
                      return (
                        <div 
                          key={index} 
                          className={`p-3.5 rounded-xl border transition-all ${
                            isActive 
                              ? "bg-amber-50/50 border-amber-200 ring-2 ring-amber-100" 
                              : "bg-slate-50/50 border-slate-200"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                              Etapa {index + 1} {isActive && "• Activa"}
                            </span>
                            <span className={`h-2 w-2 rounded-full ${isActive ? "bg-amber-500 animate-pulse" : "bg-slate-400"}`} />
                          </div>
                          <h5 className="text-xs font-bold text-slate-800 mt-1 truncate">{sh.stageName}</h5>
                          <div className="mt-2.5 space-y-1 text-[11px] text-slate-600">
                            <p className="flex justify-between">
                              <span className="text-slate-400">Ingreso:</span>
                              <span className="font-medium text-slate-700">{new Date(sh.enteredAt).toLocaleString()}</span>
                            </p>
                            <p className="flex justify-between">
                              <span className="text-slate-400">Egreso:</span>
                              <span className="font-medium text-slate-700">
                                {sh.exitedAt ? new Date(sh.exitedAt).toLocaleString() : "En progreso..."}
                              </span>
                            </p>
                            <p className="flex justify-between border-t border-slate-100 pt-1.5 mt-1.5 font-bold text-slate-800">
                              <span>Duración:</span>
                              <span className="text-indigo-600 font-mono">{sh.durationText}</span>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* PART 2: ADVISOR ACCESS HISTORY */}
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-emerald-500" />
                    <span>Control de Conexiones del Asesor</span>
                  </h4>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 max-h-40 overflow-y-auto">
                    {historyData.advisorLogins && historyData.advisorLogins.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {historyData.advisorLogins.map((login: any) => (
                          <div key={login.id} className="flex items-center justify-between text-[11px] bg-white border border-slate-150 p-2 rounded-lg shadow-2xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                              <span className="font-medium text-slate-700 truncate">Sesión Iniciada</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                              {new Date(login.createdAt).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic text-center py-4">No se registran inicios de sesión de este asesor en la base de datos histórica.</p>
                    )}
                  </div>
                </div>

                {/* PART 3: DETAILED ACTION AUDIT TRAIL */}
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <History className="h-4 w-4 text-slate-400" />
                      <span>Trazabilidad Completa (Acción por Acción)</span>
                    </h4>
                    <input
                      type="text"
                      placeholder="Filtrar por acción, usuario o detalle..."
                      value={historySearchQuery}
                      onChange={(e) => setHistorySearchQuery(e.target.value)}
                      className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs bg-white text-slate-900 w-full sm:w-64"
                    />
                  </div>

                  <div className="border border-slate-250/60 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100/80 border-b border-slate-200 text-[9px] font-bold text-slate-500 uppercase tracking-wider sticky top-0 backdrop-blur-md z-10">
                          <th className="p-2.5">Fecha y Hora</th>
                          <th className="p-2.5">Usuario</th>
                          <th className="p-2.5">Rol</th>
                          <th className="p-2.5">Acción</th>
                          <th className="p-2.5">Descripción Detallada</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 bg-white">
                        {(() => {
                          const filtered = (historyData.allLogs || []).filter((log: any) => {
                            const query = historySearchQuery.toLowerCase().trim();
                            if (!query) return true;
                            return (
                              (log.userName || "").toLowerCase().includes(query) ||
                              (log.userRole || "").toLowerCase().includes(query) ||
                              (log.action || "").toLowerCase().includes(query) ||
                              (log.description || "").toLowerCase().includes(query)
                            );
                          });

                          if (filtered.length === 0) {
                            return (
                              <tr>
                                <td colSpan={5} className="p-6 text-center text-slate-400 italic">
                                  No se encontraron registros que coincidan con la búsqueda.
                                </td>
                              </tr>
                            );
                          }

                          return filtered.map((log: any) => {
                            let actionColor = "bg-slate-100 text-slate-700";
                            if (log.action.includes("APPROVED") || log.action.includes("SUCCESS")) actionColor = "bg-emerald-50 text-emerald-700 border border-emerald-200";
                            else if (log.action.includes("REJECTED") || log.action.includes("DELETED")) actionColor = "bg-rose-50 text-rose-700 border border-rose-200";
                            else if (log.action.includes("CREATED")) actionColor = "bg-sky-50 text-sky-700 border border-sky-200";
                            else if (log.action.includes("STAGE")) actionColor = "bg-indigo-50 text-indigo-700 border border-indigo-200";
                            else if (log.action.includes("LOGIN")) actionColor = "bg-teal-50 text-teal-700 border border-teal-200";

                            return (
                              <tr key={log.id} className="hover:bg-slate-50/50">
                                <td className="p-2.5 font-mono text-[10px] text-slate-500 whitespace-nowrap">
                                  {new Date(log.createdAt).toLocaleString()}
                                </td>
                                <td className="p-2.5 font-semibold text-slate-800">
                                  {log.userName || "Sistema"}
                                </td>
                                <td className="p-2.5">
                                  <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-slate-150/70 text-slate-600 uppercase">
                                    {log.userRole || "ADMIN"}
                                  </span>
                                </td>
                                <td className="p-2.5">
                                  <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase ${actionColor}`}>
                                    {log.action}
                                  </span>
                                </td>
                                <td className="p-2.5 text-slate-600">
                                  {log.description}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      )}

      {/* STAGE AND PIPELINE MANAGEMENT MODAL */}
      {showStageManagement && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white text-slate-950 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Sliders className="h-5 w-5 text-indigo-600" />
                <div>
                  <h3 className="font-display font-bold text-slate-900 text-base leading-tight">
                    Gestión de Flujo y Etapas
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">
                    Configure el pipeline del expediente, añada etapas o configure sus requisitos.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowStageManagement(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Content Scroll Area */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">
              {/* Configuration Section */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3.5">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Control del Flujo del Pipeline
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      Método de Determinación de Etapas
                    </label>
                    <select
                      value={managedStagesDetermined ? "fixed" : "dynamic"}
                      onChange={(e) => setManagedStagesDetermined(e.target.value === "fixed")}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white text-slate-900 focus:outline-hidden font-semibold cursor-pointer"
                    >
                      <option value="fixed">Establecer total de etapas de inicio (Ej: "total 4 etapas")</option>
                      <option value="dynamic">Determinar etapas sobre la marcha (Ej: "a determinar")</option>
                    </select>
                  </div>
                  <div className="text-[11px] text-slate-500 leading-relaxed flex items-center">
                    {managedStagesDetermined ? (
                      <p>
                        ✓ <strong>Establecer de inicio:</strong> El asesor sabrá exactamente el número total de etapas necesarias para finalizar. Se puede editar el listado en cualquier momento.
                      </p>
                    ) : (
                      <p>
                        ✓ <strong>Determinar sobre la marcha:</strong> El asesor verá la leyenda "a determinar" en el contador. Podrá completar las etapas que usted vaya abriendo una a una.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Stages List */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Secuencia de Etapas ({managedStages.length})</span>
                  </h4>
                  <button
                    onClick={handleAddStage}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Añadir Etapa</span>
                  </button>
                </div>

                <div className="space-y-3.5">
                  {managedStages
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((stage, idx) => {
                      const isCurrentInCase = caseDetails.currentStageId === stage.id;
                      return (
                        <div
                          key={stage.id}
                          className={`p-4 rounded-xl border bg-white shadow-3xs space-y-4 transition-all ${
                            isCurrentInCase ? "border-amber-300 ring-2 ring-amber-50" : "border-slate-200"
                          }`}
                        >
                          {/* Stage Title and Controls Row */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="h-6 w-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-mono text-xs font-bold">
                                {idx + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <input
                                  type="text"
                                  value={stage.name}
                                  onChange={(e) => handleUpdateStageField(stage.id, "name", e.target.value)}
                                  className="text-xs font-bold text-slate-900 border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-hidden w-full"
                                  placeholder="Nombre de la etapa..."
                                />
                              </div>
                              {isCurrentInCase && (
                                <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-2 py-0.5 rounded border border-amber-200 uppercase tracking-wider">
                                  Etapa Activa
                                </span>
                              )}
                            </div>

                            {/* Stage Ordering Controls */}
                            <div className="flex items-center gap-1.5 self-end sm:self-auto">
                              <button
                                onClick={() => handleMoveStage(idx, "up")}
                                disabled={idx === 0}
                                className="p-1.5 border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
                                title="Mover arriba"
                              >
                                <ArrowUp className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => handleMoveStage(idx, "down")}
                                disabled={idx === managedStages.length - 1}
                                className="p-1.5 border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
                                title="Mover abajo"
                              >
                                <ArrowDown className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => handleRemoveStage(stage.id)}
                                disabled={isCurrentInCase}
                                className="p-1.5 border border-rose-100 text-rose-600 rounded-lg hover:bg-rose-50 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer ml-1"
                                title="Eliminar etapa"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Stage Description Field */}
                          <div>
                            <label className="text-[9px] font-bold text-slate-450 uppercase block mb-1">Descripción de la Etapa</label>
                            <input
                              type="text"
                              value={stage.description || ""}
                              onChange={(e) => handleUpdateStageField(stage.id, "description", e.target.value)}
                              className="w-full border border-slate-200 rounded-lg p-1.5 text-[11px] bg-slate-50 hover:bg-white focus:bg-white text-slate-700 focus:outline-hidden transition-colors"
                              placeholder="Indique las instrucciones u objetivos de esta etapa..."
                            />
                          </div>

                          {/* Stage Requirements List */}
                          <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-150">
                            <div className="flex justify-between items-center mb-2">
                              <h5 className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">
                                Requisitos y Documentos aplicados ({stage.requirements?.length || 0})
                              </h5>
                              <button
                                onClick={() => {
                                  setAddingReqForStageId(addingReqForStageId === stage.id ? null : stage.id);
                                  setNewReqName("");
                                  setNewReqDesc("");
                                }}
                                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5 cursor-pointer"
                              >
                                <span>{addingReqForStageId === stage.id ? "✕ Cerrar" : "＋ Añadir Requisito"}</span>
                              </button>
                            </div>

                            {/* Inline Form to Add Requirement */}
                            {addingReqForStageId === stage.id && (
                              <div className="bg-white border border-indigo-150 p-3 rounded-lg mb-3 space-y-3.5 animate-in slide-in-from-top-1 duration-150">
                                <p className="text-[10px] font-bold text-indigo-700 uppercase">Configurar Nuevo Requisito</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-[9px] font-bold text-slate-500 block mb-0.5">Nombre del Requisito</label>
                                    <input
                                      type="text"
                                      placeholder="Ej: Certificado de Domicilio"
                                      value={newReqName}
                                      onChange={(e) => setNewReqName(e.target.value)}
                                      className="w-full border border-slate-200 rounded-lg p-1.5 text-xs text-slate-900 focus:outline-hidden"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-bold text-slate-500 block mb-0.5">Tipo de Requisito</label>
                                    <select
                                      value={newReqType}
                                      onChange={(e) => setNewReqType(e.target.value as any)}
                                      className="w-full border border-slate-200 rounded-lg p-1.5 text-xs text-slate-900 cursor-pointer"
                                    >
                                      <option value="DOCUMENT">Documento (Subida de PDF/Imagen)</option>
                                      <option value="TASK">Tarea (Casilla de verificación)</option>
                                      <option value="FORM">Formulario Digital Interactivo</option>
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-slate-500 block mb-0.5">Instrucciones o Descripción</label>
                                  <input
                                    type="text"
                                    placeholder="Instrucciones breves para el asesor..."
                                    value={newReqDesc}
                                    onChange={(e) => setNewReqDesc(e.target.value)}
                                    className="w-full border border-slate-200 rounded-lg p-1.5 text-xs text-slate-900 focus:outline-hidden"
                                  />
                                </div>
                                <div className="flex items-center justify-between">
                                  <label className="flex items-center gap-1.5 text-xs text-slate-700 font-medium cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={newReqRequired}
                                      onChange={(e) => setNewReqRequired(e.target.checked)}
                                      className="rounded text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span>Obligatorio (Bloquea paso a siguiente etapa si no está completo)</span>
                                  </label>
                                  <button
                                    onClick={() => handleAddRequirement(stage.id)}
                                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-750 text-white text-[11px] font-bold rounded-lg cursor-pointer transition-colors"
                                  >
                                    Agregar
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Requirements List inside the stage */}
                            {stage.requirements && stage.requirements.length > 0 ? (
                              <div className="divide-y divide-slate-100 bg-white border border-slate-150 rounded-lg overflow-hidden">
                                {stage.requirements.map((req: any) => {
                                  const isEditingReq = editingReqId === req.id;

                                  if (isEditingReq) {
                                    return (
                                      <div key={req.id} className="p-3 bg-indigo-50/50 border-b border-slate-200 text-xs space-y-3 text-left">
                                        <div className="flex items-center justify-between">
                                          <span className="font-bold text-indigo-700 uppercase tracking-wider text-[10px]">
                                            ⚙️ Editando Requisito ({req.type === "DOCUMENT" ? "Documento" : req.type === "FORM" ? "Formulario" : "Tarea"})
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => setEditingReqId(null)}
                                            className="text-[10px] text-slate-500 hover:text-slate-700 font-bold uppercase cursor-pointer"
                                          >
                                            Cancelar (✕)
                                          </button>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                          <div>
                                            <label className="text-[9px] font-bold text-slate-500 block mb-0.5">Nombre del Requisito</label>
                                            <input
                                              type="text"
                                              value={editingReqName}
                                              onChange={(e) => setEditingReqName(e.target.value)}
                                              className="w-full border border-slate-250 rounded p-1 text-xs bg-white text-slate-950 focus:border-indigo-500"
                                            />
                                          </div>
                                          <div>
                                            <label className="text-[9px] font-bold text-slate-500 block mb-0.5">Descripción o Indicaciones</label>
                                            <input
                                              type="text"
                                              value={editingReqDesc}
                                              onChange={(e) => setEditingReqDesc(e.target.value)}
                                              className="w-full border border-slate-250 rounded p-1 text-xs bg-white text-slate-950 focus:border-indigo-500"
                                            />
                                          </div>
                                        </div>

                                        <div className="flex items-center justify-between">
                                          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
                                            <input
                                              type="checkbox"
                                              checked={editingReqRequired}
                                              onChange={(e) => setEditingReqRequired(e.target.checked)}
                                              className="rounded text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span>Obligatorio (Bloqueante)</span>
                                          </label>
                                          
                                          <button
                                            type="button"
                                            onClick={() => handleSaveReqEdit(stage.id, req.id)}
                                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] rounded cursor-pointer transition-colors"
                                          >
                                            Guardar Cambios
                                          </button>
                                        </div>

                                        {/* Editing custom form fields if type is FORM */}
                                        {req.type === "FORM" && (
                                          <div className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-2 mt-2">
                                            <div className="flex items-center justify-between">
                                              <span className="text-[9px] font-bold text-slate-600 uppercase">🗂️ Campos del Formulario</span>
                                              <button
                                                type="button"
                                                onClick={handleAddEditingField}
                                                className="text-[9px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded cursor-pointer"
                                              >
                                                + Agregar Campo
                                              </button>
                                            </div>

                                            <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
                                              {editingReqFields.length === 0 ? (
                                                <p className="text-[10px] text-slate-400 italic">No hay campos en el formulario.</p>
                                              ) : (
                                                editingReqFields.map((field: any, fIdx: number) => (
                                                  <div key={fIdx} className="flex flex-col sm:flex-row sm:items-center gap-1.5 bg-slate-50 border border-slate-150 p-1.5 rounded text-[10px]">
                                                    <div className="flex-1">
                                                      <input
                                                        type="text"
                                                        required
                                                        placeholder="Etiqueta del campo"
                                                        value={field.label || ""}
                                                        onChange={(e) => handleUpdateEditingField(fIdx, "label", e.target.value)}
                                                        className="w-full border-none p-0.5 bg-transparent font-semibold text-slate-800 focus:outline-none"
                                                      />
                                                    </div>
                                                    <div className="w-20">
                                                      <input
                                                        type="text"
                                                        placeholder="Clave"
                                                        value={field.name || ""}
                                                        onChange={(e) => handleUpdateEditingField(fIdx, "name", e.target.value)}
                                                        className="w-full text-[9px] font-mono border-none p-0.5 bg-transparent text-slate-500 focus:outline-none"
                                                      />
                                                    </div>
                                                    <div>
                                                      <select
                                                        value={field.type || "text"}
                                                        onChange={(e) => handleUpdateEditingField(fIdx, "type", e.target.value)}
                                                        className="bg-transparent border-none p-0.5 focus:outline-none font-medium text-slate-600"
                                                      >
                                                        <option value="text">Texto</option>
                                                        <option value="number">Número</option>
                                                        <option value="email">Email</option>
                                                        <option value="checkbox">SÍ/NO</option>
                                                        <option value="textarea">Área de texto</option>
                                                      </select>
                                                    </div>
                                                    <button
                                                      type="button"
                                                      onClick={() => handleRemoveEditingField(fIdx)}
                                                      className="text-red-500 hover:text-red-700 font-bold px-1 cursor-pointer"
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
                                    );
                                  }

                                  return (
                                    <div key={req.id} className="p-2.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/50 transition-colors">
                                      <div className="min-w-0 flex-1 text-left">
                                        <div className="flex items-center gap-1.5">
                                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                            req.type === "DOCUMENT" ? "bg-blue-50 text-blue-700" :
                                            req.type === "FORM" ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-700"
                                          }`}>
                                            {req.type === "DOCUMENT" ? "Documento" : req.type === "FORM" ? "Formulario" : "Tarea"}
                                          </span>
                                          <h6 className="font-bold text-slate-800 truncate">{req.name}</h6>
                                          {req.required && (
                                            <span className="text-[8px] font-semibold text-rose-500 bg-rose-50 border border-rose-100 px-1 rounded">
                                              Obligatorio
                                            </span>
                                          )}
                                        </div>
                                        {req.description && (
                                          <p className="text-[10px] text-slate-500 truncate mt-0.5">{req.description}</p>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          onClick={() => handleStartEditRequirement(req)}
                                          className="text-indigo-600 hover:text-indigo-800 p-1.5 rounded-lg hover:bg-indigo-50 cursor-pointer"
                                          title="Editar requisito"
                                        >
                                          <Edit2 className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                          onClick={() => handleRemoveRequirement(stage.id, req.id)}
                                          className="text-rose-600 hover:text-rose-800 p-1.5 rounded-lg hover:bg-rose-50 cursor-pointer"
                                          title="Quitar requisito"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-[10px] text-slate-400 italic text-center py-2 bg-white rounded-lg border border-dashed border-slate-200">
                                Sin requisitos configurados. Añada un requisito para guiar al asesor en esta etapa.
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-150 flex justify-end gap-3 bg-slate-50">
              <button
                onClick={() => setShowStageManagement(false)}
                className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveStages}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-750 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-xs"
              >
                Guardar Pipeline de Etapas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabbed Form Instances Popup Modal */}
      {activeFormGroup && (() => {
        const { reqId, role } = activeFormGroup;
        const req = caseDetails.requirements?.find((r: any) => r.id === reqId);
        if (!req || !req.task || !req.task.formInstances) return null;
        
        // Filter the instances that match this role
        const roleInstances = req.task.formInstances.filter((inst: any) => (inst.role || "General") === role);
        if (roleInstances.length === 0) return null;
        
        // Make sure activeFormTab is within range
        const activeIdx = activeFormTab >= roleInstances.length ? 0 : activeFormTab;
        const activeInst = roleInstances[activeIdx];
        
        const isEditing = editingInstanceId === activeInst.id;
        const isComplete = activeInst.status === "COMPLETA" && !isEditing;

        // Count totals for headers
        const totalCount = roleInstances.length;
        const completedCount = roleInstances.filter((inst: any) => inst.status === "COMPLETA").length;

        let roleTitle = role;
        if (role.toLowerCase() === "comprador") roleTitle = "Compradores";
        else if (role.toLowerCase() === "vendedor") roleTitle = "Vendedores";
        else if (role.toLowerCase() === "garante") roleTitle = "Garantes";
        else if (role.toLowerCase() === "escribano") roleTitle = "Escribanos";

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white border text-slate-900 border-slate-200 rounded-3xl w-full max-w-3xl shadow-2xl relative animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] overflow-hidden">
              
              {/* Modal Header */}
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-800 flex items-center gap-2">
                    <Users className="h-4 w-4 text-indigo-600" />
                    Formularios de {roleTitle}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Progreso: {completedCount} de {totalCount} completados
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveFormGroup(null);
                    setEditingInstanceId(null);
                  }}
                  className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-all cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Tabs list (solapas) */}
              <div className="px-6 bg-slate-50/20 border-b border-slate-100 flex gap-2 overflow-x-auto scrollbar-hidden">
                {roleInstances.map((inst: any, idx: number) => {
                  const isActive = idx === activeIdx;
                  const instComplete = inst.status === "COMPLETA";
                  
                  let tabColorClasses = "text-slate-500 hover:text-slate-850 border-transparent";
                  if (isActive) {
                    tabColorClasses = "text-indigo-600 border-indigo-605 bg-white shadow-3xs font-semibold";
                  } else if (instComplete) {
                    tabColorClasses = "text-emerald-600 hover:text-emerald-700 border-transparent bg-emerald-50/30";
                  }

                  return (
                    <button
                      key={inst.id}
                      type="button"
                      onClick={() => {
                        setActiveFormTab(idx);
                        setEditingInstanceId(null);
                      }}
                      className={`px-4 py-3 text-xs font-medium border-b-2 transition-all cursor-pointer whitespace-nowrap rounded-t-xl ${tabColorClasses}`}
                    >
                      <span className="flex items-center gap-1.5">
                        {instComplete && <span className="text-emerald-500 text-[10px]">✓</span>}
                        {role} {inst.index}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Modal Content - Scrollable Form or view */}
              <div className="p-6 overflow-y-auto flex-1 bg-white">
                {isComplete ? (
                  // Read Only view
                  <div className="space-y-5 animate-in fade-in duration-200">
                    <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-4 divide-y divide-slate-100/80">
                      {Object.entries(activeInst.formValues || {}).map(([key, value], idx) => (
                        <div key={key} className={`text-xs leading-relaxed text-slate-700 ${idx > 0 ? "pt-3" : ""}`}>
                          <span className="font-semibold text-slate-400 uppercase text-[9px] font-mono tracking-wider block mb-1">
                            {getAdaptedFieldLabel(key, role)}
                          </span>
                          <span className="text-slate-900 font-medium bg-white px-3 py-1.5 rounded-xl border border-slate-150 inline-block min-w-[150px] shadow-3xs">
                            {String(value) || "—"}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <span className="text-[10px] text-slate-400 font-mono">
                        Completado por: {activeInst.completedBy || "Asesor"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setTempFormValues(prev => ({
                            ...prev,
                            [`${reqId}_${activeInst.id}`]: { ...(activeInst.formValues || {}) }
                          }));
                          setEditingInstanceId(activeInst.id);
                        }}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-indigo-650 text-xs font-bold rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-3xs"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Editar / Corregir Datos
                      </button>
                    </div>
                  </div>
                ) : (
                  // Edit form view
                  caseDetails.status !== "FINALIZADO" ? (
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        submitFormRequirement(reqId, activeInst.id);
                      }}
                      className="space-y-6 animate-in fade-in duration-200"
                    >
                      <div className="bg-indigo-50/30 border border-indigo-100/50 p-4 rounded-2xl flex items-start gap-2.5">
                        <Info className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                        <div className="text-[11px] text-indigo-900 leading-relaxed font-medium">
                          Por favor complete todos los datos requeridos para registrar correctamente los datos de <b>{role} {activeInst.index}</b>.
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        {(req.formFields || []).map((field: any) => {
                          const currentVal = tempFormValues[`${reqId}_${activeInst.id}`]?.[field.name] !== undefined
                            ? tempFormValues[`${reqId}_${activeInst.id}`]?.[field.name]
                            : (activeInst.formValues?.[field.name] || "");

                          const isTextArea = field.type === "textarea";

                          return (
                            <div key={field.name} className={isTextArea ? "sm:col-span-2" : ""}>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">
                                {getAdaptedFieldLabel(field.label, role)} {field.required && "*"}
                              </label>
                              {isTextArea ? (
                                <textarea
                                  required={field.required}
                                  value={currentVal}
                                  onChange={(e) => updateFormValue(reqId, field.name, e.target.value, activeInst.id)}
                                  placeholder={`Ingresar datos...`}
                                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs bg-white text-slate-900 focus:outline-hidden focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 min-h-[90px] font-medium transition-all shadow-3xs"
                                />
                              ) : (
                                <input
                                  type={field.type === "number" ? "number" : "text"}
                                  required={field.required}
                                  value={currentVal}
                                  onChange={(e) => updateFormValue(reqId, field.name, e.target.value, activeInst.id)}
                                  placeholder={`Ingresar datos...`}
                                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs bg-white text-slate-900 focus:outline-hidden focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 font-medium transition-all shadow-3xs"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex gap-3 pt-4 border-t border-slate-100 justify-end">
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => setEditingInstanceId(null)}
                            className="px-4 py-2 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl cursor-pointer transition-all shadow-3xs"
                          >
                            Cancelar
                          </button>
                        )}
                        <button
                          type="submit"
                          className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl cursor-pointer transition-all shadow-md focus:ring-4 focus:ring-indigo-600/10"
                        >
                          Guardar Datos de {role} {activeInst.index}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="text-center py-10 text-slate-400 italic text-xs">
                      El caso está finalizado. No se permiten ediciones.
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
