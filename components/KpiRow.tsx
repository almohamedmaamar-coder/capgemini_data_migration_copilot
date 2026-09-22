"use client";

import { useStore } from "@/lib/store";
import { cn } from "@/lib/cn";

export default function KpiRow() {
  const { report, loading } = useStore();

  if (loading) {
    return (
      <div className="animate-enter px-4 pt-3" style={{ animationDelay: "110ms" }}>
        <div className="grid animate-pulse grid-cols-5 border-y border-stone-900/10">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="px-2 py-2.5">
              <div className="h-2.5 w-14 rounded bg-stone-900/10" />
              <div className="mt-2 h-6 w-10 rounded bg-stone-900/10" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!report) return null;
  const s = report.summary;
  const stats = [
    { label: "Valides", value: s.valid, tone: "text-brand-700" },
    { label: "Obligatoires", value: s.mandatoryMissing, sub: "R1", tone: "text-severe-700" },
    { label: "Incohérences", value: s.inconsistent, sub: "R2", tone: "text-severe-700" },
    { label: "Doublons", value: s.duplicates, sub: "R3", tone: "text-severe-700" },
    { label: "Lignes", value: s.total, sub: "total", tone: "text-stone-900" },
  ];

  return (
    <div className="animate-enter px-4 pt-1" style={{ animationDelay: "110ms" }}>
      <div className="grid grid-cols-5 border-b border-stone-900/10">
        {stats.map((stat) => (
          <div key={stat.label} className="px-2 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
              {stat.label}
              {stat.sub && <span className="ml-1 font-mono normal-case tracking-normal">· {stat.sub}</span>}
            </p>
            <p
              className={cn(
                "tnum mt-1 font-display text-[22px] font-semibold leading-none tracking-tight",
                stat.tone
              )}
            >
              {stat.value.toLocaleString("fr-FR")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
