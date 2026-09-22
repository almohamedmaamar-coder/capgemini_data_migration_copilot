"use client";

import { create } from "zustand";
import * as XLSX from "xlsx";
import type { WorkBook } from "xlsx";
import type { ChatMessage, IssueType, QualityReport } from "@/types/quality";
import { analyzeWorkbook as analyzeLocal } from "@/lib/data-quality-engine";
import { DEMO_FILE_NAME, buildDemoWorkbook } from "@/lib/demo-fixture";
import { SheetModel, SheetLink, detectWorkbook, buildSheetModelFromGrid, detectSheetLinks } from "@/lib/workbook-detect";
import { analyzeViaServer, chatViaServer } from "@/lib/api-client";

export type Filter = IssueType | "all";

export interface PendingDetection {
  file: File;
  fileName: string;
  wb: WorkBook;
  sheets: SheetModel[];
  links: SheetLink[];
  rawGrids: Record<string, string[][]>;
}

export type UserAuditDecision = "verified" | "tolerated" | "flagged";

interface State {
  report: QualityReport | null;
  loading: boolean;
  filter: Filter;
  query: string;
  activeSheet: string | null;
  selectedRowId: string | null;
  sidebarOpen: boolean;
  sessionId: string | null;
  backendMode: "server" | "local";
  messages: ChatMessage[];
  pendingDetection: PendingDetection | null;
  focusOnlyIssues: boolean;
  selectedColumnFilter: string | null;
  activeClusterId: string | null;
  userAuditStatus: Record<string, UserAuditDecision>;
  setReport: (r: QualityReport | null) => void;
  setLoading: (b: boolean) => void;
  setFilter: (f: Filter) => void;
  setQuery: (q: string) => void;
  setActiveSheet: (s: string | null) => void;
  setSelectedRowId: (id: string | null) => void;
  setSidebarOpen: (b: boolean) => void;
  pushMessage: (m: ChatMessage) => void;
  analyzeFile: (file: File) => void;
  loadSample: () => void;
  sendChat: (text: string) => void;
  setPendingDetection: (p: PendingDetection | null) => void;
  updateSheetHeaderRow: (sheetName: string, rowIndex: number) => void;
  updateSheetKey: (sheetName: string, keyColIndex: number | null) => void;
  toggleMandatoryColumn: (sheetName: string, colIndex: number) => void;
  confirmDetection: () => void;
  cancelDetection: () => void;
  toggleFocusOnlyIssues: () => void;
  setSelectedColumnFilter: (col: string | null) => void;
  setActiveClusterId: (clusterId: string | null) => void;
  setUserAuditStatus: (rowId: string, status: UserAuditDecision | null) => void;
  jumpToNextIssue: () => void;
  jumpToPrevIssue: () => void;
}

let msgId = 0;
const mid = () => `m${Date.now()}_${msgId++}`;

function summarize(report: QualityReport): string {
  const s = report.summary;
  const detected = report.sheets
    .map(
      (sh) =>
        `« ${sh.name} » (clé : ${sh.keyColumn ?? "non détectée"}${sh.mandatoryColumns.length > 0 ? `, ${sh.mandatoryColumns.length} champ(s) obligatoire(s)` : ""})`
    )
    .join(" · ");
  const skipped = report.sheets.reduce((n, sh) => n + (sh.skipped ?? 0), 0);
  const links =
    report.links.length > 0
      ? ` Lien détecté : ${report.links.map((l) => `« ${l.childSheet} » → « ${l.parentSheet} » via « ${l.keyColumn} »`).join(" · ")}.`
      : " Aucun lien entre feuilles détecté — contrôles R2 ignorés.";
  const skippedNote =
    skipped > 0 ? ` ${skipped} ligne(s) technique(s) ignorée(s) (formats, documentation).` : "";
  return (
    `« ${report.fileName} » analysé : ${s.total} lignes, ${s.valid} valides — ` +
    `${s.mandatoryMissing} lignes R1 (obligatoires), ${s.inconsistent} lignes R2 (cohérence), ${s.duplicates} lignes R3 (doublons).` +
    ` Détecté : ${detected}.${links}${skippedNote}`
  );
}

function applyReport(
  set: (p: Partial<State>) => void,
  pushMessage: (m: ChatMessage) => void,
  report: QualityReport,
  sessionId: string | null,
  backendMode: "server" | "local"
) {
  const live = report.sheets.filter((s) => !s.ignored);
  const preferred =
    live.find((s) => /master|general|basic|prctr|profit/i.test(s.name)) ?? live[0];
  const blockingCount = report.issues.filter((i) => i.severity === "blocking").length;
  const initialGreeting =
    blockingCount > 0
      ? `Audit terminé pour « ${report.fileName} ». ${blockingCount} anomalie(s) bloquante(s) compromettent la simulation SAP Cockpit.\n\nSélectionnez une ligne dans la grille pour un diagnostic de cause racine, ou posez-moi vos questions ci-dessous.`
      : `Audit terminé pour « ${report.fileName} » : toutes les lignes sont conformes pour le Cockpit SAP.\n\nPosez-moi vos questions si vous souhaitez vérifier des règles spécifiques.`;

  set({
    report,
    loading: false,
    filter: "all",
    query: "",
    activeSheet: preferred?.name ?? null,
    selectedRowId: null,
    sessionId,
    backendMode,
    focusOnlyIssues: false,
    selectedColumnFilter: null,
    activeClusterId: null,
    userAuditStatus: {},
    messages: [
      {
        id: mid(),
        role: "agent",
        text: initialGreeting,
      },
    ],
  });
}

function analyzeLocally(wb: WorkBook, fileName: string): QualityReport | null {
  try {
    const { sheets, links } = detectWorkbook(wb);
    if (!sheets.some((s) => !s.ignored)) return null;
    return analyzeLocal(sheets, links, fileName);
  } catch {
    return null;
  }
}

export const useStore = create<State>((set, get) => ({
  report: null,
  loading: false,
  filter: "all",
  query: "",
  activeSheet: null,
  selectedRowId: null,
  sidebarOpen: true,
  sessionId: null,
  backendMode: "local",
  pendingDetection: null,
  focusOnlyIssues: false,
  selectedColumnFilter: null,
  activeClusterId: null,
  userAuditStatus: {},
  messages: [],
  setReport: (report) => set({ report }),
  setLoading: (loading) => set({ loading }),
  setFilter: (filter) => set({ filter }),
  setQuery: (query) => set({ query }),
  setActiveSheet: (activeSheet) => set({ activeSheet, selectedColumnFilter: null, activeClusterId: null }),
  setSelectedRowId: (selectedRowId) => set({ selectedRowId }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  pushMessage: (m) => set({ messages: [...get().messages, m] }),
  setPendingDetection: (pendingDetection) => set({ pendingDetection }),
  toggleFocusOnlyIssues: () => set({ focusOnlyIssues: !get().focusOnlyIssues }),
  setSelectedColumnFilter: (selectedColumnFilter) => set({ selectedColumnFilter }),
  setActiveClusterId: (activeClusterId) => set({ activeClusterId }),
  setUserAuditStatus: (rowId, status) => {
    const current = get().userAuditStatus;
    if (!status) {
      const copy = { ...current };
      delete copy[rowId];
      set({ userAuditStatus: copy });
    } else {
      set({ userAuditStatus: { ...current, [rowId]: status } });
    }
  },
  jumpToNextIssue: () => {
    const { report, activeSheet, selectedRowId } = get();
    if (!report) return;
    const issueRowIds = Array.from(
      new Set(
        report.issues
          .filter((i) => !activeSheet || i.sheet === activeSheet)
          .map((i) => i.rowId)
      )
    );
    if (issueRowIds.length === 0) return;
    const curIdx = selectedRowId ? issueRowIds.indexOf(selectedRowId) : -1;
    const nextIdx = (curIdx + 1) % issueRowIds.length;
    set({ selectedRowId: issueRowIds[nextIdx] });
  },
  jumpToPrevIssue: () => {
    const { report, activeSheet, selectedRowId } = get();
    if (!report) return;
    const issueRowIds = Array.from(
      new Set(
        report.issues
          .filter((i) => !activeSheet || i.sheet === activeSheet)
          .map((i) => i.rowId)
      )
    );
    if (issueRowIds.length === 0) return;
    const curIdx = selectedRowId ? issueRowIds.indexOf(selectedRowId) : -1;
    const prevIdx = (curIdx - 1 + issueRowIds.length) % issueRowIds.length;
    set({ selectedRowId: issueRowIds[prevIdx] });
  },
  updateSheetHeaderRow: (sheetName, rowIndex) => {
    const { pendingDetection } = get();
    if (!pendingDetection) return;
    const grid = pendingDetection.rawGrids[sheetName];
    if (!grid || rowIndex < 0 || rowIndex >= grid.length) return;
    const newModel = buildSheetModelFromGrid(sheetName, grid, rowIndex);
    const updatedSheets = pendingDetection.sheets.map((s) =>
      s.name === sheetName ? newModel : s
    );
    const links = detectSheetLinks(updatedSheets);
    set({
      pendingDetection: {
        ...pendingDetection,
        sheets: updatedSheets,
        links,
      },
    });
  },
  updateSheetKey: (sheetName, keyColIndex) => {
    const { pendingDetection } = get();
    if (!pendingDetection) return;
    const updatedSheets = pendingDetection.sheets.map((s) => {
      if (s.name !== sheetName) return s;
      return {
        ...s,
        keyColumnIndex: keyColIndex,
        keyConfidence: keyColIndex !== null ? 1.0 : 0,
      };
    });
    const links = detectSheetLinks(updatedSheets);
    set({
      pendingDetection: {
        ...pendingDetection,
        sheets: updatedSheets,
        links,
      },
    });
  },
  toggleMandatoryColumn: (sheetName, colIndex) => {
    const { pendingDetection } = get();
    if (!pendingDetection) return;
    const updatedSheets = pendingDetection.sheets.map((s) => {
      if (s.name !== sheetName) return s;
      const exists = s.mandatoryIndexes.includes(colIndex);
      const mandatoryIndexes = exists
        ? s.mandatoryIndexes.filter((idx) => idx !== colIndex)
        : [...s.mandatoryIndexes, colIndex].sort((a, b) => a - b);
      return {
        ...s,
        mandatoryIndexes,
      };
    });
    set({
      pendingDetection: {
        ...pendingDetection,
        sheets: updatedSheets,
      },
    });
  },
  confirmDetection: () => {
    const { pendingDetection, pushMessage } = get();
    if (!pendingDetection) return;
    set({ loading: true });

    // Exécute l'agent autonome LangGraph sur le serveur backend
    analyzeViaServer(pendingDetection.file)
      .then((serverRes) => {
        if (serverRes && serverRes.report) {
          applyReport(set, pushMessage, serverRes.report, serverRes.session_id, "server");
          set({ pendingDetection: null });
        } else {
          // Repli sur le moteur local si le serveur est indisponible
          const report = analyzeLocal(
            pendingDetection.sheets,
            pendingDetection.links,
            pendingDetection.fileName
          );
          applyReport(set, pushMessage, report, null, "local");
          set({ pendingDetection: null });
        }
      })
      .catch(() => {
        const report = analyzeLocal(
          pendingDetection.sheets,
          pendingDetection.links,
          pendingDetection.fileName
        );
        applyReport(set, pushMessage, report, null, "local");
        set({ pendingDetection: null });
      });
  },
  cancelDetection: () => {
    const { pushMessage } = get();
    set({ pendingDetection: null, loading: false });
    pushMessage({
      id: mid(),
      role: "agent",
      text: "Importation annulée. Vous pouvez déposer un autre classeur.",
    });
  },
  analyzeFile: (file) => {
    const { pushMessage } = get();
    set({ loading: true });
    file
      .arrayBuffer()
      .then((buf) => {
        const wb = XLSX.read(buf, { type: "array" });
        const { sheets, links, rawGrids } = detectWorkbook(wb);
        if (!sheets.some((s) => !s.ignored)) {
          set({ loading: false });
          pushMessage({
            id: mid(),
            role: "agent",
            text: "Je n'ai trouvé aucun tableau exploitable dans ce classeur — vérifiez qu'il contient des données et des colonnes.",
          });
          return;
        }
        set({
          pendingDetection: {
            file,
            fileName: file.name,
            wb,
            sheets,
            links,
            rawGrids,
          },
          loading: false,
        });
        pushMessage({
          id: mid(),
          role: "agent",
          text: `Structure détectée pour « ${file.name} ». Vérifiez ci-dessous les colonnes, la clé d'identification et la ligne d'en-tête, puis confirmez pour lancer l'audit qualité.`,
        });
      })
      .catch(() => {
        set({ loading: false });
        pushMessage({
          id: mid(),
          role: "agent",
          text: "Impossible de lire ce fichier — déposez un fichier .xlsx valide.",
        });
      });
  },
  loadSample: () => {
    const wb = buildDemoWorkbook();
    // Même chemin que le serveur : le classeur démo transite en binaire.
    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const file = new File([bytes], DEMO_FILE_NAME, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    get().analyzeFile(file);
  },
  sendChat: (text) => {
    const clean = text.trim();
    if (!clean) return;
    const { pushMessage, setFilter, sessionId } = get();
    pushMessage({ id: mid(), role: "user", text: clean });
    const fallback = () => {
      const reply = agentReply(clean);
      pushMessage(reply);
      if (reply.actionFilter) setFilter(reply.actionFilter);
    };
    if (!sessionId) {
      setTimeout(fallback, 350);
      return;
    }
    chatViaServer(sessionId, clean).then((res) => {
      if (!res) {
        setTimeout(fallback, 350);
        return;
      }
      pushMessage({
        id: mid(),
        role: "agent",
        text: res.reply,
        actionLabel: res.actionLabel,
        actionFilter: res.actionFilter,
      });
      if (res.actionFilter) setFilter(res.actionFilter);
    });
  },
}));

export function agentReply(userText: string): ChatMessage {
  const t = userText.toLowerCase();
  const has = (...ws: string[]) => ws.some((w) => t.includes(w));
  if (has("doublon", "duplic", "duplicate")) {
    return {
      id: mid(),
      role: "agent",
      text: "R3 — je regroupe par clé détectée (ex. Profit Center) et je signale chaque ligne en double avec ses lignes sœurs. J'ai filtré le tableau : la colonne Correction indique la marche à suivre.",
      actionLabel: "Voir les doublons",
      actionFilter: "duplicate",
    };
  }
  if (has("obligatoire", "mandatory", "manquant", "missing", "étoile", "*")) {
    return {
      id: mid(),
      role: "agent",
      text: "R1 — toute colonne marquée * plus la colonne clé doivent être remplies. Une cellule vide bloque le chargement Cockpit.",
      actionLabel: "Voir R1",
      actionFilter: "mandatory",
    };
  }
  if (has("cohérence", "coherence", "consistency", "lien", "liaison", "incohérence", "master", "assignment")) {
    return {
      id: mid(),
      role: "agent",
      text: "R2 — chaque clé d'une feuille enfant doit exister dans la feuille parent, sinon c'est bloquant. Une clé parent jamais utilisée n'est qu'un avertissement (orphelin à vérifier).",
      actionLabel: "Voir R2",
      actionFilter: "consistency",
    };
  }
  if (has("export", "cockpit", "télécharg", "download", "template", "modèle")) {
    return {
      id: mid(),
      role: "agent",
      text: "En haut à droite : Export clean (un fichier par feuille, sans les lignes bloquantes) et journal d'erreurs pour les métiers.",
      actionLabel: "Tout voir",
      actionFilter: "all",
    };
  }
  if (has("bonjour", "hello", "salut", "aide", "help")) {
    return {
      id: mid(),
      role: "agent",
      text: "Je contrôle R1 (obligatoires *), R2 (cohérence entre feuilles) et R3 (doublons). Essayez « voir les doublons » ou cliquez sur une ligne du tableau.",
      actionLabel: "Tout voir",
      actionFilter: "all",
    };
  }
  return {
    id: mid(),
    role: "agent",
    text: "Compris. Si vous avez déposé un fichier, il est déjà noté à droite. Demandez « voir les doublons » ou cliquez sur une ligne en erreur.",
    actionLabel: "Tout voir",
    actionFilter: "all",
  };
}

export { mid };
