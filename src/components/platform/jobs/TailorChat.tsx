"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { chatAboutResume, clearResumeChat } from "@/actions/tailor";
import { Button, Eyebrow } from "@/components/platform/ds";
import type { Resume } from "@/lib/jobs/resume-schema";
import { applyTailorEdits, type TailorEdit, type TailoredDoc } from "@/lib/jobs/tailor";

export type ChatTurnView = { role: "user" | "assistant"; text: string; at: string; edits?: string[] };

const small = { fontSize: "var(--text-sm)" } as const;

/**
 * Talk to Claude about this job's résumé. Claude sees the master content and
 * the posting (personal details removed and checked before anything is sent,
 * including what's typed here), plus the version on screen. Proposed edits
 * are applied only on "Apply", run through the same checks as hand edits,
 * and can be undone; nothing is saved until "Save as new version".
 */
export function TailorChat(props: {
  postingId: string;
  master: Resume;
  doc: TailoredDoc | null;
  locked: boolean;
  enabled: boolean;
  initial: ChatTurnView[];
  onApply: (doc: TailoredDoc) => void;
}) {
  const [turns, setTurns] = useState<ChatTurnView[]>(props.initial);
  const [message, setMessage] = useState("");
  const [proposal, setProposal] = useState<TailorEdit[] | null>(null);
  const [result, setResult] = useState<{ applied: string[]; skipped: string[] } | null>(null);
  const [undo, setUndo] = useState<TailoredDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [turns, proposal]);

  const send = () => {
    if (!props.doc || !message.trim()) return;
    const text = message.trim();
    setError(null);
    setProposal(null);
    setResult(null);
    setTurns((t) => [...t, { role: "user", text, at: new Date().toISOString() }]);
    setMessage("");
    start(async () => {
      const r = await chatAboutResume(props.postingId, props.doc!, text);
      if ("error" in r) {
        setError(r.error);
        setTurns((t) => t.slice(0, -1));
        setMessage(text);
        return;
      }
      setTurns(r.history);
      setProposal(r.edits.length ? r.edits : null);
    });
  };

  const apply = () => {
    if (!props.doc || !proposal) return;
    const out = applyTailorEdits(props.master, props.doc, proposal);
    setUndo(props.doc);
    props.onApply(out.doc);
    setResult({ applied: out.applied, skipped: out.skipped });
    setProposal(null);
  };

  const disabledReason = !props.enabled
    ? "Set ANTHROPIC_API_KEY to chat with Claude."
    : !props.doc
      ? "Start a version first, then ask for changes here."
      : props.locked
        ? "This version was sent and is locked. Pick another version to keep editing."
        : null;

  return (
    <div className="form-card" style={{ display: "grid", gap: 10 }} data-testid="tailor-chat">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Eyebrow index="AI">Ask Claude</Eyebrow>
        {turns.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await clearResumeChat(props.postingId);
                setTurns([]);
                setProposal(null);
                setResult(null);
              })
            }
          >
            Clear
          </Button>
        )}
      </div>
      <p style={{ ...small, margin: 0, color: "var(--text-muted)" }}>
        Ask for changes (&ldquo;lead with the Medicaid work&rdquo;, &ldquo;shorter summary&rdquo;, &ldquo;leave out the 2012 role&rdquo;) or ask why. Claude sees your résumé content and this posting, never your name or contact details.
      </p>

      {turns.length > 0 && (
        <div style={{ display: "grid", gap: 8, maxHeight: 360, overflowY: "auto", paddingRight: 4 }}>
          {turns.map((t, i) => (
            <div
              key={`${t.at}-${i}`}
              style={{
                ...small,
                justifySelf: t.role === "user" ? "end" : "start",
                maxWidth: "90%",
                padding: "8px 10px",
                borderRadius: "var(--radius-md)",
                background: t.role === "user" ? "var(--color-surface-sunken, #f1efe9)" : "transparent",
                border: t.role === "assistant" ? "1px solid var(--border-subtle)" : "none",
                whiteSpace: "pre-wrap",
              }}
            >
              {t.text}
              {t.role === "assistant" && t.edits && t.edits.length > 0 && (
                <div style={{ color: "var(--text-muted)", marginTop: 4 }}>Proposed: {t.edits.join("; ")}</div>
              )}
            </div>
          ))}
          <div ref={end} />
        </div>
      )}

      {proposal && (
        <div style={{ ...small, display: "grid", gap: 6, borderLeft: "3px solid var(--brand, #6b5)", paddingLeft: 10 }}>
          <strong>{proposal.length === 1 ? "1 change" : `${proposal.length} changes`} ready</strong>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {proposal.map((e, i) => (
              <li key={i}>{e.why || e.op}</li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: 8 }}>
            <Button type="button" variant="primary" size="sm" onClick={apply} disabled={!!disabledReason}>
              Apply changes
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setProposal(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div style={{ ...small, display: "grid", gap: 4 }}>
          {result.applied.length > 0 && (
            <span style={{ color: "var(--positive)" }}>
              Applied {result.applied.length}. Review the highlighted checks, then save as a new version.
            </span>
          )}
          {result.skipped.map((s) => (
            <span key={s} style={{ color: "var(--caution)" }}>
              Skipped: {s}
            </span>
          ))}
          {undo && (
            <span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  props.onApply(undo);
                  setUndo(null);
                  setResult(null);
                }}
              >
                Undo
              </Button>
            </span>
          )}
        </div>
      )}

      {error && (
        <span role="alert" style={{ ...small, color: "var(--critical)" }}>
          {error}
        </span>
      )}

      {disabledReason ? (
        <p style={{ ...small, margin: 0, color: "var(--text-muted)" }}>{disabledReason}</p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          <textarea
            aria-label="Message to Claude"
            rows={3}
            value={message}
            disabled={pending}
            placeholder="What should change?"
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
            }}
            style={{ font: "inherit", width: "100%", padding: "8px 10px", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Button type="button" variant="primary" size="sm" disabled={pending || !message.trim()} onClick={send}>
              {pending ? "Thinking…" : "Send"}
            </Button>
            <span style={{ ...small, color: "var(--text-muted)" }}>Ctrl/⌘ + Enter</span>
          </div>
        </div>
      )}
    </div>
  );
}
