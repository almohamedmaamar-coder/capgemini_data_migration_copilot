"use client";

import { useState } from "react";
import { FileUp, Loader2, Table2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/cn";

export default function UploadDropzone({ compact = false }: { compact?: boolean }) {
  const { loading, analyzeFile, loadSample } = useStore();
  const [drag, setDrag] = useState(false);

  const handleFile = (file: File) => {
    if (file) analyzeFile(file);
  };

  if (compact) {
    return (
      <div className="px-4 pt-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFile(f);
          }}
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed bg-brand-50/40 px-4 py-3 transition-colors",
            drag ? "border-brand-600 bg-brand-500/[0.08]" : "border-brand-600/30"
          )}
        >
          <p className="text-[12.5px] text-stone-500">
            <span className="font-semibold text-stone-800">Analyser un autre classeur</span>
            {" — glissez-déposez ici ou "}
          </p>
          <div className="flex gap-2">
            <label className="cursor-pointer rounded-lg bg-brand-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-brand-700">
              {loading ? "Chargement…" : "Parcourir"}
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              onClick={loadSample}
              className="flex items-center gap-1.5 rounded-lg border border-brand-600/30 bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-brand-700 hover:bg-brand-50"
            >
              <Table2 size={13} /> Essayer la démo
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed bg-brand-50/40 px-6 py-10 text-center transition-colors",
          drag ? "border-brand-600 bg-brand-500/[0.08]" : "border-brand-600/30"
        )}
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-[0_8px_20px_-6px_rgba(108,143,112,0.7)]">
          {loading ? <Loader2 size={17} className="animate-spin" /> : <FileUp size={17} />}
        </div>
        <div>
          <p className="font-display text-[19px] font-semibold tracking-tight text-stone-900">
            Déposez votre classeur Profit Center ici
          </p>
          <p className="mt-0.5 text-[12.5px] text-stone-500">
            Master Record + Company Code Assignment — feuilles et clés détectées automatiquement
          </p>
        </div>
        <div className="mt-1 flex gap-2">
          <label className="cursor-pointer rounded-lg bg-brand-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-brand-700">
            Parcourir
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </label>
          <button
            onClick={loadSample}
            className="flex items-center gap-1.5 rounded-lg border border-brand-600/30 bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-brand-700 hover:bg-brand-50"
          >
            <Table2 size={13} /> Essayer la démo
          </button>
        </div>
      </div>
    </div>
  );
}
