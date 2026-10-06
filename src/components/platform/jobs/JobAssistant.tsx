"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  addApplicationAnswers,
  chatAboutJob,
  clearJobChat,
  deleteApplicationAnswer,
  fillApplicationAnswers,
  saveApplicationAnswer,
} from "@/actions/answers";
import { Badge, Button, Eyebrow } from "@/components/platform/ds";
import type { ApplicationAnswer, AnswerSource } from "@/lib/jobs/answers";

type Turn = { role: "user" | "assistant"; text: string; at: string };
type Draft = { question: string; answer: string; note: string };

const small = { fontSize: "var(--text-sm)" } as const;
const input: React.CSSProperties = {
  font: "inherit",
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
};
const SOURCE: Record<AnswerSource, { label: string; tone: "neutral" | "brand" | "positive" }> = {
  app: { label: "Filled by the app", tone: "neutral" },
  claude: { label: "Drafted by Claude", tone: "brand" },
  you: { label: "Yours", tone: "positive" },
  todo: { label: "Not drafted yet", tone: "neutral" },
};

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={!text}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked: the text is selectable */
        }
      }}
    >
      {done ? "Copied" : "Copy"}
    </Button>
  );
}

function AnswerRow({ a, postingId, onChange }: { a: ApplicationAnswer; postingId: string; onChange: (list: ApplicationAnswer[]) => void }) {
  const [text, setText] = useState(a.answer);
  const [pending, start] = useTransition();
  useEffect(() => setText(a.answer), [a.answer]);
  const changed = text !== a.answer;
  return (
    <div style={{ display: "grid", gap: 6, padding: "10px 12px", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }} data-testid="answer-row">
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <strong style={{ ...small, flex: 1, minWidth: 200 }}>{a.question}</strong>
        <Badge tone={SOURCE[a.source].tone}>{SOURCE[a.source].label}</Badge>
      </div>
      <textarea aria-label={`Answer: ${a.question}`} rows={Math.min(8, Math.max(2, Math.ceil(text.length / 90)))} value={text} onChange={(e) => setText(e.target.value)} style={input} />
      {a.note && <span style={{ ...small, color: "var(--caution)" }}>{a.note}</span>}
      <div style={{ display: "flex", gap: 6 }}>
        <CopyButton text={text} />
        {changed && (
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => start(async () => { const r = await saveApplicationAnswer(postingId, a.id, text); if ("answers" in r) onChange(r.answers); })}>
            Save
          </Button>
        )}
        <span style={{ flex: 1 }} />
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { const r = await deleteApplicationAnswer(postingId, a.id); if ("answers" in r) onChange(r.answers); })}>
          Remove
        </Button>
      </div>
    </div>
  );
}

/**
 * The job page's assistant: a chat about the posting, and the application's
 * answers. Personal questions are answered by the app from the master résumé
 * and never sent to Claude; the rest are drafted by Claude from the résumé
 * content and the posting. Everything is editable and copyable; the app never
 * submits anything.
 */
export function JobAssistant(props: { postingId: string; enabled: boolean; hasMaster: boolean; initialChat: Turn[]; initialAnswers: ApplicationAnswer[] }) {
  const [answers, setAnswers] = useState(props.initialAnswers);
  const [turns, setTurns] = useState(props.initialChat);
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [questions, setQuestions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [chatPending, startChat] = useTransition();
  const [fillPending, startFill] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  // Keep the newest message in view by scrolling the message list, never the page.
  useEffect(() => {
    const box = end.current?.parentElement;
    if (box) box.scrollTop = box.scrollHeight;
  }, [turns, drafts]);

  const blocked = !props.hasMaster ? "Import your master résumé first (Jobs → Résumé)." : !props.enabled ? "Set ANTHROPIC_API_KEY to use Claude here." : null;

  const send = () => {
    const text = message.trim();
    if (!text) return;
    setError(null);
    setDrafts([]);
    setTurns((t) => [...t, { role: "user", text, at: new Date().toISOString() }]);
    setMessage("");
    startChat(async () => {
      const r = await chatAboutJob(props.postingId, text);
      if ("error" in r) {
        setError(r.error);
        setTurns((t) => t.slice(0, -1));
        setMessage(text);
        return;
      }
      setTurns(r.history);
      setDrafts(r.answers);
    });
  };

  const fill = () => {
    setError(null);
    setNote(null);
    startFill(async () => {
      const r = await fillApplicationAnswers(props.postingId, questions);
      if ("error" in r) return setError(r.error);
      setAnswers(r.answers);
      setNote(r.note ?? null);
      setQuestions("");
    });
  };

  return (
    <>
      <div className="form-card" style={{ display: "grid", gap: 10, marginBottom: 20 }} data-testid="job-chat">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <Eyebrow index="AI">Ask Claude about this job</Eyebrow>
          {turns.length > 0 && (
            <Button type="button" variant="ghost" size="sm" disabled={chatPending} onClick={() => startChat(async () => { await clearJobChat(props.postingId); setTurns([]); setDrafts([]); })}>
              Clear
            </Button>
          )}
        </div>
        <p style={{ ...small, margin: 0, color: "var(--text-muted)" }}>
          &ldquo;Is this a governance seat or a building one?&rdquo; &ldquo;What should I ask the recruiter?&rdquo; &ldquo;Draft: Why do you want to work here?&rdquo; Claude sees your criteria, résumé content and this posting, never your name or contact details.
        </p>
        {turns.length > 0 && (
          <div style={{ display: "grid", gap: 8, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
            {turns.map((t, i) => (
              <div
                key={`${t.at}-${i}`}
                style={{
                  ...small,
                  justifySelf: t.role === "user" ? "end" : "start",
                  maxWidth: "88%",
                  padding: "8px 10px",
                  borderRadius: "var(--radius-md)",
                  background: t.role === "user" ? "var(--color-surface-sunken, #f1efe9)" : "transparent",
                  border: t.role === "assistant" ? "1px solid var(--border-subtle)" : "none",
                  whiteSpace: "pre-wrap",
                }}
              >
                {t.text}
              </div>
            ))}
            <div ref={end} />
          </div>
        )}
        {drafts.length > 0 && (
          <div style={{ ...small, display: "grid", gap: 6, borderLeft: "3px solid var(--positive)", paddingLeft: 10 }}>
            <strong>{drafts.length === 1 ? "1 drafted answer" : `${drafts.length} drafted answers`}</strong>
            {drafts.map((d) => (
              <div key={d.question}>
                <div style={{ fontWeight: 600 }}>{d.question}</div>
                <div style={{ whiteSpace: "pre-wrap" }}>{d.answer}</div>
                {d.note && <div style={{ color: "var(--caution)" }}>{d.note}</div>}
              </div>
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() =>
                  startChat(async () => {
                    const r = await addApplicationAnswers(props.postingId, drafts);
                    if ("error" in r) return setError(r.error);
                    setAnswers(r.answers);
                    setDrafts([]);
                  })
                }
              >
                Add to application answers
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setDrafts([])}>
                Dismiss
              </Button>
            </div>
          </div>
        )}
        {blocked ? (
          <p style={{ ...small, margin: 0, color: "var(--text-muted)" }}>{blocked}</p>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            <textarea
              aria-label="Message about this job"
              rows={2}
              value={message}
              disabled={chatPending}
              placeholder="Ask about this job"
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
              }}
              style={input}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Button type="button" variant="primary" size="sm" disabled={chatPending || !message.trim()} onClick={send}>
                {chatPending ? "Thinking…" : "Send"}
              </Button>
              <span style={{ ...small, color: "var(--text-muted)" }}>Ctrl/⌘ + Enter</span>
            </div>
          </div>
        )}
      </div>

      <div className="form-card" style={{ display: "grid", gap: 12, marginBottom: 20 }} data-testid="application-answers">
        <Eyebrow index="Q&A">Application answers</Eyebrow>
        <p style={{ ...small, margin: 0, color: "var(--text-muted)" }}>
          Paste the application form&apos;s questions, one per line. Name, contact, location, citizenship, work authorization, clearance and pay are filled in by the app from your résumé and never sent to Claude. Self-identification questions are left to you. Claude drafts the rest.
        </p>
        <textarea aria-label="Application questions" rows={4} value={questions} onChange={(e) => setQuestions(e.target.value)} placeholder={"First name\nAre you authorized to work in the US?\nWhy do you want to work here?"} style={input} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Button type="button" variant="primary" size="sm" disabled={fillPending || !questions.trim() || !props.hasMaster} onClick={fill}>
            {fillPending ? "Filling…" : "Fill answers"}
          </Button>
          {note && (
            <span role="status" style={{ ...small, color: "var(--positive)" }}>
              {note}
            </span>
          )}
          {error && (
            <span role="alert" style={{ ...small, color: "var(--critical)" }}>
              {error}
            </span>
          )}
        </div>
        {answers.some((a) => a.source === "todo") && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={fillPending || !props.hasMaster}
              onClick={() => {
                setError(null);
                setNote(null);
                startFill(async () => {
                  const todo = answers.filter((a) => a.source === "todo").map((a) => a.question);
                  const r = await fillApplicationAnswers(props.postingId, todo.join("\n"));
                  if ("error" in r) return setError(r.error);
                  setAnswers(r.answers);
                  setNote(r.note ?? null);
                });
              }}
            >
              {fillPending ? "Drafting…" : `Draft the other ${answers.filter((a) => a.source === "todo").length} with Claude`}
            </Button>
            <span style={{ ...small, color: "var(--text-muted)" }}>Collected from the application form when you added this job.</span>
          </div>
        )}
        {answers.length > 0 && (
          <div style={{ display: "grid", gap: 8 }}>
            {answers.map((a) => (
              <AnswerRow key={a.id} a={a} postingId={props.postingId} onChange={setAnswers} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
