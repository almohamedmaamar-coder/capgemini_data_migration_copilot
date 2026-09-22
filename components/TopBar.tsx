"use client";

import { ArrowRightLeft, Download, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { exportClean, exportErrors } from "@/lib/export";
import { useStore } from "@/lib/store";

export default function TopBar() {
  const { report, sidebarOpen, setSidebarOpen, loadSample } = useStore();

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-stone-900/10 bg-[#FCFBF8]/85 px-4 py-2.5 backdrop-blur">
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Afficher / masquer le chat"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-900/10 text-stone-500 hover:bg-white"
      >
        {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
      </button>

      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-white shadow-[0_2px_8px_-2px_rgba(108,143,112,0.7)]">
          <ArrowRightLeft size={13} strokeWidth={2.5} />
        </div>
        <p className="font-display text-[14px] font-semibold tracking-tight text-stone-900">
          Migration Copilot
        </p>
        <span className="hidden rounded-full bg-brand-500/10 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-brand-600 sm:inline">
          Qualité Profit Center
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={loadSample}
          className="rounded-lg border border-stone-900/10 bg-white px-3 py-1.5 text-[12.5px] font-medium text-stone-700 hover:bg-stone-50"
        >
          Démo
        </button>
        <button
          disabled={!report}
          onClick={() => report && exportErrors(report)}
          className="rounded-lg border border-stone-900/10 bg-white px-3 py-1.5 text-[12.5px] font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
        >
          Journal d'erreurs
        </button>
        <button
          disabled={!report}
          onClick={() => report && exportClean(report)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
        >
          <Download size={13} />
          Export clean
        </button>
      </div>
    </div>
  );
}
