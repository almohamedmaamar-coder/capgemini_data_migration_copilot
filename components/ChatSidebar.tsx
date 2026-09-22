"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import {
  ArrowUp,
  Sparkles,
  CheckSquare,
  MessageSquare,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Check,
  ChevronRight,
  ShieldCheck,
  Send,
  Loader2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/cn";

export default function ChatSidebar() {
  const {
    messages,
    sendChat,
    setFilter,
    loadSample,
    report,
    selectedRowId,
    setSelectedRowId,
    activeSheet,
  } = useStore();

  const [activeTab, setActiveTab] = useState<"chat" | "checklist">("chat");
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [checkedTasks, setCheckedTasks] = useState<Record<string, boolean>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setIsSending(true);
    sendChat(clean);
    setInput("");
    setTimeout(() => setIsSending(false), 800);
  };

  // Extract selected row details for spotlight
  const selectedRow = useMemo(() => {
    if (!report || !selectedRowId) return null;
    return report.rows.find((r) => r.id === selectedRowId) ?? null;
  }, [report, selectedRowId]);

  const selectedRowIssues = useMemo(() => {
    if (!report || !selectedRowId) return [];
    return report.issues.filter((i) => i.rowId === selectedRowId);
  }, [report, selectedRowId]);

  // Dynamic Remediation Checklist generated from findings
  const checklistItems = useMemo(() => {
    if (!report) return [];
    const items: {
      id: string;
      title: string;
      description: string;
      severity: "blocking" | "warning";
      count: number;
      filterRule?: "mandatory" | "consistency" | "duplicate";
    }[] = [];

    const issues = report.issues;
    const r1Issues = issues.filter((i) => i.rule === "R1");
    const r2Issues = issues.filter((i) => i.rule === "R2");
    const r3Issues = issues.filter((i) => i.rule === "R3");

    // R1 Tasks grouped by column
    const r1ByCol: Record<string, number> = {};
    r1Issues.forEach((i) => {
      const col = i.field || "Champ requis";
      r1ByCol[col] = (r1ByCol[col] || 0) + 1;
    });

    Object.entries(r1ByCol).forEach(([col, count]) => {
      items.push({
        id: `r1_${col}`,
        title: `Renseigner le champ « ${col} »`,
        description: `${count} ligne(s) sans valeur. Bloquera l'intégration SAP Cockpit.`,
        severity: "blocking",
        count,
        filterRule: "mandatory",
      });
    });

    // R3 Duplicate Tasks
    if (r3Issues.length > 0) {
      items.push({
        id: "r3_duplicates",
        title: "Résoudre les doublons de clés primaires",
        description: `${r3Issues.length} conflit(s) détecté(s). SAP n'autorise qu'un centre de profit par clé.`,
        severity: "blocking",
        count: r3Issues.length,
        filterRule: "duplicate",
      });
    }

    // R2 Inconsistency Tasks
    if (r2Issues.length > 0) {
      const blockingR2 = r2Issues.filter((i) => i.severity === "blocking");
      if (blockingR2.length > 0) {
        items.push({
          id: "r2_orphans_blocking",
          title: "Corriger les clés absentes de Master Record",
          description: `${blockingR2.length} affectation(s) orpheline(s) pointant vers un centre inexistant.`,
          severity: "blocking",
          count: blockingR2.length,
          filterRule: "consistency",
        });
      }
      const warnR2 = r2Issues.filter((i) => i.severity !== "blocking");
      if (warnR2.length > 0) {
        items.push({
          id: "r2_orphans_warning",
          title: "Vérifier les centres de profit sans affectation",
          description: `${warnR2.length} centre(s) présent(s) dans Master Record mais non rattaché(s) à une société.`,
          severity: "warning",
          count: warnR2.length,
          filterRule: "consistency",
        });
      }
    }

    return items;
  }, [report]);

  // Dynamic Prompt Chips tailored to actual anomalies found in this workbook
  const dynamicPromptChips = useMemo(() => {
    if (!report) return [];
    const chips: { label: string; prompt: string }[] = [];

    // 1. Top offending column
    const r1Issues = report.issues.filter((i) => i.rule === "R1");
    const colCounts: Record<string, number> = {};
    r1Issues.forEach((i) => {
      const col = i.field || "";
      if (col) colCounts[col] = (colCounts[col] || 0) + 1;
    });
    const sortedCols = Object.entries(colCounts).sort((a, b) => b[1] - a[1]);
    if (sortedCols.length > 0) {
      const [colName, errCount] = sortedCols[0];
      chips.push({
        label: `Cause « ${colName} » (${errCount})`,
        prompt: `Analyse la colonne « ${colName} » (${errCount} rejets) : pourquoi est-elle requise dans SAP et comment la corriger en masse ?`,
      });
    }

    // 2. Duplicate key
    const r3Issues = report.issues.filter((i) => i.rule === "R3");
    if (r3Issues.length > 0) {
      const sampleVal = r3Issues[0].field || "clé";
      chips.push({
        label: `Doublon « ${sampleVal} »`,
        prompt: `Explique pourquoi la clé « ${sampleVal} » est en doublon et quelle est la règle d'unicité SAP pour cette entité.`,
      });
    }

    // 3. Inter-sheet consistency
    const r2Issues = report.issues.filter((i) => i.rule === "R2");
    if (r2Issues.length > 0) {
      chips.push({
        label: `Rattachement R2 (${r2Issues.length})`,
        prompt: `Pourquoi les anomalies d'affectation inter-onglets (R2) provoquent un échec en simulation Cockpit ?`,
      });
    }

    // 4. Executive summary for business stakeholders
    chips.push({
      label: "Rapport pour le métier",
      prompt: "Rédige une note d'audit claire et structurée destinée au responsable métier pour arbitrer les corrections à apporter.",
    });

    return chips;
  }, [report]);

  const toggleTask = (id: string) => {
    setCheckedTasks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const completedCount = checklistItems.filter((item) => checkedTasks[item.id]).length;

  return (
    <div className="flex h-full flex-col bg-[#FCFBF8]">
      {/* Top Header */}
      <div className="border-b border-stone-900/10 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-600/20">
              <Sparkles size={15} />
            </div>
            <div>
              <p className="font-display text-[13.5px] font-bold text-stone-900">
                Copilote d'Audit
              </p>
              <p className="text-[11px] text-stone-500">
                {report
                  ? `${report.summary.valid} / ${report.summary.total} lignes conformes`
                  : "En attente d'un classeur"}
              </p>
            </div>
          </div>

          {/* Mode Switcher: Chat vs Check-list */}
          {report && (
            <div className="flex rounded-lg bg-stone-100 p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab("chat")}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-all",
                  activeTab === "chat"
                    ? "bg-white text-stone-900 shadow-2xs"
                    : "text-stone-500 hover:text-stone-800"
                )}
                title="Dialogue d'audit"
              >
                <MessageSquare size={12} />
                <span>Chat</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("checklist")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all",
                  activeTab === "checklist"
                    ? "bg-white text-stone-900 shadow-2xs"
                    : "text-stone-500 hover:text-stone-800"
                )}
                title="Check-list de remédiation"
              >
                <CheckSquare size={12} />
                <span>Plan ({checklistItems.length})</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === "chat" ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Messages & Briefing Container */}
          <div className="slim-scroll flex-1 space-y-3.5 overflow-y-auto p-4">
            {/* Compact Triage Hub (if file is loaded) */}
            {report && (
              <div className="rounded-2xl border border-stone-900/10 bg-white p-3.5 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        report.summary.total - report.summary.valid > 0
                          ? "bg-severe-500 animate-pulse"
                          : "bg-brand-500"
                      )}
                    />
                    <span className="text-xs font-bold text-stone-900">
                      Taux de conformité Cockpit
                    </span>
                  </div>
                  <span className="font-mono text-xs font-bold text-stone-900">
                    {report.summary.total > 0
                      ? Math.round((report.summary.valid / report.summary.total) * 100)
                      : 0}
                    %
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                  <div
                    style={{
                      width: `${report.summary.total > 0 ? (report.summary.valid / report.summary.total) * 100 : 0}%`,
                    }}
                    className={cn(
                      "h-full transition-all duration-500",
                      report.summary.total - report.summary.valid > 0
                        ? "bg-severe-500"
                        : "bg-brand-500"
                    )}
                  />
                </div>

                {/* Interactive Triage Filter Pills */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-stone-100">
                  {report.summary.mandatoryMissing > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilter("mandatory")}
                      className="flex items-center gap-1 rounded-lg bg-severe-50 px-2 py-1 text-[11px] font-semibold text-severe-700 hover:bg-severe-100 transition-colors"
                      title="Filtrer les champs obligatoires manquants"
                    >
                      <AlertOctagon size={11} />
                      <span>{report.summary.mandatoryMissing} bloquants R1</span>
                    </button>
                  )}
                  {report.summary.inconsistent > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilter("consistency")}
                      className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
                      title="Filtrer les incohérences de rattachement"
                    >
                      <AlertTriangle size={11} />
                      <span>{report.summary.inconsistent} incohérence R2</span>
                    </button>
                  )}
                  {report.summary.duplicates > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilter("duplicate")}
                      className="flex items-center gap-1 rounded-lg bg-severe-50 px-2 py-1 text-[11px] font-semibold text-severe-700 hover:bg-severe-100 transition-colors"
                      title="Filtrer les doublons de clés primaires"
                    >
                      <AlertOctagon size={11} />
                      <span>{report.summary.duplicates} doublons R3</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Conversation Messages */}
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="msg-in flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-xs bg-stone-900 px-3.5 py-2 text-xs leading-relaxed text-white shadow-2xs">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="msg-in flex gap-2.5">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-600/20">
                    <Sparkles size={12} />
                  </div>
                  <div className="min-w-0 max-w-[88%] rounded-2xl rounded-tl-xs border border-stone-900/10 bg-white p-3 shadow-2xs">
                    <p className="text-xs leading-relaxed text-stone-800 whitespace-pre-line font-medium">
                      {m.text}
                    </p>
                    {m.actionLabel && (
                      <button
                        type="button"
                        onClick={() => {
                          if (m.actionLabel === "Charger la démo") loadSample();
                          else if (m.actionFilter) setFilter(m.actionFilter);
                        }}
                        className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100 transition-colors"
                      >
                        <Filter size={11} />
                        <span>{m.actionLabel}</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            )}
            <div ref={bottomRef} />
          </div>

          {/* Spotlight on Active Selected Row */}
          {selectedRow && (
            <div className="border-t border-stone-900/10 bg-amber-50/50 p-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-amber-800">
                    Ligne active : #{selectedRow.lineNo} ({selectedRow.key || "clé vide"})
                  </p>
                  <p className="text-xs text-stone-700 truncate font-medium">
                    {selectedRowIssues.length > 0
                      ? `${selectedRowIssues.length} anomalie(s) détectée(s)`
                      : "Ligne conforme"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    send(`Audite en détail la ligne ${selectedRow.lineNo} de ${selectedRow.sheet}. Explique la cause et comment la corriger pour SAP.`)
                  }
                  className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-800 border border-amber-200 hover:bg-amber-100/60 shadow-2xs transition-all"
                >
                  Auditer cette ligne ➜
                </button>
              </div>
            </div>
          )}

          {/* Smart Contextual Prompt Suggestions Chips */}
          {report && dynamicPromptChips.length > 0 && (
            <div className="border-t border-stone-900/10 bg-stone-50/60 px-3 py-2 overflow-x-auto slim-scroll">
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                {dynamicPromptChips.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => send(chip.prompt)}
                    className="flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-700 hover:border-stone-400 hover:bg-stone-50 transition-colors shadow-2xs"
                  >
                    <span>💡</span>
                    <span>{chip.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message Composer */}
          <div className="p-3 border-t border-stone-900/10 bg-white">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50/50 p-1.5 pl-3 transition-all focus-within:border-stone-900 focus-within:bg-white focus-within:ring-1 focus-within:ring-stone-900"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Posez une question sur le fichier…"
                className="min-w-0 flex-1 bg-transparent text-xs text-stone-900 outline-none placeholder:text-stone-400"
              />
              <button
                type="submit"
                disabled={!input.trim() || isSending}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-white transition-all hover:bg-black disabled:opacity-30"
              >
                {isSending ? <Loader2 size={13} className="animate-spin" /> : <ArrowUp size={13} />}
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* Tab 2: Interactive Remediation Checklist */
        <div className="slim-scroll flex-1 overflow-y-auto p-4 space-y-4">
          <div className="rounded-2xl border border-stone-900/10 bg-white p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-800">
                Progression de la revue
              </span>
              <span className="font-mono text-xs font-bold text-stone-900">
                {completedCount} / {checklistItems.length}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
              <div
                style={{
                  width: `${checklistItems.length > 0 ? (completedCount / checklistItems.length) * 100 : 0}%`,
                }}
                className="h-full bg-brand-500 transition-all duration-300"
              />
            </div>
            <p className="text-[11px] text-stone-500">
              Cochez les actions au fur et à mesure de vos vérifications avant la simulation Cockpit.
            </p>
          </div>

          <div className="space-y-2">
            {checklistItems.map((item) => {
              const isDone = checkedTasks[item.id] || false;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-xl border p-3 transition-all",
                    isDone
                      ? "border-stone-200 bg-stone-100/50 opacity-60"
                      : "border-stone-900/10 bg-white shadow-2xs hover:border-stone-300"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => toggleTask(item.id)}
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        isDone
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-stone-300 bg-white hover:border-stone-500"
                      )}
                    >
                      {isDone && <Check size={11} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4
                          className={cn(
                            "text-xs font-bold",
                            isDone ? "line-through text-stone-400" : "text-stone-900"
                          )}
                        >
                          {item.title}
                        </h4>
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.2 text-[9.5px] font-semibold shrink-0",
                            item.severity === "blocking"
                              ? "bg-severe-50 text-severe-700"
                              : "bg-amber-50 text-amber-800"
                          )}
                        >
                          {item.count}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
                        {item.description}
                      </p>
                      {item.filterRule && (
                        <button
                          type="button"
                          onClick={() => {
                            setFilter(item.filterRule!);
                            setActiveTab("chat");
                          }}
                          className="mt-2 text-[10.5px] font-semibold text-stone-700 hover:text-stone-900 flex items-center gap-1"
                        >
                          <span>Inspecter dans le tableau</span>
                          <ChevronRight size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
