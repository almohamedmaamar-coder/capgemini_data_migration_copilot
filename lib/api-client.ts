import type { QualityReport } from "@/types/quality";

const AGENT_URL =
  process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:8001";

export interface ServerAnalyzeResult {
  session_id: string;
  report: QualityReport;
}

export interface ServerChatResult {
  reply: string;
  actionFilter?: "mandatory" | "consistency" | "duplicate" | "all";
  actionLabel?: string;
}

async function withTimeout(ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

/** Retourne null si le serveur est injoignable (fallback local). */
export async function analyzeViaServer(
  file: File
): Promise<ServerAnalyzeResult | null> {
  try {
    const { signal, done } = await withTimeout(60000);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${AGENT_URL}/analyze`, {
      method: "POST",
      body: form,
      signal,
    });
    done();
    if (!res.ok) return null;
    return (await res.json()) as ServerAnalyzeResult;
  } catch {
    return null;
  }
}

/** Retourne null si le serveur est injoignable ou le modèle non configuré. */
export async function chatViaServer(
  sessionId: string,
  message: string
): Promise<ServerChatResult | null> {
  try {
    const { signal, done } = await withTimeout(90000);
    const res = await fetch(`${AGENT_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, message }),
      signal,
    });
    done();
    if (!res.ok) return null;
    return (await res.json()) as ServerChatResult;
  } catch {
    return null;
  }
}
