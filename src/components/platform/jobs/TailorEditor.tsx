"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { generateTailored, markAppliedWithVersion, reuseTailoredVersion, saveTailoredVersion, startFromMaster } from "@/actions/tailor";
import { Badge, Button, Eyebrow } from "@/components/platform/ds";
import type { Resume } from "@/lib/jobs/resume-schema";
import { checkDocStyle, checkTruth, hasBlocking, omittedRoleGaps, type BulletStatus, type TailoredDoc } from "@/lib/jobs/tailor";
import { TailorChat, type ChatTurnView } from "./TailorChat";
import { ActionMessage, useAction } from "./useAction";

const STATUS_TONE: Record<BulletStatus, string> = { pending: "caution", accepted: "positive", edited: "brand", rejected: "neutral" };
const STATUS_LABEL: Record<BulletStatus, string> = { pending: "Review", accepted: "Accepted", edited: "Edited", rejected: "Rejected" };
const ORIGIN_LABEL: Record<TailoredDoc["generatedBy"], string> = { claude: "by Claude", quick: "quick tailor", master: "master as is", reuse: "reused" };
const REQ_COLOR: Record<string, string> = {
  COVERED: "var(--positive)",
  SKILLS_LIST_ONLY: "var(--caution)",
  STRETCH: "var(--caution)",
  GAP: "var(--critical)",
};
const REQ_LABEL: Record<string, string> = { COVERED: "Covered", SKILLS_LIST_ONLY: "Skills list only", STRETCH: "Stretch", GAP: "Gap" };

export type Requirement = { item: string; status: string; bulletIds: string[] };
export type ReusableVersion = { id: string; label: string; similarity: number; sent: boolean };

const box: React.CSSProperties = {
  font: "inherit",
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
};

export function TailorEditor(props: {
  postingId: string;
  master: Resume;
  versionId: string | null;
  version: number | null;
  initial: TailoredDoc | null;
  appliedVersionId: string | null;
  hasApiKey: boolean;
  posting: { title: string; descriptionText: string };
  /** The evaluation's fit table, when the job has been evaluated. */
  requirements: Requirement[];
  /** Versions made for other jobs, most similar posting first. */
  reusable: ReusableVersion[];
  chat: ChatTurnView[];
}) {
  const router = useRouter();
  const { pending, error, note, run } = useAction();
  const [doc, setDoc] = useState<TailoredDoc | null>(props.initial);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [focusReq, setFocusReq] = useState<number | null>(null);
  const [reuseId, setReuseId] = useState(props.reusable[0]?.id ?? "");
  const isSent = props.versionId !== null && props.versionId === props.appliedVersionId;

  const masterText = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of props.master.experience) for (const b of e.bullets) m.set(b.id, b.text);
    return m;
  }, [props.master]);

  const truth = useMemo(() => (doc ? checkTruth(props.master, doc) : []), [doc, props.master]);
  const style = useMemo(() => (doc ? checkDocStyle(props.master, doc) : []), [doc, props.master]);
  const blocking = doc ? hasBlocking(truth, style) : false;
  const issuesFor = (where: string) => [
    ...truth.filter((t) => t.where === where).map((t) => ({ severity: t.severity, message: t.message })),
    ...style.filter((s) => s.where === where).flatMap((s) => s.issues.map((i) => ({ severity: i.severity, message: i.message }))),
  ];

  const update = (fn: (d: TailoredDoc) => TailoredDoc) => {
    if (!doc || isSent) return;
    setDoc(fn(structuredClone(doc)));
    setDirty(true);
  };
  const setBullet = (roleId: string, id: string, patch: Partial<{ text: string; status: BulletStatus }>) =>
    update((d) => {
      const b = d.experience.find((r) => r.id === roleId)!.bullets.find((x) => x.id === id)!;
      Object.assign(b, patch);
      return d;
    });
  const moveBullet = (roleId: string, idx: number, delta: number) =>
    update((d) => {
      const list = d.experience.find((r) => r.id === roleId)!.bullets;
      const [b] = list.splice(idx, 1);
      list.splice(Math.max(0, Math.min(list.length, idx + delta)), 0, b);
      return d;
    });
  const setOmitted = (roleId: string, omitted: boolean) =>
    update((d) => {
      const r = d.experience.find((x) => x.id === roleId);
      if (r) r.omitted = omitted;
      else d.experience.push({ id: roleId, omitted, bullets: [] });
      return d;
    });
  const gaps = useMemo(() => (doc ? new Map(omittedRoleGaps(props.master, doc, new Date()).map((g) => [g.roleId, g.gaps])) : new Map<string, string[]>()), [doc, props.master]);
  const addBullet = (roleId: string, id: string) =>
    update((d) => {
      d.experience.find((r) => r.id === roleId)!.bullets.push({ id, text: masterText.get(id)!, status: "accepted" });
      return d;
    });

  const Issues = ({ where }: { where: string }) => {
    const list = issuesFor(where);
    if (!list.length) return null;
    return (
      <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: "var(--text-sm)" }}>
        {list.map((i, n) => (
          <li key={n} style={{ color: i.severity === "block" ? "var(--critical)" : "var(--caution)" }}>
            {i.severity === "block" ? "Must fix: " : ""}
            {i.message}
          </li>
        ))}
      </ul>
    );
  };

  const open = (r: { id?: string }) => router.push(`/jobs/${props.postingId}/tailor?v=${r.id}`);
  const generate = (mode: "claude" | "quick") => run(() => generateTailored(props.postingId, mode), open);

  // Requirement ↔ bullet links, from the evaluation's fit table.
  const reqsByBullet = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of props.requirements) for (const id of r.bulletIds) m.set(id, [...(m.get(id) ?? []), r.item]);
    return m;
  }, [props.requirements]);
  const focused = new Set(focusReq !== null ? (props.requirements[focusReq]?.bulletIds ?? []) : []);
  const focusRequirement = (i: number) => {
    const next = focusReq === i ? null : i;
    setFocusReq(next);
    const first = next !== null ? props.requirements[next]?.bulletIds[0] : undefined;
    if (first) document.getElementById(`bullet-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const small = { fontSize: "var(--text-sm)" } as const;

  return (
    <div className="tailor-workspace">
      <aside className="tailor-aside">
        <TailorChat
          postingId={props.postingId}
          master={props.master}
          doc={doc}
          locked={isSent}
          enabled={props.hasApiKey}
          initial={props.chat}
          onApply={(d) => {
            setDoc(d);
            setDirty(true);
          }}
        />

        <div className="form-card" style={{ display: "grid", gap: 10 }} data-testid="posting-panel">
          <Eyebrow index="JD">{props.posting.title}</Eyebrow>
          {props.requirements.length > 0 ? (
            <div style={{ display: "grid", gap: 4 }}>
              <span style={{ ...small, color: "var(--text-muted)" }}>What they ask for (from the evaluation). Click one to see the bullets that answer it.</span>
              {props.requirements.map((r, i) => (
                <button
                  key={r.item}
                  type="button"
                  onClick={() => focusRequirement(i)}
                  aria-pressed={focusReq === i}
                  style={{
                    ...small,
                    textAlign: "left",
                    display: "flex",
                    gap: 8,
                    padding: "4px 8px",
                    border: "1px solid " + (focusReq === i ? "var(--border-strong, #888)" : "var(--border-subtle)"),
                    borderRadius: "var(--radius-md)",
                    background: focusReq === i ? "var(--color-surface-sunken, #f1efe9)" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ color: REQ_COLOR[r.status] ?? "inherit", fontWeight: 600, minWidth: 64 }}>{REQ_LABEL[r.status] ?? r.status}</span>
                  <span>
                    {r.item}
                    {r.bulletIds.length ? <span style={{ color: "var(--text-muted)" }}> · {r.bulletIds.length} bullet{r.bulletIds.length === 1 ? "" : "s"}</span> : null}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <span style={{ ...small, color: "var(--text-muted)" }}>Evaluate this job on its page to see what it asks for, matched to your bullets.</span>
          )}
          <details>
            <summary style={{ ...small, cursor: "pointer" }}>Full posting</summary>
            <div style={{ ...small, whiteSpace: "pre-wrap", lineHeight: 1.6, marginTop: 8 }}>{props.posting.descriptionText}</div>
          </details>
        </div>
      </aside>

      <div style={{ display: "grid", gap: 20, alignContent: "start" }}>
      <div className="form-card" style={{ display: "grid", gap: 12 }} data-testid="tailor-start">
        <Eyebrow index="00">{doc ? "Start another version" : "Start this job's résumé"}</Eyebrow>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run(() => startFromMaster(props.postingId), open)}>
              Use master as is
            </Button>
            <span style={{ ...small, color: "var(--text-muted)" }}>No changes. Fine when the posting fits your résumé already.</span>
          </div>
          {props.reusable.length > 0 && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <select aria-label="Version to reuse" value={reuseId} onChange={(e) => setReuseId(e.target.value)} style={{ ...box, width: "auto", maxWidth: "100%" }}>
                {props.reusable.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                    {v.sent ? " (sent)" : ""} · {Math.round(v.similarity * 100)}% similar
                  </option>
                ))}
              </select>
              <Button type="button" variant="secondary" size="sm" disabled={pending || !reuseId} onClick={() => run(() => reuseTailoredVersion(props.postingId, reuseId), open)}>
                Reuse this version
              </Button>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Button type="button" variant="primary" size="sm" disabled={pending || !props.hasApiKey} title={props.hasApiKey ? "" : "Set ANTHROPIC_API_KEY to enable"} onClick={() => generate("claude")}>
              {pending ? "Working…" : "Tailor with Claude"}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => generate("quick")}>
              Quick tailor (no AI)
            </Button>
            <span style={{ ...small, color: "var(--text-muted)" }}>Uses the evaluation&apos;s tailoring plan when there is one.</span>
          </div>
        </div>
        <span style={{ ...small, color: "var(--text-muted)" }}>Each start makes a new version; earlier ones are kept. Your contact details never leave the app.</span>
        <ActionMessage error={error} note={note} />
      </div>

      {!doc ? (
        <div className="empty-state">No version for this job yet. Pick a starting point above.</div>
      ) : (
        <>
          <div
            className="form-card"
            style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", position: "sticky", top: 0, zIndex: 2 }}
          >
            <Badge tone={blocking ? "critical" : "positive"}>{blocking ? "Has must-fix issues" : "Ready to export"}</Badge>
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
              v{props.version} · {ORIGIN_LABEL[doc.generatedBy] ?? doc.generatedBy}
              {isSent ? " · sent with your application (locked)" : ""}
              {dirty ? " · unsaved changes" : ""}
            </span>
            <span style={{ flex: 1 }} />
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={pending || !dirty || isSent}
              onClick={() =>
                run(() => saveTailoredVersion(props.postingId, props.versionId!, doc), (r) => {
                  setDirty(false);
                  router.push(`/jobs/${props.postingId}/tailor?v=${r.id}`);
                })
              }
            >
              Save as new version
            </Button>
            <Button href={`/jobs/${props.postingId}/tailor/preview?v=${props.versionId}`} variant="secondary" size="sm" aria-disabled={blocking || dirty}>
              Preview PDF
            </Button>
            {!isSent && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending || blocking || dirty}
                title="Record that you applied with this exact version"
                onClick={() => run(() => markAppliedWithVersion(props.postingId, props.versionId!))}
              >
                I applied with this version
              </Button>
            )}
          </div>

          {doc.rationale && <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{doc.rationale}</p>}

          <div className="form-card" style={{ display: "grid", gap: 12 }}>
            <Eyebrow index="01">Headline & summary</Eyebrow>
            <select
              aria-label="Headline"
              value={doc.headline}
              disabled={isSent}
              onChange={(e) => update((d) => ({ ...d, headline: e.target.value }))}
              style={box}
            >
              {[props.master.headline, ...props.master.headlineOptions].map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
            <textarea aria-label="Summary" rows={4} value={doc.summary} disabled={isSent} onChange={(e) => update((d) => ({ ...d, summary: e.target.value }))} style={box} />
            <Issues where="summary" />
            <details style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
              <summary>Master summary</summary>
              {props.master.summary}
            </details>
          </div>

          {props.master.experience.map((role) => {
            const r = doc.experience.find((x) => x.id === role.id) ?? { id: role.id, bullets: [] };
            const unused = role.bullets.filter((b) => !r.bullets.some((x) => x.id === b.id));
            return (
              <div key={role.id} className="form-card" style={{ display: "grid", gap: 10 }} data-testid={`role-${role.id}`}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 600, flex: 1, textDecoration: r.omitted ? "line-through" : "none", opacity: r.omitted ? 0.55 : 1 }}>
                    {role.title}, {role.organization}
                  </div>
                  {!isSent && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setOmitted(role.id, !r.omitted)}>
                      {r.omitted ? "Include role" : "Leave out"}
                    </Button>
                  )}
                </div>
                {r.omitted && (
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
                    Left out of this version.
                    {(gaps.get(role.id) ?? []).map((g) => (
                      <div key={g} style={{ color: "var(--caution)" }}>
                        Leaves a gap in your history, {g}. Expect a question about it, or keep the role as a header line.
                      </div>
                    ))}
                  </div>
                )}
                {!r.omitted && r.bullets.length === 0 && <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>Header only (no bullets).</div>}
                {!r.omitted && r.bullets.map((b, idx) => {
                  const original = masterText.get(b.id) ?? "";
                  const changed = b.text !== original;
                  const key = `${role.id}:${b.id}`;
                  return (
                    <div
                      key={b.id}
                      id={`bullet-${b.id}`}
                      data-focused={focused.has(b.id) || undefined}
                      style={{
                        display: "grid",
                        gap: 6,
                        padding: "10px 12px",
                        border: focused.has(b.id) ? "2px solid var(--positive)" : "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-md)",
                        opacity: b.status === "rejected" ? 0.55 : 1,
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <Badge tone={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status]}</Badge>
                        {changed && <Badge tone="accent">Reworded</Badge>}
                        <span style={{ flex: 1 }} />
                        {!isSent && (
                          <>
                            <button type="button" aria-label="Move up" onClick={() => moveBullet(role.id, idx, -1)} disabled={idx === 0}>
                              ↑
                            </button>
                            <button type="button" aria-label="Move down" onClick={() => moveBullet(role.id, idx, 1)} disabled={idx === r.bullets.length - 1}>
                              ↓
                            </button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setBullet(role.id, b.id, { status: "accepted" })}>
                              Accept
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setBullet(role.id, b.id, { status: "rejected" })}>
                              Reject
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(editing === key ? null : key)}>
                              {editing === key ? "Done" : "Edit"}
                            </Button>
                            {changed && (
                              <Button type="button" variant="ghost" size="sm" onClick={() => setBullet(role.id, b.id, { text: original, status: "accepted" })}>
                                Use original
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                      {editing === key ? (
                        <textarea
                          aria-label={`Edit ${b.id}`}
                          rows={3}
                          value={b.text}
                          onChange={(e) => setBullet(role.id, b.id, { text: e.target.value, status: "edited" })}
                          style={box}
                        />
                      ) : (
                        <div style={{ fontSize: "var(--text-sm)", textDecoration: b.status === "rejected" ? "line-through" : "none" }}>{b.text}</div>
                      )}
                      {changed && <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>Original: {original}</div>}
                      {reqsByBullet.has(b.id) && (
                        <div style={{ fontSize: "var(--text-sm)", color: "var(--positive)" }}>Answers: {reqsByBullet.get(b.id)!.join("; ")}</div>
                      )}
                      <Issues where={`bullet:${b.id}`} />
                    </div>
                  );
                })}
                {!isSent && !r.omitted && unused.length > 0 && (
                  <details style={{ fontSize: "var(--text-sm)" }}>
                    <summary style={{ cursor: "pointer", color: "var(--text-secondary)" }}>{unused.length} more from master</summary>
                    <ul style={{ margin: "8px 0 0", paddingLeft: 0, listStyle: "none", display: "grid", gap: 6 }}>
                      {unused.map((b) => (
                        <li key={b.id} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                          <Button type="button" variant="ghost" size="sm" onClick={() => addBullet(role.id, b.id)}>
                            Add
                          </Button>
                          <span style={{ color: "var(--text-secondary)" }}>
                            {b.reserve ? "(reserve) " : ""}
                            {b.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            );
          })}

          <div className="form-card" style={{ display: "grid", gap: 10 }}>
            <Eyebrow index="03">Cover note</Eyebrow>
            <textarea aria-label="Cover note" rows={6} value={doc.coverNote} disabled={isSent} onChange={(e) => update((d) => ({ ...d, coverNote: e.target.value }))} style={box} />
            <Issues where="coverNote" />
          </div>
        </>
      )}
      </div>
    </div>
  );
}
