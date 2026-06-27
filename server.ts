/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, initializeFirestore, doc as fbDoc, setDoc as fbSetDoc, getDoc as fbGetDoc, collection as fbCollection, writeBatch as fbWriteBatch, getDocs as fbGetDocs } from "firebase/firestore";
import { getStorage, ref as fbStorageRef, uploadBytes as fbUploadBytes, getBytes as fbGetBytes } from "firebase/storage";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Read Firebase client/web configuration from secrets/environment variables
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_PROJECT_ID ? `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com` : undefined,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || (process.env.FIREBASE_PROJECT_ID ? `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app` : undefined),
  appId: process.env.FIREBASE_APP_ID
};

console.log("[Firebase Config Loaded]");
console.log(` - Project ID: ${firebaseConfig.projectId || "MISSING (Set FIREBASE_PROJECT_ID in Secrets)"}`);
console.log(` - API Key: ${firebaseConfig.apiKey ? "PRESENT (Set FIREBASE_API_KEY in Secrets)" : "MISSING"}`);
console.log(` - Storage Bucket: ${firebaseConfig.storageBucket || "MISSING (Set FIREBASE_STORAGE_BUCKET in Secrets)"}`);
console.log(` - App ID: ${firebaseConfig.appId ? "PRESENT" : "MISSING (Set FIREBASE_APP_ID)"}`);

let firebaseApp: any = null;
let firestoreDb: any = null;
let firebaseStorage: any = null;

if (firebaseConfig.projectId && firebaseConfig.apiKey) {
  try {
    firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    firestoreDb = initializeFirestore(firebaseApp, {
      ignoreUndefinedProperties: true
    });
    firebaseStorage = getStorage(firebaseApp);
    console.log("[Firebase] Successfully initialized Firebase Client SDK (Firestore & Storage).");
  } catch (err: any) {
    console.error("[Firebase Initialization Error] Could not initialize Firebase SDK:", err.message);
  }
} else {
  console.warn("[Firebase Warning] Missing Firebase credentials (FIREBASE_PROJECT_ID and FIREBASE_API_KEY). Working in Local Fallback mode.");
}

// Body parser
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Data Persistence directories
const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

// Define interface for full DB state
interface DbSchema {
  users: any[];
  templates: any[];
  cases: any[];
  participants: any[];
  documents: any[];
  tasks: any[];
  observations: any[];
  notifications: any[];
  auditLogs: any[];
  profileRequests: any[];
  caseRequests?: any[];
  settings?: any;
  customTabs?: any[];
}

// Global DB in-memory cache
let db: DbSchema = {
  users: [],
  templates: [],
  cases: [],
  participants: [],
  documents: [],
  tasks: [],
  observations: [],
  notifications: [],
  auditLogs: [],
  profileRequests: [],
  caseRequests: [],
  customTabs: [],
};



// Utility to wrap any promise in a timeout to guarantee responsiveness
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, defaultValue: T): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve(defaultValue);
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

// Cloud Storage sync helpers
let gcsTimeout: NodeJS.Timeout | null = null;

async function syncToGCS() {
  if (!firebaseStorage) return;
  try {
    const fileRef = fbStorageRef(firebaseStorage, "db.json");
    const jsonStr = JSON.stringify(db, null, 2);
    const buffer = Buffer.from(jsonStr, "utf-8");
    await withTimeout(
      fbUploadBytes(fileRef, buffer, { contentType: "application/json" }),
      6000,
      undefined
    );
    console.log("[Firebase Storage] Database state successfully synchronized to Firebase Storage.");
  } catch (err: any) {
    console.error("[Firebase Storage Sync Error] Failed to upload state to Firebase Storage:", err.message);
  }
}

function triggerGcsSync() {
  if (!firebaseStorage) return;
  if (gcsTimeout) {
    clearTimeout(gcsTimeout);
  }
  gcsTimeout = setTimeout(() => {
    syncToGCS();
  }, 1000); // 1-second debounce
}

async function restoreFromGCS() {
  if (!firebaseStorage) return false;
  try {
    const fileRef = fbStorageRef(firebaseStorage, "db.json");
    console.log("[Firebase Storage] Downloading persistent database from Firebase Storage...");
    const buffer = await withTimeout(
      fbGetBytes(fileRef),
      6000,
      null
    );
    if (!buffer) return false;

    const parsed = JSON.parse(Buffer.from(buffer).toString("utf-8"));
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.users)) {
      db = parsed;
      console.log("[Firebase Storage] Database successfully restored from Firebase Storage.");
      return true;
    }
  } catch (err: any) {
    // Gracefully ignore object-not-found errors on fresh database setup
    if (err.code === "storage/object-not-found" || err.message?.includes("not found")) {
      console.log("[Firebase Storage] No db.json file found in storage bucket yet. This is normal for a fresh project.");
    } else {
      console.error("[Firebase Storage Restore Error] Failed to restore database from Firebase Storage:", err.message);
    }
  }
  return false;
}

// Helper: Upload file to Firebase Storage (for files/documents)
async function uploadToGCS(docId: string, caseId: string, requirementId: string, fileName: string, fileContent: string, fileType: string): Promise<string | null> {
  if (!firebaseStorage) return null;
  try {
    // Handle base64 payload stripping prefix if it exists (e.g. data:application/pdf;base64,...)
    let cleanBase64 = fileContent;
    if (fileContent.includes(",")) {
      cleanBase64 = fileContent.split(",")[1];
    }

    const buffer = Buffer.from(cleanBase64, "base64");
    // Ensure filename is safe for URLs/Firebase Storage paths
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const gcsPath = `cases/${caseId}/requirements/${docId}-${safeFileName}`;
    const fileRef = fbStorageRef(firebaseStorage, gcsPath);

    await withTimeout(
      fbUploadBytes(fileRef, buffer, { contentType: fileType || "application/pdf" }),
      10000,
      undefined
    );

    console.log(`[Firebase Storage] File successfully uploaded to Firebase Storage path: ${gcsPath}`);
    return gcsPath;
  } catch (err: any) {
    console.error("[Firebase Storage Upload Error] Failed to upload file to Firebase Storage:", err.message);
    return null;
  }
}

// Firestore sync helpers
let syncTimeout: NodeJS.Timeout | null = null;

async function syncToFirestore() {
  if (!firestoreDb) return;
  try {
    const keys: Array<keyof DbSchema> = [
      "users",
      "templates",
      "cases",
      "participants",
      "documents",
      "tasks",
      "observations",
      "notifications",
      "auditLogs",
      "profileRequests",
      "settings",
      "customTabs"
    ];

    const batch = fbWriteBatch(firestoreDb);
    const stateColRef = fbCollection(firestoreDb, "state");

    for (const key of keys) {
      const docRef = fbDoc(stateColRef, key);
      const val = db[key];
      // For arrays, wrap in { data: val }, for objects (settings) save directly.
      const payload = Array.isArray(val) ? { data: val } : (val || {});
      // Recursively strip out any undefined fields that cause Firestore set() to fail
      const sanitizedPayload = JSON.parse(JSON.stringify(payload));
      batch.set(docRef, sanitizedPayload);
    }

    await withTimeout(
      batch.commit(),
      6000,
      undefined
    );
    console.log("[Firestore] State successfully synchronized with Cloud Firestore database.");
  } catch (err: any) {
    console.error("[Firestore Sync Error] Failed to commit state to Firestore:", err.message);
  }
}

function triggerFirestoreSync() {
  if (!firestoreDb) return;
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  syncTimeout = setTimeout(() => {
    syncToFirestore();
  }, 1000); // 1-second debounce
}

function getRealisticAvatar(name: string): string {
  const portraits = [
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80",
    "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&h=150&q=80",
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80",
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80",
    "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=150&h=150&q=80",
    "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&h=150&q=80",
    "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=150&h=150&q=80",
    "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&h=150&q=80",
    "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=150&h=150&q=80"
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % portraits.length;
  return portraits[index];
}

// Helper: Sync form instances based on case party counts
function syncTaskFormInstances(caseObj: any, task: any) {
  if (!task.formInstances) {
    task.formInstances = [];
  }
  
  const counts = caseObj.partyCounts || { compradores: 0, vendedores: 0, garantes: 0 };
  const totalCounts = (counts.compradores || 0) + (counts.vendedores || 0) + (counts.garantes || 0);
  
  const targetInstances: { role: string; index: number }[] = [];
  if (totalCounts === 0) {
    targetInstances.push({ role: "General", index: 1 });
  } else {
    for (let i = 1; i <= (counts.compradores || 0); i++) {
      targetInstances.push({ role: "Comprador", index: i });
    }
    for (let i = 1; i <= (counts.vendedores || 0); i++) {
      targetInstances.push({ role: "Vendedor", index: i });
    }
    for (let i = 1; i <= (counts.garantes || 0); i++) {
      targetInstances.push({ role: "Garante", index: i });
    }
  }
  
  const newInstances: any[] = [];
  targetInstances.forEach((target) => {
    const existing = task.formInstances.find(
      (inst: any) => inst.role === target.role && inst.index === target.index
    );
    if (existing) {
      newInstances.push(existing);
    } else {
      newInstances.push({
        id: `inst-${target.role}-${target.index}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        role: target.role,
        index: target.index,
        status: "PENDIENTE",
        formValues: {}
      });
    }
  });
  
  task.formInstances = newInstances;
  
  const allComplete = task.formInstances.every((inst: any) => inst.status === "COMPLETA");
  task.status = allComplete ? "COMPLETA" : "PENDIENTE";
}

// Helper: Save DB file
function saveDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
    triggerFirestoreSync();
    triggerGcsSync();
  } catch (err) {
    console.error("Error writing database file:", err);
  }
}

// Helper: Log audit action
function logAudit(userId: string, action: string, entityType: string, entityId: string, description: string, explicitCaseId?: string) {
  const user = db.users.find((u) => u.id === userId) || { name: "System", role: "ADMIN" };
  
  let caseId = explicitCaseId;
  if (!caseId) {
    if (entityType === "CASE") {
      caseId = entityId;
    } else if (entityType === "TASK") {
      const task = db.tasks?.find(t => t.id === entityId);
      if (task) caseId = task.caseId;
    } else if (entityType === "DOCUMENT") {
      const doc = db.documents?.find(d => d.id === entityId);
      if (doc) caseId = doc.caseId;
    } else if (entityType === "OBSERVATION") {
      const obs = db.observations?.find(o => o.id === entityId);
      if (obs) caseId = obs.caseId;
    } else if (entityType === "PARTICIPANT") {
      const part = db.participants?.find(p => p.id === entityId);
      if (part) caseId = part.caseId;
    }
  }

  const log = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId,
    userName: user.name,
    userRole: user.role,
    action,
    entityType,
    entityId,
    description,
    caseId,
    createdAt: new Date().toISOString(),
  };
  db.auditLogs.unshift(log); // newest first
  saveDb();
}

// Helper: Check manager access and auto-assign if unassigned
function checkAndAssignManager(caseId: string, userId: string): { allowed: boolean; message?: string } {
  const caseObj = db.cases.find((c) => c.id === caseId);
  if (!caseObj) {
    return { allowed: false, message: "Expediente no encontrado." };
  }

  const user = db.users.find((u) => u.id === userId);
  if (!user) {
    return { allowed: true };
  }

  // Admin has full access to everything and can intervene anytime
  if (user.role === "ADMIN") {
    return { allowed: true };
  }

  // If the user is a MANAGER:
  if (user.role === "MANAGER") {
    // If case has no manager assigned (empty or unassigned)
    if (!caseObj.managerId || caseObj.managerId === "unassigned" || caseObj.managerId === "") {
      caseObj.managerId = user.id;
      caseObj.updatedAt = new Date().toISOString();
      saveDb();
      logAudit(user.id, "CASE_ASSIGNED", "CASE", caseObj.id, `El manager ${user.name} se auto-asignó al responder el expediente ${caseObj.code}`);
      
      // Send a notification to advisor
      createNotification(
        caseObj.advisorId,
        "Manager Asignado",
        `El manager ${user.name} ha tomado tu expediente ${caseObj.code}.`,
        "INFO",
        caseObj.id
      );
      
      return { allowed: true };
    }

    // If case has an assigned manager, only they can intervene
    if (caseObj.managerId !== user.id) {
      const assignedManager = db.users.find(u => u.id === caseObj.managerId);
      return { 
        allowed: false, 
        message: `Este expediente está asignado al manager ${assignedManager ? assignedManager.name : 'otro manager'} y no puedes intervenir.` 
      };
    }
  }

  return { allowed: true };
}

// Helper: Get user ID from request body or authorization header
function getUserIdFromRequest(req: any): string {
  if (req.body && req.body.userId) {
    return req.body.userId;
  }
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    return token.replace("real-jwt-token-for-", "").replace("mock-jwt-token-for-", "");
  }
  return "usr-asesor1"; // safe fallback
}

// Helper: Create notification
function createNotification(userId: string, title: string, message: string, type: "INFO" | "SUCCESS" | "WARNING" | "DANGER", caseId?: string) {
  const notif = {
    id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId,
    title,
    message,
    type,
    read: false,
    createdAt: new Date().toISOString(),
    caseId,
  };
  db.notifications.unshift(notif);
  saveDb();
}

// Initialize default records
async function initDb() {
  let restored = false;

  // 1. Try to restore from Google Cloud Storage (always available on Cloud Run projects)
  try {
    restored = await restoreFromGCS();
    if (restored) {
      console.log("[Init] Database successfully loaded from Cloud Storage.");
      // Save local cache copy
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
    }
  } catch (err: any) {
    console.error("[Storage Restore Error] Could not load state from Cloud Storage:", err.message);
  }

  // 2. Try to restore from Cloud Firestore if GCS did not succeed
  if (!restored && firestoreDb) {
    try {
      console.log("[Firestore] Attempting to retrieve persistent state...");
      const stateColRef = fbCollection(firestoreDb, "state");
      const snapshot = await fbGetDocs(stateColRef);

      if (!snapshot.empty) {
        snapshot.forEach((docSnapshot) => {
          const key = docSnapshot.id as keyof DbSchema;
          const val = docSnapshot.data();
          if (key === "settings") {
            db.settings = val;
          } else if (Array.isArray(val.data)) {
            db[key] = val.data;
          }
        });
        console.log("[Firestore] State successfully restored from Firestore cloud database.");
        restored = true;
        // Save local cache copy
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
      } else {
        console.log("[Firestore] No cloud state found.");
      }
    } catch (err: any) {
      console.error("[Firestore Error] Could not restore state from Cloud Firestore:", err.message);
    }
  }

  // 3. Fallback to local cache if no cloud restore succeeded
  if (!restored) {
    try {
      if (fs.existsSync(DB_FILE)) {
        const data = fs.readFileSync(DB_FILE, "utf-8");
        db = JSON.parse(data);
        console.log("Loaded database from local disk cache.");
      }
    } catch (err) {
      console.error("Failed to load database file from local disk cache:", err);
    }
  }

  // Populate defaults if users are empty
  if (!db.users || db.users.length === 0) {
    db.users = [
      { 
        id: "usr-admin", 
        email: "admin@test.com", 
        password: "admin123", 
        name: "Director General", 
        role: "ADMIN", 
        avatarUrl: getRealisticAvatar("Director General"), 
        status: "APPROVED", 
        phone: "+541122223333" 
      },
      { 
        id: "usr-manager", 
        email: "manager@test.com", 
        password: "password123", 
        name: "Gerente Martina", 
        role: "MANAGER", 
        avatarUrl: getRealisticAvatar("Gerente Martina"), 
        status: "APPROVED", 
        phone: "+541122223333" 
      },
      { 
        id: "usr-asesor1", 
        email: "asesor@test.com", 
        password: "password123", 
        name: "Asesor Gabriel", 
        role: "ASESOR", 
        avatarUrl: getRealisticAvatar("Asesor Gabriel"), 
        status: "APPROVED", 
        phone: "+541122223333" 
      }
    ];
  }

  if (!db.settings) {
    db.settings = {
      verificationChannel: "EMAIL",
      messageTemplate: "Hola {{name}}, tu token de verificación es: {{token}}",
      resendApiKey: process.env.RESEND_API_KEY || "",
      resendFromEmail: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
      twilioSid: process.env.TWILIO_ACCOUNT_SID || "",
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
      twilioFromNumber: process.env.TWILIO_FROM_NUMBER || "",
      commercialFocus: "general",
      allowAdvisorViewProductivity: false
    };
  }
  if (db.settings && db.settings.allowAdvisorViewProductivity === undefined) {
    db.settings.allowAdvisorViewProductivity = false;
  }

  if (!db.customTabs) {
    db.customTabs = [];
  }

  // Backfill caseId in old audit logs for case history aggregation
  if (db.auditLogs && Array.isArray(db.auditLogs)) {
    let count = 0;
    db.auditLogs.forEach((log) => {
      if (!log.caseId) {
        let caseId = undefined;
        if (log.entityType === "CASE") {
          caseId = log.entityId;
        } else if (log.entityType === "TASK") {
          const task = db.tasks?.find(t => t.id === log.entityId);
          if (task) caseId = task.caseId;
        } else if (log.entityType === "DOCUMENT") {
          const doc = db.documents?.find(d => d.id === log.entityId);
          if (doc) caseId = doc.caseId;
        } else if (log.entityType === "OBSERVATION") {
          const obs = db.observations?.find(o => o.id === log.entityId);
          if (obs) caseId = obs.caseId;
        } else if (log.entityType === "PARTICIPANT") {
          const part = db.participants?.find(p => p.id === log.entityId);
          if (part) caseId = part.caseId;
        }
        if (caseId) {
          log.caseId = caseId;
          count++;
        }
      }
    });
    if (count > 0) {
      console.log(`[Backfill] Associated ${count} historical audit logs with their corresponding caseId.`);
    }
  }

  saveDb();
}

// --------------------------------------------------------
// REST API ROUTES
// --------------------------------------------------------

// Helper to generate a 16-character alphanumeric & symbolic token with upper/lowercase
function generateVerificationToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?";
  let token = "";
  for (let i = 0; i < 16; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// Resend Email Sender (Fetch-based for lightweight native support)
async function sendVerificationEmail(email: string, name: string, token: string, template: string) {
  const apiKey = db.settings.resendApiKey || process.env.RESEND_API_KEY;
  let fromEmail = db.settings.resendFromEmail || process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  if (!fromEmail || !fromEmail.includes("@") || fromEmail.trim().startsWith("re_")) {
    fromEmail = "onboarding@resend.dev";
  }
  const text = template.replace(/{{name}}/g, name).replace(/{{token}}/g, token);

  if (!apiKey) {
    console.error(`[Resend Email Error] API Key not set. Cannot send verification email to ${email}`);
    return { success: false, error: "La API Key de Resend (RESEND_API_KEY) no está configurada. Por favor, configúrela en los Ajustes del panel." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: email,
        subject: "Código de Verificación - Gestor de Expedientes",
        text: text,
        html: `<p>${text.replace(/\n/g, "<br>")}</p>`,
      }),
    });

    if (res.ok) {
      console.log(`Email successfully dispatched via Resend to ${email}`);
      return { success: true };
    } else {
      const errText = await res.text();
      console.error(`Resend API error response: ${errText}`);
      return { success: false, error: `Resend API Error: ${errText}` };
    }
  } catch (error: any) {
    console.error(`Error sending Resend email:`, error);
    return { success: false, error: `Error de red con Resend: ${error.message}` };
  }
}

// Twilio SMS Sender (Fetch-based for lightweight native support)
async function sendVerificationSms(phone: string, name: string, token: string, template: string) {
  const accountSid = db.settings.twilioSid || process.env.TWILIO_ACCOUNT_SID;
  const authToken = db.settings.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = db.settings.twilioFromNumber || process.env.TWILIO_FROM_NUMBER;
  const text = template.replace(/{{name}}/g, name).replace(/{{token}}/g, token);

  if (!accountSid || !authToken || !fromNumber) {
    console.error(`[Twilio SMS Error] Credentials incomplete. Cannot send verification SMS to ${phone}`);
    return { success: false, error: "Las credenciales de Twilio (SID, Token, o Número de Envío) no están configuradas en los Ajustes del panel." };
  }

  try {
    const authString = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const params = new URLSearchParams();
    params.append("To", phone);
    params.append("From", fromNumber);
    params.append("Body", text);

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${authString}`,
      },
      body: params.toString(),
    });

    if (res.ok) {
      console.log(`SMS successfully dispatched via Twilio to ${phone}`);
      return { success: true };
    } else {
      const errText = await res.text();
      console.error(`Twilio API error response: ${errText}`);
      return { success: false, error: `Twilio API Error: ${errText}` };
    }
  } catch (error: any) {
    console.error(`Error sending Twilio SMS:`, error);
    return { success: false, error: `Error de red con Twilio: ${error.message}` };
  }
}

// Real Auth Login
app.post("/api/auth/login", (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(200).json({ success: false, message: "Email y contraseña son requeridos." });
    }

    const found = db.users.find((u) => u && u.email && typeof u.email === "string" && u.email.toLowerCase() === email.trim().toLowerCase());

    if (!found) {
      return res.status(200).json({ success: false, message: "El correo electrónico no se encuentra registrado." });
    }

    if (found.password !== password) {
      return res.status(200).json({ success: false, message: "La contraseña ingresada es incorrecta." });
    }

    if (found.status !== "APPROVED") {
      let msg = "Su cuenta aún no ha sido aprobada.";
      if (found.status === "PENDING") {
        msg = "Su cuenta está pendiente de ingreso del token de verificación de contacto.";
      } else if (found.status === "VERIFIED_PENDING_APPROVAL") {
        msg = "Su contacto está verificado. Su cuenta está en espera de aprobación por parte del Director General.";
      } else if (found.status === "REJECTED") {
        msg = "Su solicitud de registro ha sido rechazada por la dirección general.";
      }
      return res.status(200).json({ success: false, message: msg });
    }

    logAudit(found.id, "LOGIN", "USER", found.id, `El usuario ${found.name} (${found.role}) inició sesión.`);

    res.json({
      success: true,
      token: `real-jwt-token-for-${found.id}`,
      user: {
        id: found.id,
        email: found.email,
        name: found.name,
        role: found.role,
        phone: found.phone,
        avatarUrl: found.avatarUrl,
        address: found.address,
        status: found.status
      },
    });
  } catch (err: any) {
    console.error("Error in login route:", err);
    res.status(200).json({ success: false, message: `Error interno de autenticación: ${err.message}` });
  }
});

// Advisor self-registration
app.post("/api/auth/register-advisor", async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;
    if (!email || !password || !name || !phone) {
      return res.status(400).json({ success: false, message: "Todos los campos son obligatorios para registrarse." });
    }

    const existsIndex = db.users.findIndex((u) => u && u.email && typeof u.email === "string" && u.email.toLowerCase() === email.trim().toLowerCase());
    if (existsIndex !== -1) {
      const existingUser = db.users[existsIndex];
      // If the user already exists but hasn't been approved yet, let them overwrite it completely to get a fresh token/try again!
      if (existingUser.status === "PENDING" || existingUser.status === "VERIFIED_PENDING_APPROVAL" || existingUser.status === "REJECTED") {
        console.log(`[Auth] Removing existing unapproved user ${email} to allow fresh registration as requested.`);
        db.users.splice(existsIndex, 1);
      } else {
        return res.status(400).json({ success: false, message: "Este correo electrónico ya se encuentra registrado y aprobado." });
      }
    }

    const token = generateVerificationToken();
    const newAdvisor = {
      id: `usr-asesor-${Date.now()}`,
      email: email.trim().toLowerCase(),
      password,
      name: name.trim(),
      phone: phone.trim(),
      role: "ASESOR",
      status: "PENDING",
      verificationToken: token,
      avatarUrl: getRealisticAvatar(name),
      createdAt: new Date().toISOString()
    };

    db.users.push(newAdvisor);
    saveDb();

    const channel = db.settings ? db.settings.verificationChannel : "EMAIL";
    const template = db.settings ? db.settings.messageTemplate : "Hola {{name}}, tu token de verificación es: {{token}}";

    let sendResult: { success: boolean; error?: string } = { success: true };

    if (channel === "EMAIL" || channel === "BOTH") {
      sendResult = await sendVerificationEmail(newAdvisor.email, newAdvisor.name, token, template);
    }
    if (sendResult.success && (channel === "SMS" || channel === "BOTH")) {
      sendResult = await sendVerificationSms(newAdvisor.phone, newAdvisor.name, token, template);
    }

    if (!sendResult.success) {
      // Remove advisor from db since sending failed
      db.users = db.users.filter(u => u && u.id !== newAdvisor.id);
      saveDb();
      return res.status(400).json({
        success: false,
        message: `No se pudo enviar el token de verificación de seguridad: ${sendResult.error}`
      });
    }

    logAudit(
      newAdvisor.id,
      "USER_SIGNUP",
      "USER",
      newAdvisor.id,
      `Asesor nuevo se ha registrado: ${newAdvisor.name}. Esperando verificación vía token (Canal: ${channel}).`
    );

    res.json({
      success: true,
      message: `Registro completado con éxito. Se ha enviado un token de verificación de 16 caracteres a su ${
        channel === "SMS" ? "teléfono" : channel === "EMAIL" ? "correo electrónico" : "correo y teléfono"
    }.`,
      userId: newAdvisor.id
    });
  } catch (err: any) {
    console.error("Error in register-advisor route:", err);
    res.status(500).json({ success: false, message: `Error interno de registro: ${err.message}` });
  }
});

// Advisor Token Verification
app.post("/api/auth/verify-token", (req, res) => {
  const { userId, token } = req.body;
  if (!userId || !token) {
    return res.status(400).json({ success: false, message: "ID de usuario y código de seguridad son obligatorios." });
  }

  const user = db.users.find((u) => u.id === userId);
  if (!user) {
    return res.status(404).json({ success: false, message: "Registro no encontrado." });
  }

  if (user.status !== "PENDING") {
    return res.status(400).json({ success: false, message: "Este usuario ya no se encuentra en estado pendiente de verificación." });
  }

  if (user.verificationToken !== token) {
    return res.status(400).json({ success: false, message: "El código de seguridad ingresado es incorrecto." });
  }

  // Set as verified, awaiting administrator approval
  user.status = "VERIFIED_PENDING_APPROVAL";
  saveDb();

  // Create real notifications for the Director General (Admin)
  const admin = db.users.find((u) => u.role === "ADMIN");
  if (admin) {
    createNotification(
      admin.id,
      "Asesor Verificado - Pendiente de Aprobación",
      `El asesor ${user.name} (${user.email}) ha verificado su contacto. Requiere su aprobación manual para ingresar.`,
      "WARNING"
    );
  }

  logAudit(
    user.id,
    "USER_VERIFIED",
    "USER",
    user.id,
    `Asesor ${user.name} verificó exitosamente su token de contacto. Esperando confirmación del Director General.`
  );

  res.json({
    success: true,
    message: "Contacto verificado con éxito. Su cuenta se encuentra en espera de aprobación por el Director General."
  });
});

// Admin configures settings (verification mode/credentials)
app.get("/api/admin/settings", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester || (requester.role !== "ADMIN" && requester.role !== "MANAGER")) {
    return res.status(403).json({ message: "Privilegios insuficientes." });
  }

  res.json(db.settings);
});

app.post("/api/admin/settings", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester || (requester.role !== "ADMIN" && requester.role !== "MANAGER")) {
    return res.status(403).json({ message: "Privilegios insuficientes." });
  }

  db.settings = {
    ...db.settings,
    ...req.body
  };
  saveDb();

  logAudit(requester.id, "SETTINGS_UPDATED", "SYSTEM", "settings", `${requester.role === "ADMIN" ? "El Director General" : "El Manager"} actualizó las configuraciones.`);
  res.json({ success: true, settings: db.settings });
});

// GET the current active commercial focus of the platform
app.get("/api/settings/commercial-focus", (req, res) => {
  res.json({
    commercialFocus: (db.settings && db.settings.commercialFocus) || "general"
  });
});

// GET public settings (safe flags for any user role)
app.get("/api/settings/public", (req, res) => {
  res.json({
    commercialFocus: (db.settings && db.settings.commercialFocus) || "general",
    allowAdvisorViewProductivity: !!(db.settings && db.settings.allowAdvisorViewProductivity),
    customTexts: (db.settings && db.settings.customTexts) || {}
  });
});

// Admin approves registered Advisor
app.post("/api/admin/users/:id/approve", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester || requester.role !== "ADMIN") {
    return res.status(403).json({ message: "Privilegios insuficientes. Solo Director General." });
  }

  const targetId = req.params.id;
  const targetUser = db.users.find((u) => u.id === targetId);

  if (!targetUser) {
    return res.status(404).json({ message: "Asesor no encontrado." });
  }

  targetUser.status = "APPROVED";
  saveDb();

  createNotification(
    targetUser.id,
    "Registro Aprobado",
    "Su solicitud ha sido aprobada por el Director General. Ya puede acceder plenamente al Gestor de Expedientes.",
    "SUCCESS"
  );

  logAudit(
    requester.id,
    "USER_APPROVED",
    "USER",
    targetUser.id,
    `El Director General aprobó manualmente el registro del asesor ${targetUser.name}.`
  );

  res.json({ success: true, message: "Asesor aprobado con éxito." });
});

// Admin rejects registered Advisor
app.post("/api/admin/users/:id/reject", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester || requester.role !== "ADMIN") {
    return res.status(403).json({ message: "Privilegios insuficientes. Solo Director General." });
  }

  const targetId = req.params.id;
  const targetUser = db.users.find((u) => u.id === targetId);

  if (!targetUser) {
    return res.status(404).json({ message: "Asesor no encontrado." });
  }

  targetUser.status = "REJECTED";
  saveDb();

  logAudit(
    requester.id,
    "USER_REJECTED",
    "USER",
    targetUser.id,
    `El Director General rechazó manualmente la solicitud de registro del asesor ${targetUser.name}.`
  );

  res.json({ success: true, message: "Asesor rechazado con éxito." });
});

// Admin suspends registered User (Advisor or Manager)
app.post("/api/admin/users/:id/suspend", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester || requester.role !== "ADMIN") {
    return res.status(403).json({ message: "Privilegios insuficientes. Solo Director General." });
  }

  const targetId = req.params.id;
  const targetUser = db.users.find((u) => u.id === targetId);

  if (!targetUser) {
    return res.status(404).json({ message: "Usuario no encontrado." });
  }

  targetUser.status = "SUSPENDED";
  saveDb();

  createNotification(
    targetUser.id,
    "Cuenta Suspendida",
    "Su cuenta ha sido suspendida temporalmente por el Director General.",
    "WARNING"
  );

  logAudit(
    requester.id,
    "USER_SUSPENDED",
    "USER",
    targetUser.id,
    `El Director General suspendió al usuario ${targetUser.name}.`
  );

  res.json({ success: true, message: "Usuario suspendido con éxito." });
});

// Admin bans registered User
app.post("/api/admin/users/:id/ban", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester || requester.role !== "ADMIN") {
    return res.status(403).json({ message: "Privilegios insuficientes. Solo Director General." });
  }

  const targetId = req.params.id;
  const targetUser = db.users.find((u) => u.id === targetId);

  if (!targetUser) {
    return res.status(404).json({ message: "Usuario no encontrado." });
  }

  targetUser.status = "BANNED";
  saveDb();

  logAudit(
    requester.id,
    "USER_BANNED",
    "USER",
    targetUser.id,
    `El Director General baneó al usuario ${targetUser.name}.`
  );

  res.json({ success: true, message: "Usuario baneado con éxito." });
});

// Admin deletes registered User
app.delete("/api/admin/users/:id", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester || requester.role !== "ADMIN") {
    return res.status(403).json({ message: "Privilegios insuficientes. Solo Director General." });
  }

  const targetId = req.params.id;
  const targetUserIndex = db.users.findIndex((u) => u.id === targetId);

  if (targetUserIndex === -1) {
    return res.status(404).json({ message: "Usuario no encontrado." });
  }

  const deletedUser = db.users[targetUserIndex];
  db.users.splice(targetUserIndex, 1);
  saveDb();

  logAudit(
    requester.id,
    "USER_DELETED",
    "USER",
    targetId,
    `El Director General eliminó al usuario ${deletedUser.name}.`
  );

  res.json({ success: true, message: "Usuario eliminado con éxito." });
});

// Admin creates managers
app.post("/api/admin/create-manager", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester || requester.role !== "ADMIN") {
    return res.status(403).json({ message: "Privilegios insuficientes. Solo Director General." });
  }

  const { email, password, name, phone } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ message: "Email, contraseña y nombre completo son datos requeridos." });
  }

  const exists = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (exists) {
    return res.status(400).json({ message: "Ya existe un usuario registrado bajo este correo electrónico." });
  }

  const newManager = {
    id: `usr-manager-${Date.now()}`,
    email: email.trim().toLowerCase(),
    password,
    name: name.trim(),
    phone: (phone || "").trim(),
    role: "MANAGER",
    status: "APPROVED", // Directly approved because manager was established by the General Director
    avatarUrl: getRealisticAvatar(name),
    createdAt: new Date().toISOString()
  };

  db.users.push(newManager);
  saveDb();

  logAudit(
    requester.id,
    "MANAGER_CREATED",
    "USER",
    newManager.id,
    `El Director General creó un nuevo Manager: ${newManager.name} (${newManager.email}).`
  );

  res.json({ success: true, manager: newManager });
});

// Admin creates advisor credentials directly
app.post("/api/admin/create-advisor", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester || requester.role !== "ADMIN") {
    return res.status(403).json({ message: "Privilegios insuficientes. Solo Director General." });
  }

  const { email, password, name, phone } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ message: "Email, contraseña y nombre completo son datos requeridos." });
  }

  const exists = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (exists) {
    return res.status(400).json({ message: "Ya existe un usuario registrado bajo este correo electrónico." });
  }

  const newAdvisor = {
    id: `usr-asesor-${Date.now()}`,
    email: email.trim().toLowerCase(),
    password,
    name: name.trim(),
    phone: (phone || "").trim(),
    role: "ASESOR",
    status: "APPROVED", // Directly approved as created by general administration
    avatarUrl: getRealisticAvatar(name),
    createdAt: new Date().toISOString()
  };

  db.users.push(newAdvisor);
  saveDb();

  logAudit(
    requester.id,
    "USER_APPROVED",
    "USER",
    newAdvisor.id,
    `El Director General creó un nuevo Asesor: ${newAdvisor.name} (${newAdvisor.email}).`
  );

  res.json({ success: true, advisor: newAdvisor });
});

// Get current session
app.get("/api/auth/me", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "").replace("mock-jwt-token-for-", "");
  const user = db.users.find(u => u.id === userId);
  if (user) {
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      address: user.address,
      status: user.status,
      canCreateCases: !!user.canCreateCases
    });
  } else {
    res.status(401).json({ message: "Sesión inválida o expirada." });
  }
});


// Users list
app.get("/api/users", (req, res) => {
  const safeUsers = db.users.map(({ password, verificationToken, ...u }) => u);
  res.json(safeUsers);
});

// Profile change requests list (for ADMIN)
app.get("/api/profile/change-requests", (req, res) => {
  res.json(db.profileRequests || []);
});

// Resolve a profile change request (APPROVE or REJECT) - ADMIN only
app.post("/api/profile/change-requests/:id/resolve", (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // "APPROVED" or "REJECTED" (convert Spanish equivalent or standard)
  const finalStatus = status === "APROBADO" ? "APROBADO" : "RECHAZADO";

  if (!db.profileRequests) {
    db.profileRequests = [];
  }

  const request = db.profileRequests.find(r => r.id === id);
  if (!request) {
    return res.status(404).json({ success: false, message: "Solicitud de modificación de perfil no encontrada." });
  }

  if (request.status !== "PENDIENTE") {
    return res.status(400).json({ success: false, message: "Esta solicitud ya ha sido resuelta." });
  }

  request.status = finalStatus;
  request.resolvedAt = new Date().toISOString();

  if (finalStatus === "APROBADO") {
    const user = db.users.find(u => u.id === request.userId);
    if (user) {
      const oldName = user.name;
      const oldEmail = user.email;
      const oldPhone = user.phone;
      const oldAddress = user.address;

      // Update user details
      if (request.requestedData.name) user.name = request.requestedData.name;
      if (request.requestedData.email) user.email = request.requestedData.email;
      if (request.requestedData.phone) user.phone = request.requestedData.phone;
      if (request.requestedData.address) user.address = request.requestedData.address;

      logAudit(
        "usr-admin",
        "PROFILE_CHANGE_APPROVED",
        "USER",
        user.id,
        `Se aprobó el cambio de perfil de ${user.role} ${user.name} (Anterior: ${oldName}, ${oldEmail}, ${oldPhone}, ${oldAddress || ''} | Nuevo: ${user.name}, ${user.email}, ${user.phone}, ${user.address || ''})`
      );

      createNotification(
        user.id,
        "Cambio de perfil aprobado",
        "Tus datos de perfil han sido actualizados tras la aprobación del Director General.",
        "SUCCESS"
      );
    }
  } else {
    // RECHAZADO
    const user = db.users.find(u => u.id === request.userId);
    if (user) {
      logAudit(
        "usr-admin",
        "PROFILE_CHANGE_REJECTED",
        "USER",
        user.id,
        `Se rechazó la solicitud de cambio de datos de perfil para ${user.name}`
      );

      createNotification(
        user.id,
        "Cambio de perfil rechazado",
        "Tu solicitud de datos de perfil ha sido rechazada por el Director General.",
        "DANGER"
      );
    }
  }

  saveDb();
  res.json({ success: true, request });
});

// Update profile layout - depending on role
app.post("/api/profile/update", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ success: false, message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "").replace("mock-jwt-token-for-", "");
  const user = db.users.find(u => u.id === userId);

  if (!user) {
    return res.status(404).json({ success: false, message: "Usuario no encontrado." });
  }

  const { name, email, phone, avatarUrl, address } = req.body;

  if (!db.profileRequests) {
    db.profileRequests = [];
  }

  // Admin can change everything instantly
  if (user.role === "ADMIN") {
    user.name = name ?? user.name;
    user.email = email ?? user.email;
    user.phone = phone ?? user.phone;
    user.address = address ?? user.address;
    if (avatarUrl) user.avatarUrl = avatarUrl;

    logAudit(user.id, "PROFILE_UPDATED", "USER", user.id, "Director General actualizó sus datos de perfil directamente.");
    saveDb();
    return res.json({ success: true, message: "Perfil de administrador actualizado.", user });
  }

  // Check what is immediate and what needs request
  // 1. Avatar update is immediate for both ASESOR and MANAGER
  if (avatarUrl && avatarUrl !== user.avatarUrl) {
    user.avatarUrl = avatarUrl;
    logAudit(user.id, "AVATAR_UPDATED", "USER", user.id, `${user.name} actualizó su fotografía de perfil.`);
  }

  // Check if there are sensitive pending fields that requested changes
  const sensitiveFieldsRequested: any = {};
  let needsRequest = false;

  // For ASESOR and MANAGER: name, email, phone, and address are sensitive and require request
  if (user.role === "ASESOR" || user.role === "MANAGER") {
    if (name && name !== user.name) {
      sensitiveFieldsRequested.name = name;
      needsRequest = true;
    }
    if (email && email !== user.email) {
      sensitiveFieldsRequested.email = email;
      needsRequest = true;
    }
    if (phone && phone !== user.phone) {
      sensitiveFieldsRequested.phone = phone;
      needsRequest = true;
    }
    if (address && address !== user.address) {
      sensitiveFieldsRequested.address = address;
      needsRequest = true;
    }
  }

  if (needsRequest) {
    // Create change request
    const request = {
      id: `mreq-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      currentData: {
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        address: user.address || ""
      },
      requestedData: {
        ...sensitiveFieldsRequested
      },
      status: "PENDIENTE",
      createdAt: new Date().toISOString()
    };

    db.profileRequests.push(request);
    logAudit(user.id, "PROFILE_CHANGE_REQUESTED", "USER", user.id, `${user.name} solicitó modificar datos de perfil sensibles.`);
    
    // Notify admin
    db.users.filter(u => u.role === "ADMIN").forEach(admin => {
      createNotification(
        admin.id,
        "Solicitud de cambio de perfil",
        `El usuario ${user.name} solicita cambiar sus datos de perfil.`,
        "WARNING"
      );
    });

    saveDb();

    return res.json({
      success: true,
      message: "Se actualizaron las opciones directas y se envió una solicitud de aprobación para los datos sensibles al Director General.",
      user,
      pendingRequest: request
    });
  }

  // If no sensitive fields changed but other details did (like avatarUrl)
  saveDb();
  res.json({ success: true, message: "Perfil actualizado exitosamente.", user });
});

// Change password directly for any user role (everyone manages it openly)
app.post("/api/profile/change-password", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ success: false, message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "").replace("mock-jwt-token-for-", "");
  const user = db.users.find(u => u.id === userId);

  if (!user) {
    return res.status(444).json({ success: false, message: "Usuario no encontrado." });
  }

  const { newPassword } = req.body;
  if (!newPassword || newPassword.trim().length < 4) {
    return res.status(400).json({ success: false, message: "La nueva contraseña debe tener al menos 4 caracteres." });
  }

  user.password = newPassword.trim();

  logAudit(user.id, "PASSWORD_CHANGED", "USER", user.id, `${user.name} actualizó su contraseña de acceso directamente.`);
  saveDb();

  res.json({ success: true, message: "Contraseña actualizada de forma segura y directa." });
});

// Admin creates credentials directly - fully approved and verified
app.post("/api/admin/create-credential", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ success: false, message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "").replace("mock-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester || requester.role !== "ADMIN") {
    return res.status(403).json({ success: false, message: "Solo el Director General puede crear credenciales directas." });
  }

  const { name, email, password, role, phone } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ success: false, message: "Nombre, Correo, Contraseña y Rol son campos requeridos." });
  }

  const exists = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (exists) {
    return res.status(400).json({ success: false, message: "Este correo electrónico ya se encuentra registrado." });
  }

  const newUser = {
    id: `usr-${role.toLowerCase()}-${Date.now()}`,
    email: email.trim().toLowerCase(),
    password,
    name: name.trim(),
    phone: (phone || "").trim(),
    role: role, // "ASESOR" or "MANAGER"
    status: "APPROVED", // direct pre-approved
    avatarUrl: getRealisticAvatar(name),
    createdAt: new Date().toISOString()
  };

  db.users.push(newUser);
  saveDb();

  logAudit(
    "usr-admin",
    "CREDENTIAL_CREATED",
    "USER",
    newUser.id,
    `El Director General creó credenciales para: ${newUser.name} (${newUser.email}) - Rol: ${newUser.role}`
  );

  res.json({ success: true, user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role } });
});

// Admin updates any user's profile directly (since Admin is the ONLY ONE who can change sensitive profile data of all advisors and managers)
app.post("/api/admin/users/:id/update-profile", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ success: false, message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "").replace("mock-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester || requester.role !== "ADMIN") {
    return res.status(403).json({ success: false, message: "Solo el Director General puede modificar directamente los perfiles del personal." });
  }

  const { id } = req.params;
  const targetUser = db.users.find((u) => u.id === id);
  if (!targetUser) {
    return res.status(404).json({ success: false, message: "Usuario no encontrado." });
  }

  const { name, email, phone, address, status, role, canCreateCases } = req.body;

  if (name) targetUser.name = name.trim();
  if (email) targetUser.email = email.trim().toLowerCase();
  if (phone !== undefined) targetUser.phone = phone.trim();
  if (address !== undefined) targetUser.address = address.trim();
  if (status) targetUser.status = status;
  if (role) targetUser.role = role;
  if (canCreateCases !== undefined) targetUser.canCreateCases = !!canCreateCases;

  saveDb();

  logAudit(
    requester.id,
    "USER_PROFILE_ADMIN_MUTATED",
    "USER",
    targetUser.id,
    `Admin actualizó el perfil de ${targetUser.name} (${targetUser.role}). Cambios sensibles aplicados directamente.`
  );

  res.json({ success: true, message: "Perfil de personal actualizado directamente.", user: targetUser });
});

// Update Advisor case-creation permission
app.post("/api/users/:id/update-create-permission", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ success: false, message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "").replace("mock-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester || (requester.role !== "ADMIN" && requester.role !== "MANAGER")) {
    return res.status(403).json({ success: false, message: "Solo el Director General o los Gerentes pueden modificar permisos de creación de expedientes." });
  }

  const { id } = req.params;
  const targetUser = db.users.find((u) => u.id === id);
  if (!targetUser) {
    return res.status(404).json({ success: false, message: "Usuario no encontrado." });
  }

  const { canCreateCases } = req.body;
  targetUser.canCreateCases = !!canCreateCases;

  saveDb();

  logAudit(
    requester.id,
    "USER_PERMISSION_MUTATED",
    "USER",
    targetUser.id,
    `${requester.name} modificó permisos de creación para ${targetUser.name}: canCreateCases = ${targetUser.canCreateCases}`
  );

  res.json({ success: true, message: "Permiso de creación actualizado con éxito.", user: targetUser });
});

// Create Case Request (Advisor)
app.post("/api/case-requests", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ success: false, message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "").replace("mock-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester) {
    return res.status(401).json({ success: false, message: "Usuario no encontrado" });
  }

  const { title, description, templateId, partyCounts } = req.body;
  if (!title || !templateId) {
    return res.status(400).json({ success: false, message: "Título y plantilla son requeridos." });
  }

  const newRequest = {
    id: "req-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
    advisorId: requester.id,
    advisorName: requester.name,
    title,
    description: description || "",
    templateId,
    status: "PENDIENTE",
    partyCounts: partyCounts || { compradores: 0, vendedores: 0, garantes: 0 },
    createdAt: new Date().toISOString()
  };

  if (!db.caseRequests) db.caseRequests = [];
  db.caseRequests.push(newRequest);

  // Send a notification to ALL managers and the admin about the new case request
  const notificationMsg = `El asesor ${requester.name} ha solicitado la apertura de un nuevo expediente: "${title}".`;
  db.users.filter(u => u.role === "MANAGER" || u.role === "ADMIN").forEach(m => {
    db.notifications.push({
      id: "not-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
      userId: m.id,
      title: "Nueva Solicitud de Expediente",
      message: notificationMsg,
      type: "INFO",
      read: false,
      createdAt: new Date().toISOString()
    });
  });

  saveDb();

  logAudit(
    requester.id,
    "CASE_REQUESTED",
    "CASE_REQUEST",
    newRequest.id,
    `El asesor ${requester.name} solicitó abrir expediente: "${title}"`
  );

  res.json({ success: true, message: "Solicitud enviada con éxito.", request: newRequest });
});

// Get Case Requests
app.get("/api/case-requests", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ success: false, message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "").replace("mock-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester) {
    return res.status(401).json({ success: false, message: "Usuario no encontrado" });
  }

  if (!db.caseRequests) db.caseRequests = [];

  if (requester.role === "ADMIN" || requester.role === "MANAGER") {
    return res.json(db.caseRequests);
  } else {
    return res.json(db.caseRequests.filter(r => r.advisorId === requester.id));
  }
});

// Resolve Case Request (Manager or Admin)
app.post("/api/case-requests/:id/resolve", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ success: false, message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "").replace("mock-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester || (requester.role !== "ADMIN" && requester.role !== "MANAGER")) {
    return res.status(403).json({ success: false, message: "Solo el Director General o los Gerentes pueden resolver solicitudes." });
  }

  const { id } = req.params;
  if (!db.caseRequests) db.caseRequests = [];
  const request = db.caseRequests.find((r) => r.id === id);
  if (!request) {
    return res.status(404).json({ success: false, message: "Solicitud no encontrada." });
  }

  const { status } = req.body; // "CREADO" or "RECHAZADO"
  if (status !== "CREADO" && status !== "RECHAZADO") {
    return res.status(400).json({ success: false, message: "Estado de resolución inválido." });
  }

  request.status = status;

  // Notify the advisor
  db.notifications.push({
    id: "not-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
    userId: request.advisorId,
    title: status === "CREADO" ? "Solicitud de Expediente Aprobada" : "Solicitud de Expediente Rechazada",
    message: status === "CREADO" 
      ? `Tu solicitud para el expediente "${request.title}" fue aprobada y creada.` 
      : `Tu solicitud para el expediente "${request.title}" fue rechazada por ${requester.name}.`,
    type: status === "CREADO" ? "SUCCESS" : "DANGER",
    read: false,
    createdAt: new Date().toISOString()
  });

  saveDb();

  logAudit(
    requester.id,
    "CASE_REQUEST_RESOLVED",
    "CASE_REQUEST",
    request.id,
    `El ${requester.role} ${requester.name} resolvió la solicitud de expediente "${request.title}" como ${status}.`
  );

  res.json({ success: true, message: "Solicitud resuelta con éxito.", request });
});

// Delete Case Request (Only Admin)
app.delete("/api/case-requests/:id", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ success: false, message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "").replace("mock-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester || requester.role !== "ADMIN") {
    return res.status(403).json({ success: false, message: "Solo el Director General (ADMIN) puede eliminar registros de solicitudes." });
  }

  const { id } = req.params;
  if (!db.caseRequests) db.caseRequests = [];
  const index = db.caseRequests.findIndex((r) => r.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Solicitud no encontrada." });
  }

  const request = db.caseRequests[index];
  db.caseRequests.splice(index, 1);
  saveDb();

  logAudit(
    requester.id,
    "CASE_REQUEST_DELETED",
    "CASE_REQUEST",
    id,
    `El Admin ${requester.name} eliminó permanentemente el registro de solicitud de expediente "${request.title}".`
  );

  res.json({ success: true, message: "Registro de solicitud eliminado permanentemente." });
});

// Templates List with Visibility Control
app.get("/api/templates", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    // If no authorization, only show public templates (isPublic !== false)
    return res.json((db.templates || []).filter(t => t.isPublic !== false));
  }

  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "").replace("mock-jwt-token-for-", "");
  const user = db.users.find(u => u.id === userId);

  if (!user) {
    return res.json((db.templates || []).filter(t => t.isPublic !== false));
  }

  if (user.role === "ADMIN") {
    // Admin sees everything
    return res.json(db.templates || []);
  }

  // Filter templates: show if isPublic is true (or undefined), OR if createdBy matches current user
  const filtered = (db.templates || []).filter(t => {
    const isPublic = t.isPublic !== false; // default is public
    return isPublic || t.createdBy === user.id;
  });

  res.json(filtered);
});

// Delete Template
app.delete("/api/templates/:id", (req, res) => {
  const { id } = req.params;
  const index = db.templates.findIndex((t) => t.id === id);
  if (index !== -1) {
    const name = db.templates[index].name;
    const author = db.templates[index].createdBy || "usr-manager";
    db.templates.splice(index, 1);
    saveDb();
    logAudit(author, "TEMPLATE_DELETED", "TEMPLATE", id, `Plantilla de proceso eliminada: ${name}`);
    res.json({ success: true });
  } else {
    res.status(404).json({ message: "Plantilla no encontrada" });
  }
});

// Create Template
app.post("/api/templates", (req, res) => {
  const authorization = req.headers.authorization;
  let creatorId = "usr-manager"; // default fallback
  if (authorization) {
    const token = authorization.replace("Bearer ", "");
    creatorId = token.replace("real-jwt-token-for-", "").replace("mock-jwt-token-for-", "");
  }
  const user = db.users.find(u => u.id === creatorId);
  const userName = user ? user.name : "Manager";

  const { name, category, description, stages, isPublic } = req.body;
  const newTpl = {
    id: `tpl-${Date.now()}`,
    name,
    category,
    description,
    createdBy: creatorId,
    isPublic: isPublic === undefined ? true : isPublic,
    stages: stages.map((s: any, idx: number) => ({
      id: s.id || `stg-${Date.now()}-${idx}`,
      templateId: `tpl-${Date.now()}`,
      name: s.name,
      description: s.description || "",
      order: idx + 1,
      requirements: (s.requirements || []).map((r: any, rIdx: number) => ({
        id: r.id || `req-${Date.now()}-${idx}-${rIdx}`,
        stageId: s.id || `stg-${Date.now()}-${idx}`,
        type: r.type,
        name: r.name,
        description: r.description || "",
        required: r.required === undefined ? true : r.required,
        formFields: r.formFields || [],
      })),
    })),
  };
  
  db.templates.push(newTpl);
  saveDb();
  logAudit(creatorId, "TEMPLATE_CREATED", "TEMPLATE", newTpl.id, `Plantilla de proceso creada por ${userName}: ${name} (${category}) [Pública: ${newTpl.isPublic}]`);
  res.json(newTpl);
});

// Gemini AI-assisted process template generation!
app.post("/api/templates/generate-ai", async (req, res) => {
  const { sector, requirementsDescription } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    // Graceful lazy fallback
    console.warn("GEMINI_API_KEY not configured or placeholder. Replying with a high-fidelity preset mock template.");
    const randomSuffix = Math.floor(Math.random() * 100);
    const mockTpl = {
      id: `tpl-ai-${Date.now()}`,
      name: `Proceso de ${sector || "Trámite Especial"} AI`,
      category: sector || "General",
      description: requirementsDescription || "Plantilla inteligente de proceso diseñada administrativamente.",
      stages: [
        {
          id: `stg-ai-1-${randomSuffix}`,
          name: "Admisión del Trámite",
          description: "Requisitos de inicio y empadronamiento inicial.",
          order: 1,
          requirements: [
            { id: `req-ai-1-1-${randomSuffix}`, type: "DOCUMENT", name: "Formulario de Solicitud Firmado", required: true },
            { id: `req-ai-1-2-${randomSuffix}`, type: "FORM", name: "Declaración Jurada Tributaria", required: true, formFields: [{ name: "ingresos", label: "Ingresos Brutos Declarados", type: "number", required: true }] }
          ]
        },
        {
          id: `stg-ai-2-${randomSuffix}`,
          name: "Evaluación y Validación",
          description: "Control cruzado de antecedentes y validación de solvencia.",
          order: 2,
          requirements: [
            { id: `req-ai-2-1-${randomSuffix}`, type: "TASK", name: "Inspección técnica ocular / Verificación presencial", required: true },
            { id: `req-ai-2-2-${randomSuffix}`, type: "DOCUMENT", name: "Certificado de Cumplimiento", required: true }
          ]
        },
        {
          id: `stg-ai-3-${randomSuffix}`,
          name: "Resolución y Cierre",
          description: "Acreditación definitiva y entrega de resoluciones.",
          order: 3,
          requirements: [
            { id: `req-ai-3-1-${randomSuffix}`, type: "DOCUMENT", name: "Dictamen Final Legalizado", required: true }
          ]
        }
      ]
    };
    return res.json(mockTpl);
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const userPrompt = `
Genera un esquema estructurado de flujo/etapas y requisitos obligatorios para una plataforma de gestión documental y procesos.
Rubro/Sector: ${sector}
Instrucciones especiales / Descripción: ${requirementsDescription}

Debes responder ÚNICAMENTE con un JSON que cumpla exactamente la estructura del siguiente esquema TypeScript:
{
  "name": string (nombre descriptivo de la plantilla),
  "category": string (rubro: Inmobiliaria, Legal, Seguros, Financiero, RRHH, Consultores, etc.),
  "description": string (breve resumen del proceso global),
  "stages": Array<{
    "id": string (un id único inventado corto, ejemplo 'stg-1'),
    "name": string (nombre de la etapa),
    "description": string (descripción de la etapa),
    "order": number (1, 2, 3...),
    "requirements": Array<{
      "id": string (id único inventado para el requisito),
      "type": "DOCUMENT" | "FORM" | "TASK",
      "name": string (nombre descriptivo del requisito, ej: 'DNI Titular', 'Visitar Inmueble'),
      "description": string (instrucciones breves),
      "required": boolean,
      "formFields": Array<{ // Solo si el type es "FORM", de lo contrario omitir o vaciar
        "name": string,
        "label": string,
        "type": "text" | "number" | "email" | "checkbox" | "textarea",
        "required": boolean
      }>
    }>
  }>
}

Diseña un proceso realista con 3 o 4 etapas bien definidas y coherentes con el sector pedido. Asegúrate de incluir por lo menos un requisito de tipo DOCUMENT, otro de FORM y otro de TASK intercalados de forma lógica.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userPrompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const jsonText = response.text?.trim() || "";
    const parsedTemplate = JSON.parse(jsonText);
    
    // Validate we got correct structure and generate IDs where missing
    const resTemplate = {
      id: `tpl-ai-${Date.now()}`,
      name: parsedTemplate.name || `Proceso Inteligente de ${sector}`,
      category: parsedTemplate.category || sector || "General",
      description: parsedTemplate.description || `Plantilla generada por IA para ${sector}`,
      stages: (parsedTemplate.stages || []).map((s: any, idx: number) => ({
        id: s.id || `stg-ai-${Date.now()}-${idx}`,
        templateId: `tpl-ai-${Date.now()}`,
        name: s.name || `Etapa ${idx + 1}`,
        description: s.description || "",
        order: s.order || (idx + 1),
        requirements: (s.requirements || []).map((r: any, rIdx: number) => ({
          id: r.id || `req-ai-${Date.now()}-${idx}-${rIdx}`,
          stageId: s.id || `stg-ai-${Date.now()}-${idx}`,
          type: r.type || "DOCUMENT",
          name: r.name || `Requisito ${rIdx + 1}`,
          description: r.description || "",
          required: r.required !== false,
          formFields: r.formFields || [],
        })),
      })),
    };

    res.json(resTemplate);
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: true, message: error.message || "Error al conectar con la Inteligencia Artificial de Gemini." });
  }
});

// PDF template parsing endpoint for MANAGER & ADMIN roles
app.post("/api/templates/parse-pdf", async (req, res) => {
  const { fileName, fileContent } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!fileContent) {
    return res.status(400).json({ error: "No se proporcionó contenido de archivo." });
  }

  // Fallback to high-fidelity template mocks if Gemini API is missing or set to placeholder
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    console.warn("GEMINI_API_KEY not configured or placeholder. Parsing mock template based on name.");
    const nameLower = (fileName || "").toLowerCase();
    let category = "General";
    let name = "Proceso Personalizado Extraído";
    let stages: any[] = [
      {
        id: `stg-pdf-1-${Date.now()}`,
        name: "Revisión de Legajo y Solicitud",
        description: "Etapa inicial extraída del documento PDF.",
        order: 1,
        requirements: [
          { id: `req-pdf-1-1-${Date.now()}`, type: "DOCUMENT", name: "Documento de Identidad (DNI/NIE)", required: true, description: "Subir copia legible a color de frente y dorso." },
          { id: `req-pdf-1-2-${Date.now()}`, type: "FORM", name: "Formulario de Solicitud de Entrada", required: true, formFields: [{ name: "nombre_completo", label: "Nombre Completo", type: "text", required: true }] }
        ]
      },
      {
        id: `stg-pdf-2-${Date.now()}`,
        name: "Validación de Fondos y Solvencia",
        description: "Control de riesgo crediticio y perfil.",
        order: 2,
        requirements: [
          { id: `req-pdf-2-1-${Date.now()}`, type: "DOCUMENT", name: "Comprobantes de Ingresos (Últimos 3 meses)", required: true },
          { id: `req-pdf-2-2-${Date.now()}`, type: "TASK", name: "Verificación de antecedentes penales y crediticios", required: true }
        ]
      }
    ];

    if (nameLower.includes("inmobili") || nameLower.includes("prop") || nameLower.includes("alquiler") || nameLower.includes("casa")) {
      category = "Inmobiliaria";
      name = "Alquiler o Compraventa Inmobiliaria (PDF)";
      stages = [
        {
          id: `stg-pdf-1-${Date.now()}`,
          name: "Reservación del Inmueble",
          description: "Requisitos iniciales para asentar la reserva temporal.",
          order: 1,
          requirements: [
            { id: `req-pdf-1-1-${Date.now()}`, type: "DOCUMENT", name: "Documento de Identidad (DNI/NIE)", required: true, description: "Copia de los firmantes de la reserva." },
            { id: `req-pdf-1-2-${Date.now()}`, type: "DOCUMENT", name: "Comprobante de Pago de Reserva", required: true, description: "Recibo de transferencia bancaria." }
          ]
        },
        {
          id: `stg-pdf-2-${Date.now()}`,
          name: "Evaluación de Garantías",
          description: "Análisis financiero del inquilino o comprador.",
          order: 2,
          requirements: [
            { id: `req-pdf-2-1-${Date.now()}`, type: "DOCUMENT", name: "Últimas 3 Nóminas o Balances", required: true },
            { id: `req-pdf-2-2-${Date.now()}`, type: "FORM", name: "Ficha de Avalista Solidario", required: false, formFields: [{ name: "nombre_aval", label: "Nombre del Avalista", type: "text", required: true }, { name: "dni_aval", label: "DNI Avalista", type: "text", required: true }] }
          ]
        },
        {
          id: `stg-pdf-3-${Date.now()}`,
          name: "Firma de Contrato",
          description: "Formalización contractual definitiva.",
          order: 3,
          requirements: [
            { id: `req-pdf-3-1-${Date.now()}`, type: "TASK", name: "Coordinación de firma en Notaría o Firma Digital", required: true },
            { id: `req-pdf-3-2-${Date.now()}`, type: "DOCUMENT", name: "Contrato de Arrendamiento / Compraventa Firmado", required: true }
          ]
        }
      ];
    } else if (nameLower.includes("legal") || nameLower.includes("jurid") || nameLower.includes("caso") || nameLower.includes("demanda")) {
      category = "Legal";
      name = "Instrucción de Proceso Judicial (PDF)";
      stages = [
        {
          id: `stg-pdf-1-${Date.now()}`,
          name: "Apertura del Expediente",
          description: "Recopilación de pruebas e identificaciones de las partes.",
          order: 1,
          requirements: [
            { id: `req-pdf-1-1-${Date.now()}`, type: "DOCUMENT", name: "Poder General para Pleitos", required: true },
            { id: `req-pdf-1-2-${Date.now()}`, type: "FORM", name: "Ficha de Hechos Detallados", required: true, formFields: [{ name: "descripcion_hechos", label: "Relato Cronológico de los Hechos", type: "textarea", required: true }] }
          ]
        },
        {
          id: `stg-pdf-2-${Date.now()}`,
          name: "Mediación y Trámite Previo",
          description: "Intentos de conciliación prejudicial.",
          order: 2,
          requirements: [
            { id: `req-pdf-2-1-${Date.now()}`, type: "DOCUMENT", name: "Acta de Conciliación Previa", required: true },
            { id: `req-pdf-2-2-${Date.now()}`, type: "TASK", name: "Redacción final de la Demanda Judicial", required: true }
          ]
        }
      ];
    } else if (nameLower.includes("seguro") || nameLower.includes("poliza") || nameLower.includes("siniestro")) {
      category = "Seguros";
      name = "Declaración de Siniestro (PDF)";
      stages = [
        {
          id: `stg-pdf-1-${Date.now()}`,
          name: "Declaración Inicial",
          description: "Denuncia y acreditación de los hechos de la póliza.",
          order: 1,
          requirements: [
            { id: `req-pdf-1-1-${Date.now()}`, type: "DOCUMENT", name: "Denuncia Policial / Parte Amistoso", required: true },
            { id: `req-pdf-1-2-${Date.now()}`, type: "FORM", name: "Declaración Detallada de Daños", required: true, formFields: [{ name: "detalles_siniestro", label: "Relato de Daños y Lesiones", type: "textarea", required: true }] }
          ]
        },
        {
          id: `stg-pdf-2-${Date.now()}`,
          name: "Peritaje y Cierre",
          description: "Control de perito y cotización oficial de talleres.",
          order: 2,
          requirements: [
            { id: `req-pdf-2-1-${Date.now()}`, type: "TASK", name: "Visita de Perito Tasador", required: true },
            { id: `req-pdf-2-2-${Date.now()}`, type: "DOCUMENT", name: "Presupuesto de Reparación Firmado", required: true }
          ]
        }
      ];
    }

    const resTpl = {
      name,
      category,
      description: `Plantilla de proceso extraída del archivo PDF "${fileName}" mediante análisis inteligente de estructura.`,
      stages
    };
    return res.json(resTpl);
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const userPrompt = `
Has recibido un archivo de plantilla operativa (generalmente un documento PDF o directiva que detalla etapas de trabajo, requerimientos, formularios y tareas).
Analiza el documento adjunto y extrae de forma inteligente un esquema de flujo con etapas secuenciales, tareas y documentos requeridos.
Si el PDF no contiene texto legible claro o es una imagen, infiere un flujo lógico basado en el nombre del archivo: "${fileName}".

Debes responder ÚNICAMENTE con un JSON válido que cumpla exactamente con la siguiente estructura de TypeScript:
{
  "name": string (nombre descriptivo del proceso sugerido en el documento),
  "category": string (rubro: Inmobiliaria, Legal, Seguros, Financiero, RRHH, Consultores, etc.),
  "description": string (breve resumen del proceso global),
  "stages": Array<{
    "id": string (un id único inventado corto, ej 'stg-1'),
    "name": string (nombre de la etapa),
    "description": string (descripción de la etapa),
    "order": number (1, 2, 3...),
    "requirements": Array<{
      "id": string (id único inventado corto),
      "type": "DOCUMENT" | "FORM" | "TASK",
      "name": string (nombre descriptivo del requisito),
      "description": string (instrucciones breves de lo que se debe hacer),
      "required": boolean,
      "formFields": Array<{ // Solo si type es "FORM", de lo contrario omitir o vaciar
        "name": string,
        "label": string,
        "type": "text" | "number" | "email" | "checkbox" | "textarea",
        "required": boolean
      }>
    }>
  }>
}

Intenta diseñar al menos 2 o 3 etapas coherentes según lo expresado en el PDF, con 2 o 3 requisitos por etapa.
    `;

    let rawBase64 = fileContent;
    if (rawBase64.includes("base64,")) {
      rawBase64 = rawBase64.split("base64,")[1];
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: "application/pdf",
            data: rawBase64,
          },
        },
        userPrompt,
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    const jsonText = response.text?.trim() || "";
    const parsedTemplate = JSON.parse(jsonText);

    const resTemplate = {
      name: parsedTemplate.name || `Proceso Extraído de ${fileName}`,
      category: parsedTemplate.category || "General",
      description: parsedTemplate.description || `Plantilla procesada mediante Gemini a partir del PDF "${fileName}"`,
      stages: (parsedTemplate.stages || []).map((s: any, idx: number) => ({
        id: s.id || `stg-pdf-${Date.now()}-${idx}`,
        name: s.name || `Etapa ${idx + 1}`,
        description: s.description || "",
        order: s.order || (idx + 1),
        requirements: (s.requirements || []).map((r: any, rIdx: number) => ({
          id: r.id || `req-pdf-${Date.now()}-${idx}-${rIdx}`,
          type: r.type || "DOCUMENT",
          name: r.name || "Requisito",
          description: r.description || "",
          required: r.required === undefined ? true : r.required,
          formFields: r.formFields || []
        }))
      }))
    };

    res.json(resTemplate);
  } catch (err: any) {
    console.error("Error parsing PDF template:", err);
    res.status(500).json({ error: "Fallo al procesar el archivo de plantilla PDF con Gemini: " + err.message });
  }
});

// Cases List (Hydrated with Current Stage info, requirements, docs, tasks)
function getHydratedCase(caseId: string) {
  const basicCase = db.cases.find((c) => c.id === caseId);
  if (!basicCase) return null;

  const template = db.templates.find((t) => t.id === basicCase.templateId);
  
  // Use case-specific stages if available, otherwise fall back to template stages
  const stages = (basicCase.stages && basicCase.stages.length > 0)
    ? basicCase.stages
    : (template ? template.stages : []);

  const currentStage = stages.find((s: any) => s.id === basicCase.currentStageId) || stages[0] || null;
  const participants = db.participants.filter((p) => p.caseId === caseId);

  // Hydrate all requirements for the current stage with actual document/task status attached
  let requirementsHydrated = [];
  if (currentStage && currentStage.requirements) {
    requirementsHydrated = currentStage.requirements.map((req: any) => {
      // Find document uploaded for this requirement in this case
      const existingDoc = db.documents.find((d) => d.caseId === caseId && d.requirementId === req.id);
      // Find task mapped for this requirement
      let existingTask = db.tasks.find((t) => t.caseId === caseId && t.requirementId === req.id);
      
      // If task doesn't exist yet but requirement type is TASK, let's auto-provision it
      if (!existingTask && req.type === "TASK") {
        existingTask = {
          id: `tsk-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          caseId,
          requirementId: req.id,
          name: req.name,
          description: req.description,
          status: "PENDIENTE",
        };
        db.tasks.push(existingTask);
        saveDb();
      }

      // If form doesn't exist yet as a task holding form values
      if (!existingTask && req.type === "FORM") {
        existingTask = {
          id: `tsk-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          caseId,
          requirementId: req.id,
          name: req.name,
          description: req.description,
          status: "PENDIENTE", // COMPLETE once form is submitted
          formValues: {},
          formInstances: []
        };
        syncTaskFormInstances(basicCase, existingTask);
        db.tasks.push(existingTask);
        saveDb();
      }

      const caseStates = (basicCase as any).requirementStates?.[req.id] || {};
      return {
        ...req,
        document: existingDoc || null,
        task: existingTask || null,
        downloadEnabled: typeof caseStates.downloadEnabled === 'boolean' ? caseStates.downloadEnabled : false,
        uploadEnabled: typeof caseStates.uploadEnabled === 'boolean' ? caseStates.uploadEnabled : false,
        uploadRequestStatus: caseStates.uploadRequestStatus || null,
        uploadRequestReason: caseStates.uploadRequestReason || null,
        uploadConfig: caseStates.uploadConfig || null,
      };
    });
  }

  // Find observations for this case and current stage
  const observations = db.observations.filter((o) => o.caseId === caseId);

  // Return hydrated details
  return {
    ...basicCase,
    template,
    stages,
    currentStage,
    participants,
    requirements: requirementsHydrated,
    observations,
  };
}

app.get("/api/cases", (req, res) => {
  const hydrated = db.cases.map((c) => {
    const template = db.templates.find((t) => t.id === c.templateId);
    const stages = (c.stages && c.stages.length > 0) ? c.stages : (template ? template.stages : []);
    const stagesOrdered = stages.slice().sort((a: any, b: any) => a.order - b.order);
    const currentStageId = c.currentStageId || (stagesOrdered[0]?.id || "");
    const currentIdx = stagesOrdered.findIndex((s: any) => s.id === currentStageId);

    const progress = {
      total: (c.stagesDetermined !== false) ? stagesOrdered.length : 0,
      currentIdx: currentIdx + 1,
      currentName: stagesOrdered.find((s: any) => s.id === currentStageId)?.name || "",
    };

    const advisor = db.users.find((u) => u.id === c.advisorId);
    const manager = db.users.find((u) => u.id === c.managerId);

    // Count pending/observed requirements
    const caseHydrated = getHydratedCase(c.id);
    let openObsCount = 0;
    let pendingReqCount = 0;
    if (caseHydrated) {
      openObsCount = caseHydrated.observations.filter((o: any) => o.status === "ABIERTA").length;
      pendingReqCount = caseHydrated.requirements.filter((r: any) => {
        if (!r.required) return false;
        if (r.type === "DOCUMENT" && (!r.document || r.document.status !== "APROBADO")) return true;
        if ((r.type === "TASK" || r.type === "FORM") && (!r.task || r.task.status !== "COMPLETA")) return true;
        return false;
      }).length;
    }

    return {
      ...c,
      templateName: template ? template.name : "N/A",
      progress,
      advisor,
      manager,
      openObservationsCount: openObsCount,
      pendingRequirementsCount: pendingReqCount,
    };
  });
  res.json(hydrated);
});

// Get single Case
app.get("/api/cases/:id", (req, res) => {
  const { id } = req.params;
  const hydrated = getHydratedCase(id);
  if (hydrated) {
    res.json(hydrated);
  } else {
    res.status(404).json({ message: "Expediente no encontrado" });
  }
});

// Get Case Timeline & Audit History
app.get("/api/cases/:id/timeline-history", (req, res) => {
  const { id } = req.params;
  const caseObj = db.cases.find((c) => c.id === id);
  if (!caseObj) {
    return res.status(404).json({ message: "Expediente no encontrado." });
  }

  const template = db.templates.find((t) => t.id === caseObj.templateId);
  const stages = template ? template.stages.slice().sort((a: any, b: any) => a.order - b.order) : [];

  // 1. Gather all logs related to this case
  const caseLogs = db.auditLogs.filter((log) => 
    log.caseId === id || 
    log.entityId === id ||
    (log.entityType === "CASE" && log.entityId === id)
  );

  // 2. Advisor logins
  const advisorLogins = db.auditLogs.filter((log) => 
    log.userId === caseObj.advisorId && log.action === "LOGIN"
  );

  // 3. Compute stage history dynamically
  const stageHistory = [];
  if (stages.length > 0) {
    // Collect all stage changes for this case from oldest to newest
    const transitionLogs = caseLogs
      .filter((l) => l.action === "STAGE_CHANGED" || l.action === "STAGE_RETROCEDED")
      .slice()
      .reverse();

    // Fallback created time
    let lastTime = new Date(caseObj.createdAt || caseObj.id.replace("case-", "")).getTime();
    if (isNaN(lastTime)) {
      lastTime = Date.now();
    }

    let lastStageName = stages[0]?.name || "Etapa Inicial";

    for (const tLog of transitionLogs) {
      const tTime = new Date(tLog.createdAt).getTime();
      const diffMs = tTime - lastTime;

      stageHistory.push({
        stageName: lastStageName,
        enteredAt: new Date(lastTime).toISOString(),
        exitedAt: new Date(tTime).toISOString(),
        durationMs: diffMs,
        durationText: formatDurationSpan(diffMs)
      });

      // Extract new stage name from log description: "Avanzó etapa de 'A' a 'B'"
      const match = tLog.description.match(/a '([^']+)'/);
      lastStageName = (match && match[1]) ? match[1] : "Siguiente Etapa";
      lastTime = tTime;
    }

    // Current/active stage (ongoing)
    const isFinished = caseObj.status === "FINALIZADO";
    const nowTime = isFinished 
      ? new Date(caseObj.updatedAt || Date.now()).getTime()
      : Date.now();
    const activeDiffMs = nowTime - lastTime;

    stageHistory.push({
      stageName: lastStageName,
      enteredAt: new Date(lastTime).toISOString(),
      exitedAt: isFinished ? new Date(nowTime).toISOString() : null,
      durationMs: activeDiffMs,
      durationText: formatDurationSpan(activeDiffMs)
    });
  }

  // Format Helper inside the handler
  function formatDurationSpan(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      const remHours = hours % 24;
      return `${days} ${days === 1 ? "día" : "días"}${remHours > 0 ? `, ${remHours} ${remHours === 1 ? "hora" : "horas"}` : ""}`;
    }
    if (hours > 0) {
      const remMinutes = minutes % 60;
      return `${hours} ${hours === 1 ? "hora" : "horas"}${remMinutes > 0 ? `, ${remMinutes} ${remMinutes === 1 ? "minuto" : "minutos"}` : ""}`;
    }
    if (minutes > 0) {
      return `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
    }
    return "Menos de un minuto";
  }

  // Return full package of timeline history
  res.json({
    caseId: id,
    code: caseObj.code,
    title: caseObj.title,
    advisorId: caseObj.advisorId,
    status: caseObj.status,
    createdAt: caseObj.createdAt,
    stageHistory,
    advisorLogins,
    allLogs: caseLogs // unified timeline logs
  });
});

// Delete Case
app.delete("/api/cases/:id", (req, res) => {
  const { id } = req.params;
  const index = db.cases.findIndex((c) => c.id === id);
  if (index !== -1) {
    const code = db.cases[index].code;
    const title = db.cases[index].title;
    db.cases.splice(index, 1);
    // Delete linked records
    db.participants = db.participants.filter(p => p.caseId !== id);
    db.documents = db.documents.filter(d => d.caseId !== id);
    db.tasks = db.tasks.filter(t => t.caseId !== id);
    db.observations = db.observations.filter(o => o.caseId !== id);
    saveDb();
    logAudit("usr-manager", "CASE_DELETED", "CASE", id, `Expediente eliminado: ${code} - ${title}`);
    res.json({ success: true });
  } else {
    res.status(404).json({ message: "Expediente no encontrado" });
  }
});

// Create Case
app.post("/api/cases", (req, res) => {
  const { title, description, templateId, advisorId, managerId, participants, stagesDetermined, partyCounts } = req.body;
  const template = db.templates.find((t) => t.id === templateId);

  if (!template || template.stages.length === 0) {
    return res.status(400).json({ message: "La plantilla seleccionada no es válida o no contiene etapas." });
  }

  const codeNum = db.cases.length + 1;
  const caseCode = `EXP-${new Date().getFullYear()}-${String(codeNum).padStart(3, "0")}`;
  const firstStage = template.stages.sort((a: any, b: any) => a.order - b.order)[0];

  const newCase = {
    id: `case-${Date.now()}`,
    code: caseCode,
    title,
    description: description || "",
    templateId,
    status: "PENDIENTE" as const,
    currentStageId: firstStage.id,
    advisorId: advisorId || "usr-asesor1",
    managerId: managerId || "unassigned",
    stages: JSON.parse(JSON.stringify(template.stages)), // deep clone stages specifically for this case
    stagesDetermined: stagesDetermined !== undefined ? stagesDetermined : true,
    partyCounts: partyCounts || { compradores: 0, vendedores: 0, garantes: 0 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.cases.push(newCase);

  // Initialize participants if passed
  if (participants && Array.isArray(participants)) {
    participants.forEach((p: any) => {
      db.participants.push({
        id: `part-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        caseId: newCase.id,
        role: p.role || "Participante",
        name: p.name,
        apellido: p.apellido,
        dni: p.dni,
        cuitCuil: p.cuitCuil || "",
        email: p.email || "",
        telefono: p.telefono || "",
        observaciones: p.observaciones || "",
      });
    });
  }

  // Pre-provision form and task records for the first stage
  firstStage.requirements.forEach((req: any) => {
    if (req.type === "TASK") {
      db.tasks.push({
        id: `tsk-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        caseId: newCase.id,
        requirementId: req.id,
        name: req.name,
        description: req.description,
        status: "PENDIENTE",
      });
    } else if (req.type === "FORM") {
      const formTask = {
        id: `tsk-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        caseId: newCase.id,
        requirementId: req.id,
        name: req.name,
        description: req.description,
        status: "PENDIENTE",
        formInstances: [],
        formValues: {},
      };
      syncTaskFormInstances(newCase, formTask);
      db.tasks.push(formTask);
    }
  });

  saveDb();

  // Notify Advisor
  createNotification(
    newCase.advisorId,
    "Nuevo expediente iniciado",
    `Has iniciado el expediente ${caseCode}: ${title}. Queda a la espera de asignación de un manager.`,
    "INFO",
    newCase.id
  );

  // Notify All Managers
  db.users.filter(u => u.role === "MANAGER").forEach(m => {
    createNotification(
      m.id,
      "Expediente en espera",
      `Se ha iniciado el expediente ${caseCode}: ${title}. Está a la espera de un manager asignado.`,
      "WARNING",
      newCase.id
    );
  });

  logAudit(advisorId || "usr-asesor1", "CASE_CREATED", "CASE", newCase.id, `Expediente creado en espera: ${caseCode} - ${title}`);

  res.json(newCase);
});

// Update Case Info & Assign Advisor / Update Status
app.post("/api/cases/:id/update", (req, res) => {
  const { id } = req.params;
  const { title, description, advisorId, managerId, status, partyCounts } = req.body;
  const caseIdx = db.cases.findIndex((c) => c.id === id);
  if (caseIdx !== -1) {
    const oldCase = db.cases[caseIdx];
    const originalAdvisor = oldCase.advisorId;
    const originalStatus = oldCase.status;
    
    // Authorization check context
    const authHeader = req.headers.authorization;
    let updaterId = "usr-manager";
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      updaterId = token.replace("real-jwt-token-for-", "").replace("mock-jwt-token-for-", "");
    }
    const updaterUser = db.users.find(u => u.id === updaterId);
    const updaterName = updaterUser ? updaterUser.name : "Manager";

    if (managerId !== undefined && managerId !== oldCase.managerId) {
      const isAdmin = updaterUser && updaterUser.role === "ADMIN";
      const isUnassigned = !oldCase.managerId || oldCase.managerId === "unassigned" || oldCase.managerId === "";
      
      if (!isAdmin) {
        if (isUnassigned && managerId === updaterId) {
          // Allowed: Manager is claiming the unassigned case for themselves
        } else {
          return res.status(403).json({ 
            message: "Solo el administrador puede cambiar el manager asignado de este expediente." 
          });
        }
      }
    }

    const updatedStages = req.body.stages !== undefined ? req.body.stages : oldCase.stages;
    let updatedCurrentStageId = oldCase.currentStageId;
    if (updatedStages && updatedStages.length > 0) {
      const stageExists = updatedStages.some((s: any) => s.id === oldCase.currentStageId);
      if (!stageExists) {
        updatedCurrentStageId = updatedStages[0].id;
      }
    }

    const newPartyCounts = partyCounts !== undefined ? partyCounts : oldCase.partyCounts;

    db.cases[caseIdx] = {
      ...oldCase,
      title: title || oldCase.title,
      description: description !== undefined ? description : oldCase.description,
      advisorId: advisorId || oldCase.advisorId,
      managerId: managerId || oldCase.managerId,
      status: status || oldCase.status,
      currentStageId: updatedCurrentStageId,
      stages: updatedStages,
      stagesDetermined: req.body.stagesDetermined !== undefined ? req.body.stagesDetermined : oldCase.stagesDetermined,
      partyCounts: newPartyCounts,
      updatedAt: new Date().toISOString(),
    };
    
    // Sync all tasks of type "FORM" for this case to match the new counts
    const caseObj = db.cases[caseIdx];
    db.tasks.filter((t: any) => t.caseId === id).forEach((task: any) => {
      // Find the requirement to check if it's a form
      const reqId = task.requirementId;
      // We can also just check if task has formInstances or if we want to initialize them
      if (task.formInstances !== undefined || (task.formValues && !task.formInstances)) {
        syncTaskFormInstances(caseObj, task);
      }
    });

    saveDb();

    // Trigger activation alert
    if (status && status !== originalStatus) {
      logAudit(updaterId, "CASE_STATUS_CHANGED", "CASE", id, `Expediente ${oldCase.code} cambió de estado: ${originalStatus} -> ${status} (por ${updaterName})`);
      
      createNotification(
        db.cases[caseIdx].advisorId,
        `Estado del expediente actualizado`,
        `El expediente ${oldCase.code} ahora está en estado ${status}.`,
        status === "ACTIVO" ? "SUCCESS" : "INFO",
        id
      );
    }

    // Trigger re-assignment alert
    if (advisorId && advisorId !== originalAdvisor) {
      createNotification(
        advisorId,
        "Expediente Re-asignado",
        `Se te ha re-asignado el expediente ${db.cases[caseIdx].code}`,
        "INFO",
        id
      );
      logAudit(updaterId, "CASE_REASSIGNED", "CASE", id, `Asesor modificado para ${db.cases[caseIdx].code}. Anterior: ${originalAdvisor}, Nuevo: ${advisorId}`);
    }

    res.json(db.cases[caseIdx]);
  } else {
    res.status(404).json({ message: "Expediente no encontrado." });
  }
});

// Claim Case
app.post("/api/cases/:id/claim", (req, res) => {
  const { id } = req.params;
  const userId = getUserIdFromRequest(req);
  const user = db.users.find((u) => u.id === userId);

  if (!user || (user.role !== "MANAGER" && user.role !== "ADMIN")) {
    return res.status(403).json({ message: "Solo los managers o administradores pueden reclamar expedientes." });
  }

  const caseObj = db.cases.find((c) => c.id === id);
  if (!caseObj) {
    return res.status(404).json({ message: "Expediente no encontrado." });
  }

  if (caseObj.managerId && caseObj.managerId !== "unassigned" && caseObj.managerId !== "") {
    return res.status(400).json({ message: "Este expediente ya tiene un manager asignado." });
  }

  caseObj.managerId = user.id;
  caseObj.updatedAt = new Date().toISOString();
  saveDb();

  createNotification(
    caseObj.advisorId,
    "Manager Asignado",
    `El manager ${user.name} ha tomado tu expediente ${caseObj.code}.`,
    "INFO",
    caseObj.id
  );

  logAudit(user.id, "CASE_CLAIMED", "CASE", caseObj.id, `El manager ${user.name} reclamó el expediente: ${caseObj.code}`);
  res.json(caseObj);
});

// Add Participant
app.post("/api/cases/:id/participants", (req, res) => {
  const { id } = req.params;
  const { role, name, apellido, dni, cuitCuil, email, telefono, observaciones } = req.body;
  const userId = getUserIdFromRequest(req);

  const accessCheck = checkAndAssignManager(id, userId);
  if (!accessCheck.allowed) {
    return res.status(403).json({ message: accessCheck.message });
  }

  const newPart = {
    id: `part-${Date.now()}`,
    caseId: id,
    role: role || "Participante",
    name,
    apellido,
    dni,
    cuitCuil,
    email,
    telefono,
    observaciones: observaciones || "",
  };

  db.participants.push(newPart);
  saveDb();
  logAudit("usr-asesor1", "PARTICIPANT_ADDED", "PARTICIPANT", newPart.id, `Participante agregado al expediente: ${name} ${apellido} (${role})`);
  res.json(newPart);
});

// Delete Participant
app.delete("/api/cases/:id/participants/:pId", (req, res) => {
  const { pId } = req.params;
  const index = db.participants.findIndex((p) => p.id === pId);
  if (index !== -1) {
    const p = db.participants[index];
    const userId = getUserIdFromRequest(req);
    const accessCheck = checkAndAssignManager(p.caseId, userId);
    if (!accessCheck.allowed) {
      return res.status(403).json({ message: accessCheck.message });
    }
    db.participants.splice(index, 1);
    saveDb();
    logAudit("usr-asesor1", "PARTICIPANT_REMOVED", "PARTICIPANT", pId, `Participante removido: ${p.name} ${p.apellido}`);
    res.json({ success: true });
  } else {
    res.status(404).json({ message: "Participante no encontrado" });
  }
});

// Task Complete / Form fill
app.post("/api/cases/:id/requirements/:reqId/form", (req, res) => {
  const { id, reqId } = req.params;
  const { formValues, userId, instanceId } = req.body;

  const user = db.users.find(u => u.id === userId) || { name: "Asesor" };
  const caseObj = db.cases.find(c => c.id === id);

  // Find or provision task
  let task = db.tasks.find((t) => t.caseId === id && t.requirementId === reqId);
  if (!task) {
    task = {
      id: `tsk-${Date.now()}`,
      caseId: id,
      requirementId: reqId,
      name: "Formulario",
      status: "PENDIENTE",
      formInstances: []
    };
    db.tasks.push(task);
  }

  // Ensure formInstances is synchronized if we have party counts
  if (caseObj && (!task.formInstances || task.formInstances.length === 0)) {
    syncTaskFormInstances(caseObj, task);
  }

  if (instanceId && task.formInstances && task.formInstances.length > 0) {
    const inst = task.formInstances.find((i: any) => i.id === instanceId);
    if (inst) {
      inst.status = "COMPLETA";
      inst.formValues = formValues;
      inst.completedBy = user.name;
      inst.completedAt = new Date().toISOString();
    }
    
    // Check if all instances are complete
    const allComplete = task.formInstances.every((i: any) => i.status === "COMPLETA");
    task.status = allComplete ? "COMPLETA" : "PENDIENTE";
    if (allComplete) {
      task.completedAt = new Date().toISOString();
      task.completedBy = user.name;
    }
  } else {
    // Fallback standard behavior
    task.status = "COMPLETA";
    task.completedAt = new Date().toISOString();
    task.completedBy = user.name;
    task.formValues = formValues;
  }

  // Let's do validation to verify if other requirements are blocked or if we can transition status
  if (caseObj && caseObj.status === "PENDIENTE") {
    caseObj.status = "ACTIVO";
  }

  saveDb();
  logAudit(userId || "usr-asesor1", "FORM_SUBMITTED", "TASK", task.id, `Formulario completado en expediente: ${task.name}`);
  res.json(task);
});

// Task Manual Complete Toggle
app.post("/api/cases/:id/requirements/:reqId/task", (req, res) => {
  const { id, reqId } = req.params;
  const { status, userId } = req.body; // status: "PENDIENTE" | "EN_PROGRESO" | "COMPLETA"

  const user = db.users.find(u => u.id === userId) || { name: "Asesor" };

  let task = db.tasks.find((t) => t.caseId === id && t.requirementId === reqId);
  if (!task) {
    // Find requirement name
    const hydrated = getHydratedCase(id);
    const reqDef = hydrated?.currentStage?.requirements?.find((r: any) => r.id === reqId);
    task = {
      id: `tsk-${Date.now()}`,
      caseId: id,
      requirementId: reqId,
      name: reqDef ? reqDef.name : "Tarea",
      status: "PENDIENTE",
    };
    db.tasks.push(task);
  }

  task.status = status || "COMPLETA";
  if (task.status === "COMPLETA") {
    task.completedAt = new Date().toISOString();
    task.completedBy = user.name;
  } else {
    task.completedAt = undefined;
    task.completedBy = undefined;
  }

  const caseObj = db.cases.find(c => c.id === id);
  if (caseObj && caseObj.status === "PENDIENTE") {
    caseObj.status = "ACTIVO";
  }

  saveDb();
  logAudit(userId || "usr-asesor1", "TASK_UPDATED", "TASK", task.id, `Estado de tarea de expediente modificado a ${task.status}: ${task.name}`);
  res.json(task);
});

// Upload Document (advisor)
app.post("/api/cases/:id/requirements/:reqId/upload", async (req, res) => {
  try {
    const { id, reqId } = req.params;
    const { fileName, fileType, fileSize, fileContent, userId } = req.body;

    const user = db.users.find((u) => u.id === userId) || { name: "Asesor" };

    // Find if document already exists
    let doc = db.documents.find((d) => d.caseId === id && d.requirementId === reqId);
    const docId = doc ? doc.id : `doc-${Date.now()}`;

    // Upload to Firebase Storage if configured
    let gcsPath: string | null = null;
    if (firebaseStorage && fileContent) {
      gcsPath = await uploadToGCS(docId, id, reqId, fileName, fileContent, fileType);
    }

    if (doc) {
      // Update existing with new version history
      const oldVersion = {
        version: doc.version,
        fileName: doc.fileName || doc.name,
        fileUrl: doc.fileUrl || "",
        gcsPath: doc.gcsPath || null,
        uploadedAt: doc.uploadedAt || new Date().toISOString(),
        uploadedBy: doc.uploadedBy || user.name,
      };
      doc.history = doc.history || [];
      doc.history.push(oldVersion);

      doc.version += 1;
      doc.fileName = fileName;
      doc.fileType = fileType || "application/pdf";
      doc.fileSize = fileSize || "N/A";
      
      if (gcsPath) {
        doc.fileUrl = `/api/documents/download/${doc.id}`;
        doc.gcsPath = gcsPath;
      } else {
        doc.fileUrl = fileContent; // base64 payload fallback
        doc.gcsPath = null;
      }
      
      doc.status = "EN_REVISION"; // resets to review when uploaded!
      doc.uploadedAt = new Date().toISOString();
      doc.uploadedBy = user.name;
    } else {
      // Generate new document
      const hydrated = getHydratedCase(id);
      const reqDef = hydrated?.currentStage?.requirements?.find((r: any) => r.id === reqId);
      
      doc = {
        id: docId,
        caseId: id,
        requirementId: reqId,
        name: reqDef ? reqDef.name : "Documento",
        status: "EN_REVISION",
        fileUrl: gcsPath ? `/api/documents/download/${docId}` : fileContent,
        gcsPath: gcsPath || null,
        fileName,
        fileType: fileType || "application/pdf",
        fileSize: fileSize || "N/A",
        uploadedAt: new Date().toISOString(),
        uploadedBy: user.name,
        version: 1,
        history: [],
      };
      db.documents.push(doc);
    }

    // Also check if we should change case status
    const caseObj = db.cases.find(c => c.id === id);
    if (caseObj) {
      if (caseObj.status === "PENDIENTE") {
        caseObj.status = "ACTIVO";
      }
    }

    // Auto-resolve any open observation on this requirement
    const observationsOnDoc = db.observations.filter(o => o.caseId === id && o.entityId === doc!.id && o.status === "ABIERTA");
    observationsOnDoc.forEach(obs => {
      obs.status = "RESUELTA";
      obs.response = "Se cargó una nueva versión correctiva del documento.";
      obs.respondedAt = new Date().toISOString();
    });

    saveDb();

    // Notify Manager
    if (caseObj) {
      createNotification(
        caseObj.managerId,
        "Documento cargado para revisión",
        `Se ha subido una nueva versión de '${doc.name}' para el expediente ${caseObj.code}.`,
        "INFO",
        id
      );
    }

    logAudit(userId || "usr-asesor1", "DOCUMENT_UPLOADED", "DOCUMENT", doc.id, `Documento cargado: ${doc.name} (V${doc.version})`);
    res.json(doc);
  } catch (error: any) {
    console.error("Error in document upload route:", error);
    res.status(500).json({ success: false, message: `Error al subir el documento: ${error.message}` });
  }
});

// Download/View Document Proxy Route
app.get("/api/documents/download/:docId", async (req, res) => {
  try {
    const { docId } = req.params;
    const docObj = db.documents.find((d) => d.id === docId);
    if (!docObj) {
      return res.status(404).send("Documento no encontrado.");
    }

    // Try GCS first if it has a path
    if (docObj.gcsPath && firebaseStorage) {
      try {
        const fileRef = fbStorageRef(firebaseStorage, docObj.gcsPath);
        const buffer = await fbGetBytes(fileRef);
        res.setHeader("Content-Type", docObj.fileType || "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(docObj.fileName || docObj.name)}"`);
        return res.send(Buffer.from(buffer));
      } catch (storageErr: any) {
        console.error("[Storage Download Error] Failed to fetch document from Firebase Storage:", storageErr.message);
      }
    }

    // Fallback: raw base64 content saved inline
    if (docObj.fileUrl && docObj.fileUrl.startsWith("data:")) {
      const parts = docObj.fileUrl.split(",");
      const mime = parts[0].match(/:(.*?);/)?.[1] || docObj.fileType || "application/pdf";
      const buffer = Buffer.from(parts[1], "base64");
      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(docObj.fileName || docObj.name)}"`);
      return res.send(buffer);
    } else if (docObj.fileUrl && !docObj.fileUrl.startsWith("/")) {
      const buffer = Buffer.from(docObj.fileUrl, "base64");
      res.setHeader("Content-Type", docObj.fileType || "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(docObj.fileName || docObj.name)}"`);
      return res.send(buffer);
    }

    res.status(404).send("El contenido del archivo no está disponible.");
  } catch (err: any) {
    console.error("Error downloading document:", err);
    res.status(500).send(`Error al descargar el documento: ${err.message}`);
  }
});

// Approve Document (Manager)
app.post("/api/cases/:id/requirements/:reqId/approve", (req, res) => {
  const { id, reqId } = req.params;
  const { userId } = req.body;

  const accessCheck = checkAndAssignManager(id, userId);
  if (!accessCheck.allowed) {
    return res.status(403).json({ message: accessCheck.message });
  }

  const doc = db.documents.find((d) => d.caseId === id && d.requirementId === reqId);
  if (!doc) {
    return res.status(404).json({ message: "Documento no encontrado para autorizar." });
  }

  doc.status = "APROVADO"; // typo tolerance: "APROBADO" is standard but UI uses APROBADO, we will map both safely
  doc.status = "APROBADO";
  saveDb();

  // Fetch case details to notify advisor
  const caseObj = db.cases.find(c => c.id === id);
  if (caseObj) {
    createNotification(
      caseObj.advisorId,
      "Requisito Documental Aprobado",
      `El documento '${doc.name}' fue aprobado en el expediente ${caseObj.code}.`,
      "SUCCESS",
      id
    );
  }

  logAudit(userId || "usr-manager", "DOCUMENT_APPROVED", "DOCUMENT", doc.id, `Documento aprobado para legajo: ${doc.name}`);
  res.json(doc);
});

// Reject Document (Manager)
app.post("/api/cases/:id/requirements/:reqId/reject", (req, res) => {
  const { id, reqId } = req.params;
  const { reason, userId } = req.body;

  const accessCheck = checkAndAssignManager(id, userId);
  if (!accessCheck.allowed) {
    return res.status(403).json({ message: accessCheck.message });
  }

  const doc = db.documents.find((d) => d.caseId === id && d.requirementId === reqId);
  if (!doc) {
    return res.status(404).json({ message: "Documento no encontrado para rechazar." });
  }

  doc.status = "RECHAZADO";

  // Create an Observation automatically for this document
  const manager = db.users.find(u => u.id === userId) || { name: "Manager" };
  const caseObj = db.cases.find(c => c.id === id);

  const obs = {
    id: `obs-${Date.now()}`,
    caseId: id,
    stageId: caseObj ? caseObj.currentStageId : "",
    entityId: doc.id,
    entityType: "DOCUMENT" as const,
    message: reason || "El documento no cumple con los requisitos mínimos de legibilidad u originalidad.",
    authorId: userId || "usr-manager",
    authorName: manager.name,
    createdAt: new Date().toISOString(),
    status: "ABIERTA" as const,
  };

  db.observations.push(obs);

  // Set Case status as OBSERVADO
  if (caseObj) {
    caseObj.status = "OBSERVADO";
  }

  saveDb();

  // Notify Advisor
  if (caseObj) {
    createNotification(
      caseObj.advisorId,
      "Requisito Documental Rechazado",
      `El documento '${doc.name}' fue RECHAZADO: ${reason}. Se requiere corregir observaciones.`,
      "DANGER",
      id
    );
  }

  logAudit(userId || "usr-manager", "DOCUMENT_REJECTED", "DOCUMENT", doc.id, `Documento rechazado: ${doc.name}. Motivo: ${reason}`);
  res.json({ doc, observation: obs });
});

// Toggle Download Permission (Manager/Admin)
app.post("/api/cases/:id/requirements/:reqId/toggle-download", (req, res) => {
  const { id, reqId } = req.params;
  const { downloadEnabled, userId } = req.body;

  const caseObj = db.cases.find((c) => c.id === id);
  if (!caseObj) {
    return res.status(404).json({ message: "Expediente no encontrado." });
  }

  caseObj.requirementStates = caseObj.requirementStates || {};
  caseObj.requirementStates[reqId] = caseObj.requirementStates[reqId] || {};
  caseObj.requirementStates[reqId].downloadEnabled = !!downloadEnabled;
  saveDb();

  logAudit(userId || "usr-manager", "DOWNLOAD_PERMISSION_TOGGLED", "CASE", id, `Permiso de descarga del requisito ${reqId} cambiado a: ${downloadEnabled}`);
  res.json({ success: true, downloadEnabled: !!downloadEnabled });
});

// Request Upload Permission (Advisor)
app.post("/api/cases/:id/requirements/:reqId/request-upload", (req, res) => {
  const { id, reqId } = req.params;
  const { userId, reason } = req.body;

  const caseObj = db.cases.find((c) => c.id === id);
  if (!caseObj) {
    return res.status(404).json({ message: "Expediente no encontrado." });
  }

  caseObj.requirementStates = caseObj.requirementStates || {};
  caseObj.requirementStates[reqId] = caseObj.requirementStates[reqId] || {};
  caseObj.requirementStates[reqId].uploadRequestStatus = "SOLICITADO";
  caseObj.requirementStates[reqId].uploadRequestReason = reason || "No especificado";
  saveDb();

  // Notify manager
  createNotification(
    caseObj.managerId,
    "Solicitud de Permiso de Subida",
    `El asesor solicita habilitar la subida para el requisito del expediente ${caseObj.code}. Detalle: ${reason || 'No especificado'}`,
    "WARNING",
    id
  );

  logAudit(userId || "usr-advisor", "UPLOAD_PERMISSION_REQUESTED", "CASE", id, `Solicitó permiso de subida para el requisito ${reqId}. Detalle: ${reason || 'No especificado'}`);
  res.json({ success: true, uploadRequestStatus: "SOLICITADO", uploadRequestReason: reason || "No especificado" });
});

// Create adjustment request (Advisor requesting forms/documentation changes)
app.post("/api/cases/:id/adjustment-requests", (req, res) => {
  const { id } = req.params;
  const { type, targetParty, action, quantity, requirementId, details, userId } = req.body;

  const caseObj = db.cases.find((c) => c.id === id);
  if (!caseObj) {
    return res.status(404).json({ message: "Expediente no encontrado." });
  }

  const userObj = db.users.find((u) => u.id === userId);
  const userName = userObj ? userObj.name : "Asesor";

  const newRequest = {
    id: `adj-${Date.now()}`,
    caseId: id,
    type,
    targetParty,
    action,
    quantity: quantity !== undefined ? Number(quantity) : undefined,
    requirementId,
    details,
    status: "PENDIENTE",
    requestedBy: userId || "usr-advisor",
    requestedByName: userName,
    createdAt: new Date().toISOString()
  };

  caseObj.adjustmentRequests = caseObj.adjustmentRequests || [];
  caseObj.adjustmentRequests.push(newRequest);

  saveDb();

  // Notify manager
  createNotification(
    caseObj.managerId,
    "Nueva Solicitud de Ajuste",
    `El asesor ${userName} ha solicitado una modificación en el expediente ${caseObj.code}: ${details}`,
    "INFO",
    id
  );

  logAudit(userId || "usr-advisor", "ADJUSTMENT_REQUEST_CREATED", "CASE", id, `Solicitó ajuste en expediente: ${details}`);
  res.json({ success: true, request: newRequest });
});

// Approve Adjustment Request (Manager/Admin)
app.post("/api/cases/:id/adjustment-requests/:reqId/approve", (req, res) => {
  const { id, reqId } = req.params;
  const { userId } = req.body;

  const caseObj = db.cases.find((c) => c.id === id);
  if (!caseObj) {
    return res.status(404).json({ message: "Expediente no encontrado." });
  }

  const request = (caseObj.adjustmentRequests || []).find((r) => r.id === reqId);
  if (!request) {
    return res.status(404).json({ message: "Solicitud de ajuste no encontrada." });
  }

  const userObj = db.users.find((u) => u.id === userId);
  const userName = userObj ? userObj.name : "Manager";

  request.status = "APROBADO";
  request.processedBy = userId;
  request.processedByName = userName;
  request.processedAt = new Date().toISOString();

  // Perform the actual action
  if (request.type === "FORM_COUNT") {
    caseObj.partyCounts = caseObj.partyCounts || { compradores: 1, vendedores: 1, garantes: 0 };
    const party = request.targetParty;
    const qty = request.quantity || 1;
    if (request.action === "ADD") {
      caseObj.partyCounts[party] = (caseObj.partyCounts[party] || 0) + qty;
    } else if (request.action === "REMOVE") {
      caseObj.partyCounts[party] = Math.max(0, (caseObj.partyCounts[party] || 0) - qty);
    }

    // Sync all tasks of type "FORM" for this case to match the new counts
    db.tasks.filter((t) => t.caseId === id).forEach((task) => {
      if (task.formInstances !== undefined || (task.formValues && !task.formInstances)) {
        syncTaskFormInstances(caseObj, task);
      }
    });
  } else if (request.type === "DOCUMENT_UPLOAD" && request.requirementId) {
    caseObj.requirementStates = caseObj.requirementStates || {};
    caseObj.requirementStates[request.requirementId] = caseObj.requirementStates[request.requirementId] || {};
    caseObj.requirementStates[request.requirementId].uploadRequestStatus = "APROBADO";
    caseObj.requirementStates[request.requirementId].uploadEnabled = true;
    caseObj.requirementStates[request.requirementId].uploadConfig = {
      maxCount: 5,
      fileType: "all",
      maxWeight: 10,
      uploadEnabled: true
    };
  }

  saveDb();

  // Notify Advisor
  createNotification(
    caseObj.advisorId,
    "Solicitud de Ajuste Aprobada",
    `Su solicitud de ajuste para ${request.type === "FORM_COUNT" ? "formularios" : "documentos"} ha sido aprobada.`,
    "SUCCESS",
    id
  );

  logAudit(userId || "usr-manager", "ADJUSTMENT_REQUEST_APPROVED", "CASE", id, `Aprobó solicitud de ajuste: ${request.details}`);
  res.json({ success: true, request, partyCounts: caseObj.partyCounts });
});

// Reject Adjustment Request (Manager/Admin)
app.post("/api/cases/:id/adjustment-requests/:reqId/reject", (req, res) => {
  const { id, reqId } = req.params;
  const { userId, rejectionReason } = req.body;

  const caseObj = db.cases.find((c) => c.id === id);
  if (!caseObj) {
    return res.status(404).json({ message: "Expediente no encontrado." });
  }

  const request = (caseObj.adjustmentRequests || []).find((r) => r.id === reqId);
  if (!request) {
    return res.status(404).json({ message: "Solicitud de ajuste no encontrada." });
  }

  const userObj = db.users.find((u) => u.id === userId);
  const userName = userObj ? userObj.name : "Manager";

  request.status = "RECHAZADO";
  request.processedBy = userId;
  request.processedByName = userName;
  request.processedAt = new Date().toISOString();
  request.rejectionReason = rejectionReason || "Denegado por el manager.";

  // If upload doc request was rejected, update requirementState too
  if (request.type === "DOCUMENT_UPLOAD" && request.requirementId) {
    caseObj.requirementStates = caseObj.requirementStates || {};
    caseObj.requirementStates[request.requirementId] = caseObj.requirementStates[request.requirementId] || {};
    caseObj.requirementStates[request.requirementId].uploadRequestStatus = "RECHAZADO";
    caseObj.requirementStates[request.requirementId].uploadEnabled = false;
  }

  saveDb();

  // Notify Advisor
  createNotification(
    caseObj.advisorId,
    "Solicitud de Ajuste Rechazada",
    `Su solicitud de ajuste ha sido rechazada: ${request.rejectionReason}`,
    "DANGER",
    id
  );

  logAudit(userId || "usr-manager", "ADJUSTMENT_REQUEST_REJECTED", "CASE", id, `Rechazó solicitud de ajuste: ${request.details}. Motivo: ${request.rejectionReason}`);
  res.json({ success: true, request });
});

// Configure & Grant Upload Permission (Manager/Admin)
app.post("/api/cases/:id/requirements/:reqId/configure-upload", (req, res) => {
  const { id, reqId } = req.params;
  const { uploadEnabled, maxCount, fileType, maxWeight, userId } = req.body;

  const caseObj = db.cases.find((c) => c.id === id);
  if (!caseObj) {
    return res.status(404).json({ message: "Expediente no encontrado." });
  }

  caseObj.requirementStates = caseObj.requirementStates || {};
  caseObj.requirementStates[reqId] = caseObj.requirementStates[reqId] || {};
  caseObj.requirementStates[reqId].uploadEnabled = !!uploadEnabled;
  caseObj.requirementStates[reqId].uploadRequestStatus = uploadEnabled ? "APROBADO" : "RECHAZADO";
  caseObj.requirementStates[reqId].uploadConfig = {
    maxCount: Number(maxCount) || 1,
    fileType: fileType || "all", // e.g., "pdf", "image", "word", "all"
    maxWeight: Number(maxWeight) || 5, // MB
  };
  saveDb();

  // Notify advisor
  createNotification(
    caseObj.advisorId,
    uploadEnabled ? "Permiso de Subida Otorgado" : "Permiso de Subida Denegado",
    uploadEnabled 
      ? `Se ha habilitado la subida para un requisito en el expediente ${caseObj.code}. Límites: ${maxCount} archivo(s), Tipo: ${fileType}, Máx: ${maxWeight}MB.`
      : `Se ha denegado la solicitud de subida para un requisito en el expediente ${caseObj.code}.`,
    uploadEnabled ? "SUCCESS" : "DANGER",
    id
  );

  logAudit(userId || "usr-manager", "UPLOAD_PERMISSION_CONFIGURED", "CASE", id, `Configuró permiso de subida para requisito ${reqId}. Habilitado: ${uploadEnabled}`);
  res.json({ 
    success: true, 
    uploadEnabled: !!uploadEnabled, 
    uploadRequestStatus: uploadEnabled ? "APROBADO" : "RECHAZADO",
    uploadConfig: caseObj.requirementStates[reqId].uploadConfig 
  });
});

// Resolve Observation (Advisor responds)
app.post("/api/cases/:id/observations/:obsId/resolve", (req, res) => {
  const { id, obsId } = req.params;
  const { response, userId } = req.body;

  const obs = db.observations.find((o) => o.id === obsId && o.caseId === id);
  if (!obs) {
    return res.status(404).json({ message: "Observación no encontrada." });
  }

  obs.status = "RESUELTA";
  obs.response = response || "Respondido por asesor.";
  obs.respondedAt = new Date().toISOString();

  // Look if there are any remaining ABIERTA observations
  const openObs = db.observations.filter(o => o.caseId === id && o.status === "ABIERTA");
  const caseObj = db.cases.find(c => c.id === id);

  // If no open observations and no rejected docs, reset status
  if (openObs.length === 0 && caseObj) {
    const hasRejectedDocs = db.documents.filter(d => d.caseId === id && d.status === "RECHAZADO").length > 0;
    if (!hasRejectedDocs) {
      caseObj.status = "ACTIVO";
    }
  }

  saveDb();

  // Notify Manager
  if (caseObj) {
    createNotification(
      caseObj.managerId,
      "Observación Respondida",
      `El asesor respondió la observación sobre el expediente ${caseObj.code}.`,
      "SUCCESS",
      id
    );
  }

  logAudit(userId || "usr-asesor1", "OBSERVATION_RESOLVED", "OBSERVATION", obs.id, `Observación marcada como resuelta. Respuesta: ${response}`);
  res.json(obs);
});

// Post Custom Observation (Manager)
app.post("/api/cases/:id/observations", (req, res) => {
  const { id } = req.params;
  const { message, entityType, entityId, userId } = req.body;

  const accessCheck = checkAndAssignManager(id, userId);
  if (!accessCheck.allowed) {
    return res.status(403).json({ message: accessCheck.message });
  }

  const manager = db.users.find(u => u.id === userId) || { name: "Manager" };
  const caseObj = db.cases.find(c => c.id === id);

  const obs = {
    id: `obs-${Date.now()}`,
    caseId: id,
    stageId: caseObj ? caseObj.currentStageId : "",
    entityId: entityId || "general",
    entityType: (entityType || "GENERAL") as any,
    message,
    authorId: userId || "usr-manager",
    authorName: manager.name,
    createdAt: new Date().toISOString(),
    status: "ABIERTA" as const,
  };

  db.observations.push(obs);

  if (caseObj) {
    caseObj.status = "OBSERVADO";
  }

  saveDb();

  // Notify Advisor
  if (caseObj) {
    createNotification(
      caseObj.advisorId,
      "Nueva Observación Registrada",
      `Nueva indicación de Martina Sola: ${message}`,
      "WARNING",
      id
    );
  }

  logAudit(userId || "usr-manager", "OBSERVATION_CREATED", "OBSERVATION", obs.id, `Observación agregada manualmente: ${message}`);
  res.json(obs);
});

// Stage Control: Advanced Transition Validation
app.post("/api/cases/:id/stage/advance", (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  const accessCheck = checkAndAssignManager(id, userId);
  if (!accessCheck.allowed) {
    return res.status(403).json({ message: accessCheck.message });
  }

  const caseObj = db.cases.find((c) => c.id === id);
  if (!caseObj) {
    return res.status(404).json({ message: "Expediente no encontrado" });
  }

  // Get hydrated elements to run complete structural checks
  const hydrated = getHydratedCase(id);
  if (!hydrated || !hydrated.currentStage) {
    return res.status(500).json({ message: "No se pudo hidratar la información del expediente." });
  }

  const { currentStage, requirements, observations } = hydrated;
  const stagesOrdered = hydrated.stages.sort((a: any, b: any) => a.order - b.order);
  const currentIdx = stagesOrdered.findIndex((s: any) => s.id === currentStage.id);

  if (currentIdx === stagesOrdered.length - 1) {
    // Already in last stage. Fulfill/finalise case!
    caseObj.status = "FINALIZADO";
    caseObj.updatedAt = new Date().toISOString();
    saveDb();
    logAudit(userId || "usr-asesor1", "CASE_FINISHED", "CASE", id, `Expediente finalizado con éxito: ${caseObj.code}`);
    return res.json({ success: true, finished: true, currentStageId: caseObj.currentStageId });
  }

  // CRITICAL CONSTRAINT VALIDATIONS: Control de Avance
  // 1. Existan documentos faltantes obligatorios
  const missingDocs = requirements.filter((r: any) => r.required && r.type === "DOCUMENT" && !r.document);
  // 2. Existan documentos rechazados
  const rejectedDocs = requirements.filter((r: any) => r.document && r.document.status === "RECHAZADO");
  // 3. Documentos pendientes de revisión (unapproved uploaded docs in this stage)
  const reviewingDocs = requirements.filter((r: any) => r.document && r.document.status === "EN_REVISION");
  // 4. Existan tareas pendientes (TASK or FORM incomplete and required)
  const pendingTasks = requirements.filter((r: any) => r.required && (r.type === "TASK" || r.type === "FORM") && (!r.task || r.task.status !== "COMPLETA"));
  // 5. Existan observaciones abiertas
  const openObs = observations.filter((o: any) => o.status === "ABIERTA");

  if (missingDocs.length > 0 || rejectedDocs.length > 0 || pendingTasks.length > 0 || openObs.length > 0) {
    return res.status(400).json({
      error: true,
      code: "BLOCK_ADVANCE_REQUIREMENTS_PENDING",
      message: "No es posible avanzar el expediente. Existen requisitos pendientes en la etapa actual.",
      details: {
        missingDocs: missingDocs.map((doc: any) => doc.name),
        rejectedDocs: rejectedDocs.map((doc: any) => doc.name),
        reviewingDocs: reviewingDocs.map((doc: any) => doc.name),
        pendingTasks: pendingTasks.map((t: any) => t.name),
        openObservations: openObs.map((o: any) => o.message),
      },
    });
  }

  // If there are documents needing review (Manager must review and approve them first!)
  if (reviewingDocs.length > 0) {
    return res.status(400).json({
      error: true,
      code: "BLOCK_ADVANCE_REVISION_PENDING",
      message: "No es posible avanzar el expediente. Hay documentos cargados pendientes de revisión y aprobación por el Manager.",
      details: {
        reviewingDocs: reviewingDocs.map((doc: any) => doc.name),
      },
    });
  }

  // PASS checks: Advance to next stage!
  const nextStage = stagesOrdered[currentIdx + 1];
  caseObj.currentStageId = nextStage.id;
  caseObj.status = "ACTIVO"; // clear observed/pending on change stage
  caseObj.updatedAt = new Date().toISOString();

  // Clear obsolete tasks of previous state from active view and pre-provision tasks for new stage
  nextStage.requirements.forEach((req: any) => {
    if (req.type === "TASK" && !db.tasks.find(t => t.caseId === id && t.requirementId === req.id)) {
      db.tasks.push({
        id: `tsk-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        caseId: id,
        requirementId: req.id,
        name: req.name,
        description: req.description,
        status: "PENDIENTE",
      });
    } else if (req.type === "FORM" && !db.tasks.find(t => t.caseId === id && t.requirementId === req.id)) {
      const formTask = {
        id: `tsk-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        caseId: id,
        requirementId: req.id,
        name: req.name,
        status: "PENDIENTE",
        formInstances: [],
        formValues: {},
      };
      syncTaskFormInstances(caseObj, formTask);
      db.tasks.push(formTask);
    }
  });

  saveDb();

  // Notify Advisor & Manager
  createNotification(
    caseObj.advisorId,
    "Expediente Avanzado de Etapa",
    `El expediente ${caseObj.code} avanzó a la etapa: '${nextStage.name}'`,
    "SUCCESS",
    id
  );

  logAudit(userId || "usr-asesor1", "STAGE_CHANGED", "CASE", id, `Avanzó etapa de '${currentStage.name}' a '${nextStage.name}'`);
  res.json({ success: true, case: caseObj, nextStage });
});

// Stage Control: Retrocede Transition
app.post("/api/cases/:id/stage/retrocede", (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  const accessCheck = checkAndAssignManager(id, userId);
  if (!accessCheck.allowed) {
    return res.status(403).json({ message: accessCheck.message });
  }

  const caseObj = db.cases.find((c) => c.id === id);
  if (!caseObj) {
    return res.status(404).json({ message: "Expediente no encontrado" });
  }

  const hydrated = getHydratedCase(id);
  if (!hydrated || !hydrated.currentStage) {
    return res.status(500).json({ message: "Error al cargar legajo." });
  }

  const stagesOrdered = hydrated.stages.sort((a: any, b: any) => a.order - b.order);
  const currentIdx = stagesOrdered.findIndex((s: any) => s.id === hydrated.currentStage.id);

  if (currentIdx === 0) {
    return res.status(400).json({ message: "Se encuentra en la primera etapa." });
  }

  const prevStage = stagesOrdered[currentIdx - 1];
  caseObj.currentStageId = prevStage.id;
  caseObj.status = "ACTIVO";
  caseObj.updatedAt = new Date().toISOString();
  saveDb();

  createNotification(
    caseObj.advisorId,
    "Expediente Regresó de Etapa",
    `El expediente ${caseObj.code} retrocedió a la etapa: '${prevStage.name}'`,
    "WARNING",
    id
  );

  logAudit(userId || "usr-manager", "STAGE_RETROCEDED", "CASE", id, `Retrocedió etapa de '${hydrated.currentStage.name}' a '${prevStage.name}'`);
  res.json({ success: true, case: caseObj, prevStage });
});

// Dashboard metrics endpoint
app.get("/api/dashboard/stats", (req, res) => {
  const active = db.cases.filter((c) => c.status === "ACTIVO").length;
  const pending = db.cases.filter((c) => c.status === "PENDIENTE").length;
  const observed = db.cases.filter((c) => c.status === "OBSERVADO").length;
  const finished = db.cases.filter((c) => c.status === "FINALIZADO").length;
  const total = db.cases.length;

  // Amount of cases per advisor
  const casesByAdvisor = db.users
    .filter((u) => u.role === "ASESOR")
    .map((u) => {
      const count = db.cases.filter((c) => c.advisorId === u.id).length;
      const completed = db.cases.filter((c) => c.advisorId === u.id && c.status === "FINALIZADO").length;
      const observed = db.cases.filter((c) => c.advisorId === u.id && c.status === "OBSERVADO").length;
      return {
        id: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl,
        totalCount: count,
        completedCount: completed,
        observedCount: observed,
        activeCount: count - completed,
      };
    });

  // Recent observations summary
  const recentObs = db.observations.slice(0, 5);

  // Stage breakdown details
  const stageDistribution = db.templates.map((tpl: any) => {
    const casesOfTpl = db.cases.filter((c) => c.templateId === tpl.id);
    const dist = tpl.stages.map((stg: any) => {
      const count = casesOfTpl.filter((c) => c.currentStageId === stg.id).length;
      return {
        stageName: stg.name,
        count,
      };
    });
    return {
      templateName: tpl.name,
      distribution: dist,
    };
  });

  res.json({
    active,
    pending,
    observed,
    finished,
    total,
    casesByAdvisor,
    recentObservations: recentObs,
    stageDistribution,
  });
});

// Pending Approvals calculation endpoint for Manager/Admin
app.get("/api/dashboard/pending-approvals", (req, res) => {
  const userId = getUserIdFromRequest(req);
  const user = db.users.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ message: "Usuario no encontrado" });
  }

  const isManager = user.role === "MANAGER";
  const isAdmin = user.role === "ADMIN";

  // 1. Pending document approvals (document.status === "EN_REVISION")
  let pendingDocs = db.documents.filter(d => d.status === "EN_REVISION");
  if (isManager) {
    pendingDocs = pendingDocs.filter(d => {
      const c = db.cases.find(caseObj => caseObj.id === d.caseId);
      return c && (c.managerId === userId || c.managerId === "unassigned" || !c.managerId);
    });
  }

  // 2. Pending adjustment requests (adjustmentRequest.status === "PENDIENTE")
  let pendingAdjustmentsCount = 0;
  db.cases.forEach(c => {
    if (isManager && c.managerId !== userId && c.managerId !== "unassigned" && c.managerId) {
      return; // skip if assigned to another manager
    }
    if (c.adjustmentRequests) {
      pendingAdjustmentsCount += c.adjustmentRequests.filter(r => r.status === "PENDIENTE").length;
    }
  });

  // 3. Pending Case Requests (caseRequest.status === "PENDIENTE")
  // For managers: any pending case request. For admin: all.
  const pendingCaseRequestsCount = db.caseRequests.filter(r => r.status === "PENDIENTE").length;

  // 4. Pending Advisor Registrations (user.status === "VERIFIED_PENDING_APPROVAL" or "PENDING")
  const pendingUserRegistrationsCount = db.users.filter(u => u.status === "VERIFIED_PENDING_APPROVAL" || u.status === "PENDING").length;

  const totalPendingCount = pendingDocs.length + pendingAdjustmentsCount + pendingCaseRequestsCount + pendingUserRegistrationsCount;

  res.json({
    count: totalPendingCount,
    hasPending: totalPendingCount > 0,
    details: {
      documents: pendingDocs.length,
      adjustments: pendingAdjustmentsCount,
      caseRequests: pendingCaseRequestsCount,
      userRegistrations: pendingUserRegistrationsCount
    }
  });
});

// Audit Logs list
app.get("/api/audit-logs", (req, res) => {
  res.json(db.auditLogs);
});

// Notification Endpoints
app.get("/api/notifications", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester) {
    return res.status(401).json({ message: "Sesión inválida" });
  }

  if (requester.role === "ADMIN") {
    // Admin sees everything
    return res.json(db.notifications || []);
  }

  if (requester.role === "MANAGER") {
    // Manager sees their own notifications + advisor notifications, but not other managers
    const filtered = (db.notifications || []).filter((n) => {
      if (n.userId === requester.id) {
        return true;
      }
      const targetUser = db.users.find((u) => u.id === n.userId);
      return targetUser && targetUser.role === "ASESOR";
    });
    return res.json(filtered);
  }

  // ASESOR sees only their own
  const filtered = (db.notifications || []).filter((n) => n.userId === requester.id);
  return res.json(filtered);
});

app.post("/api/notifications/:id/read", (req, res) => {
  const { id } = req.params;
  const not = db.notifications.find((n) => n.id === id);
  if (not) {
    not.read = true;
    saveDb();
    res.json(not);
  } else {
    res.status(404).json({ message: "Notificación no encontrada" });
  }
});

app.post("/api/notifications/read-all", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester) {
    return res.status(401).json({ message: "Sesión inválida" });
  }

  let visibleNotifications = db.notifications || [];
  if (requester.role === "MANAGER") {
    visibleNotifications = (db.notifications || []).filter((n) => {
      if (n.userId === requester.id) {
        return true;
      }
      const targetUser = db.users.find((u) => u.id === n.userId);
      return targetUser && targetUser.role === "ASESOR";
    });
  } else if (requester.role !== "ADMIN") {
    visibleNotifications = (db.notifications || []).filter((n) => n.userId === requester.id);
  }

  visibleNotifications.forEach((n) => {
    n.read = true;
  });

  saveDb();
  res.json({ success: true });
});

// --------------------------------------------------------
// CUSTOM DYNAMIC TABS & AI GENERATION ENDPOINTS
// --------------------------------------------------------

app.get("/api/custom-tabs", (req, res) => {
  res.json(db.customTabs || []);
});

app.post("/api/custom-tabs", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester || (requester.role !== "ADMIN" && requester.role !== "MANAGER")) {
    return res.status(403).json({ message: "Privilegios insuficientes." });
  }

  const { name, icon } = req.body;
  if (!name || name.trim() === "") {
    return res.status(400).json({ message: "El nombre de la solapa es obligatorio." });
  }

  const newTab = {
    id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    name: name.trim(),
    icon: icon || "Layout",
    createdAt: new Date().toISOString(),
    items: []
  };

  if (!db.customTabs) db.customTabs = [];
  db.customTabs.push(newTab);
  saveDb();

  logAudit(requester.id, "CUSTOM_TAB_CREATED", "CUSTOM_TAB", newTab.id, `Solapa personalizada creada por ${requester.name}: ${name}`);
  res.json(newTab);
});

app.delete("/api/custom-tabs/:id", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester || (requester.role !== "ADMIN" && requester.role !== "MANAGER")) {
    return res.status(403).json({ message: "Privilegios insuficientes." });
  }

  const { id } = req.params;
  if (!db.customTabs) db.customTabs = [];
  
  const initialLen = db.customTabs.length;
  db.customTabs = db.customTabs.filter(t => t.id !== id);
  
  if (db.customTabs.length < initialLen) {
    saveDb();
    logAudit(requester.id, "CUSTOM_TAB_DELETED", "CUSTOM_TAB", id, `Solapa personalizada eliminada por ${requester.name}`);
    res.json({ success: true, message: "Solapa eliminada con éxito." });
  } else {
    res.status(404).json({ message: "Solapa no encontrada." });
  }
});

app.post("/api/custom-tabs/:id/items", async (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester || (requester.role !== "ADMIN" && requester.role !== "MANAGER")) {
    return res.status(403).json({ message: "Privilegios insuficientes." });
  }

  const { id } = req.params;
  if (!db.customTabs) db.customTabs = [];
  const tab = db.customTabs.find(t => t.id === id);
  if (!tab) {
    return res.status(404).json({ message: "Solapa no encontrada." });
  }

  const { title, content, useAi, aiPrompt } = req.body;

  let finalTitle = title;
  let finalContent = content;

  if (useAi) {
    const promptText = aiPrompt || title || "Estructura del proceso";
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      console.warn("GEMINI_API_KEY no configurado para generación de solapa. Usando fallback de IA.");
      finalTitle = `AI: ${promptText}`;
      finalContent = `### ${promptText}\n\nEste es un contenido de alta calidad pregenerado por el asistente inteligente para el área: **${promptText}**.\n\n#### Directivas Sugeridas:\n1. **Estructuración:** Asegurar la correcta catalogación del expediente.\n2. **Validación:** Comprobación rigurosa de antecedentes de contacto.\n3. **Auditoría:** Guardar registros automáticos del historial de operaciones.\n\n*Nota: Conecte su clave de API de Gemini en la sección Ajustes de su espacio de AI Studio para activar las consultas reales.*`;
    } else {
      try {
        const ai = new GoogleGenAI({
          apiKey: apiKey,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        });

        const systemInstr = "Eres un consultor experto en administración de empresas, optimización de legajos y estructuración de procesos legales y corporativos. Responde siempre con un JSON estructurado.";

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: `Genera una sección de contenido profesional y completo sobre el siguiente tema: "${promptText}". El contenido debe estar formateado en Markdown sofisticado. Responde utilizando un objeto JSON que contenga las propiedades "title" (un título corto sofisticado) y "content" (el cuerpo del texto en Markdown detallado y rico).`,
          config: {
            systemInstruction: systemInstr,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: "Un título corto y refinado." },
                content: { type: Type.STRING, description: "Cuerpo detallado en formato Markdown sofisticado." }
              },
              required: ["title", "content"]
            }
          }
        });

        const parsedResult = JSON.parse(response.text || "{}");
        if (parsedResult.title) finalTitle = parsedResult.title;
        if (parsedResult.content) finalContent = parsedResult.content;
      } catch (aiErr: any) {
        console.error("Gemini Generation Error:", aiErr);
        // Fallback in case of call/parsing failure
        finalTitle = title || `AI: ${promptText}`;
        finalContent = content || `Fallo en la generación inteligente: ${aiErr.message || aiErr}. Se creó una sección básica.`;
      }
    }
  }

  if (!finalTitle || finalTitle.trim() === "") {
    return res.status(400).json({ message: "El título de la sección es obligatorio." });
  }

  const newItem = {
    id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    title: finalTitle.trim(),
    content: finalContent || "",
    createdAt: new Date().toISOString()
  };

  if (!tab.items) tab.items = [];
  tab.items.push(newItem);
  saveDb();

  logAudit(requester.id, "CUSTOM_TAB_ITEM_CREATED", "CUSTOM_TAB", id, `Sección "${newItem.title}" agregada en la solapa "${tab.name}"`);
  res.json({ success: true, tab, item: newItem });
});

app.delete("/api/custom-tabs/:tabId/items/:itemId", (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ message: "No autenticado" });
  }
  const token = authorization.replace("Bearer ", "");
  const userId = token.replace("real-jwt-token-for-", "");
  const requester = db.users.find((u) => u.id === userId);

  if (!requester || (requester.role !== "ADMIN" && requester.role !== "MANAGER")) {
    return res.status(403).json({ message: "Privilegios insuficientes." });
  }

  const { tabId, itemId } = req.params;
  if (!db.customTabs) db.customTabs = [];
  const tab = db.customTabs.find(t => t.id === tabId);
  if (!tab) {
    return res.status(404).json({ message: "Solapa no encontrada." });
  }

  if (!tab.items) tab.items = [];
  const initialLen = tab.items.length;
  tab.items = tab.items.filter(item => item.id !== itemId);

  if (tab.items.length < initialLen) {
    saveDb();
    logAudit(requester.id, "CUSTOM_TAB_ITEM_DELETED", "CUSTOM_TAB", tabId, `Sección eliminada de la solapa "${tab.name}"`);
    res.json({ success: true, tab });
  } else {
    res.status(404).json({ message: "Sección no encontrada en la solapa." });
  }
});

// --------------------------------------------------------
// VITE DEV / PRODUCTION INGRESS HANDLERS
// --------------------------------------------------------

async function startServer() {
  // 1. Load from local cache immediately (synchronous and instant)
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf-8");
      db = JSON.parse(data);
      console.log("[Init] Loaded database from local disk cache immediately.");
    }
  } catch (err) {
    console.error("[Init Error] Failed to load database from local disk cache:", err);
  }

  // Populate basic defaults if needed, so the server always has valid structures immediately
  if (!db.users || db.users.length === 0) {
    db.users = [
      { 
        id: "usr-admin", 
        email: "admin@test.com", 
        password: "admin123", 
        name: "Director General", 
        role: "ADMIN", 
        avatarUrl: getRealisticAvatar("Director General"), 
        status: "APPROVED", 
        phone: "+541122223333" 
      },
      { 
        id: "usr-manager", 
        email: "manager@test.com", 
        password: "password123", 
        name: "Gerente Martina", 
        role: "MANAGER", 
        avatarUrl: getRealisticAvatar("Gerente Martina"), 
        status: "APPROVED", 
        phone: "+541122223333" 
      },
      { 
        id: "usr-asesor1", 
        email: "asesor@test.com", 
        password: "password123", 
        name: "Asesor Gabriel", 
        role: "ASESOR", 
        avatarUrl: getRealisticAvatar("Asesor Gabriel"), 
        status: "APPROVED", 
        phone: "+541122223333" 
      }
    ];
  }

  if (!db.settings) {
    db.settings = {
      verificationChannel: "EMAIL",
      messageTemplate: "Hola {{name}}, tu token de verificación es: {{token}}",
      resendApiKey: process.env.RESEND_API_KEY || "",
      resendFromEmail: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
      twilioSid: process.env.TWILIO_ACCOUNT_SID || "",
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
      twilioFromNumber: process.env.TWILIO_FROM_NUMBER || "",
      commercialFocus: "general"
    };
  }

  if (!db.customTabs) {
    db.customTabs = [];
  }

  if (!db.caseRequests) {
    db.caseRequests = [];
  }

  // Migrate existing users from Dicebear to Unsplash photorealistic avatars
  if (db.users && db.users.length > 0) {
    let migrated = false;
    db.users.forEach((u: any) => {
      if (u.avatarUrl && (u.avatarUrl.includes("dicebear.com") || u.avatarUrl.includes("adventurer"))) {
        u.avatarUrl = getRealisticAvatar(u.name);
        migrated = true;
      }
    });
    if (migrated) {
      console.log("[Migration] Successfully migrated user avatars to realistic portraits.");
      saveDb();
    }
  }

  // 2. Start the Express server listening immediately so it is responsive
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    // Serve index.html globally for fallbacks
    app.get("*", (req, res, next) => {
      const htmlPath = path.resolve(process.cwd(), "index.html");
      fs.readFile(htmlPath, "utf-8", (err, html) => {
        if (err) return next(err);
        vite.transformIndexHtml(req.url, html).then((transformedHtml) => {
          res.status(200).set({ "Content-Type": "text/html" }).end(transformedHtml);
        });
      });
    });

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[Vite Dev] Express full-stack listening on http://0.0.0.0:${PORT}`);
    });
  } else {
    // Production static server
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[Production Server] Running on port ${PORT}`);
    });
  }

  // 3. Trigger cloud restore asynchronously in the background so it never blocks the server startup or makes it unresponsive
  initDb().catch((err) => {
    console.error("[Init Cloud Error] Failed during async cloud DB restoration:", err);
  });
}

startServer();
