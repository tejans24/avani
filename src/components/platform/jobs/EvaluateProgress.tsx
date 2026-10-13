"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EvaluateEvent } from "@/lib/jobs/evaluate";
import type { FitAnalysis } from "@/lib/jobs/fit";

type State = { running: boolean; error: string | null; startedAt: number | null; thinking: string; chars: number; done: boolean; result: FitAnalysis | null };
const IDLE: State = { running: false, error: null, startedAt: null, thinking: "", chars: 0, done: false, result: null };

/**
 * Runs an evaluation through the streaming endpoint and keeps what it reports:
 * Claude's reasoning summary as it arrives, then how much of the report is
 * written. Refreshes the page when the result is saved.
 */
export function useEvaluateStream(postingId: string) {
  const router = useRouter();
  const [state, setState] = useState<State>(IDLE);

  const start = async () => {
    setState({ ...IDLE, running: true, startedAt: Date.now() });
    try {
      const res = await fetch(`/api/jobs/${postingId}/evaluate`, { method: "POST" });
      if (!res.ok || !res.body) throw new Error(res.status === 401 ? "Sign in again to evaluate." : `The evaluation couldn't start (${res.status}).`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as EvaluateEvent;
          if (e.type === "thinking") setState((s) => ({ ...s, thinking: s.thinking + e.text }));
          else if (e.type === "writing") setState((s) => ({ ...s, chars: e.chars }));
          else if (e.type === "error") throw new Error(e.message);
          // The result itself: shown right away, while the refresh updates the rest of the page.
          else if (e.type === "done") setState((s) => ({ ...s, done: true, result: e.analysis }));
        }
      }
      setState((s) => ({ ...s, running: false }));
      router.refresh();
    } catch (err) {
      setState((s) => ({ ...s, running: false, error: err instanceof Error ? err.message : "The evaluation failed." }));
    }
  };

  return { ...state, start };
}

/** The live log under "Is it worth it?" while an evaluation runs. */
export function EvaluateLog({ startedAt, thinking, chars, done }: { startedAt: number | null; thinking: string; chars: number; done: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [thinking]);

  const seconds = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
  const stage = done
    ? "Saved. Loading the result…"
    : chars > 0
      ? `Writing the report… ${chars.toLocaleString()} characters`
      : thinking
        ? "Reading the posting against your criteria and résumé…"
        : "Sending the posting to Claude…";

  return (
    <div style={{ display: "grid", gap: 8 }} data-testid="evaluate-log" aria-live="polite">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "var(--text-sm)" }}>
        <strong>{stage}</strong>
        <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} · usually 1 to 2 minutes
        </span>
      </div>
      {thinking && (
        <div
          ref={box}
          style={{
            maxHeight: 180,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            fontSize: "var(--text-sm)",
            color: "var(--text-secondary)",
            padding: "8px 10px",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-surface-sunken, #f1efe9)",
          }}
        >
          {thinking}
        </div>
      )}
    </div>
  );
}
