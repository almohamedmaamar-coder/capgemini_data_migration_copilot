"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/cn";

function useCountUp(target: number, duration = 1000) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

export default function Verdict() {
  const { report } = useStore();
  const total = report?.summary.total ?? 0;
  const valid = report?.summary.valid ?? 0;
  const target = total === 0 ? 0 : Math.round((valid / total) * 100);
  const animated = useCountUp(target);

  if (!report || total === 0) return null;

  const blocking = report.issues.filter((i) => i.severity === "blocking").length;
  const warnings = report.issues.filter((i) => i.severity !== "blocking").length;
  const time = new Date(report.generatedAt).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const headline =
    report.agentSynthesis?.headline ||
    (target >= 95
      ? "Prêt pour Cockpit."
      : target >= 80
        ? "Corrigeable avant Cockpit."
        : "Pas prêt pour Cockpit.");
  const sub =
    report.agentSynthesis?.verdict ||
    (target >= 95
      ? "Ce fichier passera la simulation du Cockpit de migration."
      : target >= 80
        ? `${blocking} anomalie${blocking > 1 ? "s" : ""} bloquante${blocking > 1 ? "s" : ""} à corriger, puis simulez.`
        : "Les anomalies bloquantes rejetteront en simulation — commencez par les clés et les champs *.");

  const detected = report.sheets
    .map((s) => `${s.name} (clé : ${s.keyColumn ?? "?"})`)
    .join(" · ");

  return (
    <div className="animate-enter px-4 pt-4" style={{ animationDelay: "30ms" }}>
      <div className="bg-dots rounded-2xl border border-brand-600/20 bg-brand-50/40 px-5 pb-5 pt-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-stone-400">
            S/4HANA · Rapport qualité Profit Center
          </p>
          <p className="ml-auto truncate font-mono text-[11px] text-stone-400">
            {report.fileName} · {total} lignes · {time}
          </p>
        </div>

        <div className="mt-2 flex flex-wrap items-end gap-x-7 gap-y-2">
          <p className="font-display text-[80px] font-semibold leading-[0.9] tracking-tighter text-stone-900">
            {animated}
            <span className="text-brand-500">%</span>
          </p>
          <div className="min-w-0 pb-2">
            <p className="font-display text-[22px] font-semibold tracking-tight text-stone-900">
              {headline}
            </p>
            <p className="mt-1 text-[12.5px] text-stone-500">{sub}</p>
          </div>
          <div className="ml-auto flex gap-4 pb-2.5 font-mono text-[11px]">
            <span className={cn(blocking > 0 ? "text-severe-600" : "text-stone-400")}>
              {blocking} bloquantes
            </span>
            <span className="text-stone-400">{warnings} avertissements</span>
          </div>
        </div>

        <p className="mt-2 truncate font-mono text-[11px] text-stone-400">
          Détecté : {detected}
          {report.links.length > 0 &&
            ` — lien : ${report.links.map((l) => `${l.childSheet} → ${l.parentSheet} (${l.keyColumn})`).join(" · ")}`}
        </p>

        <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-stone-900/10">
          <div
            className="h-full rounded-full bg-brand-500 transition-[width] duration-700"
            style={{ width: `${target}%` }}
          />
        </div>
      </div>
    </div>
  );
}
