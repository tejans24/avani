"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { generateTailored, markAppliedWithVersion, saveTailoredVersion } from "@/actions/tailor";
import { Badge, Button, Eyebrow } from "@/components/platform/ds";
import type { Resume } from "@/lib/jobs/resume-schema";
import { checkDocStyle, checkTruth, hasBlocking, omittedRoleGaps, type BulletStatus, type TailoredDoc } from "@/lib/jobs/tailor";
import { ActionMessage, useAction } from "./useAction";

const STATUS_TONE: Record<BulletStatus, string> = { pending: "caution", accepted: "positive", edited: "brand", rejected: "neutral" };
const STATUS_LABEL: Record<BulletStatus, string> = { pending: "Review", accepted: "Accepted", edited: "Edited", rejected: "Rejected" };

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
}) {
  const router = useRouter();
  const { pending, error, note, run } = useAction();
  const [doc, setDoc] = useState<TailoredDoc | null>(props.initial);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
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

  const generate = (mode: "claude" | "quick") =>
    run(() => generateTailored(props.postingId, mode), (r) => router.push(`/jobs/${props.postingId}/tailor?v=${r.id}`));

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="form-card" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Button type="button" variant="primary" size="sm" disabled={pending || !props.hasApiKey} title={props.hasApiKey ? "" : "Set ANTHROPIC_API_KEY to enable"} onClick={() => generate("claude")}>
          {pending ? "Working…" : "Tailor with Claude"}
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => generate("quick")}>
          Quick tailor (no AI)
        </Button>
        <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>Each run makes a new version. Your contact details never leave the app.</span>
        <ActionMessage error={error} note={note} />
      </div>

      {!doc ? (
        <div className="empty-state">No tailored version yet. Start with one of the buttons above.</div>
      ) : (
        <>
          <div
            className="form-card"
            style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", position: "sticky", top: 0, zIndex: 2 }}
          >
            <Badge tone={blocking ? "critical" : "positive"}>{blocking ? "Has must-fix issues" : "Ready to export"}</Badge>
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
              v{props.version} · {doc.generatedBy === "claude" ? "by Claude" : "quick tailor"}
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
                      style={{ display: "grid", gap: 6, padding: "10px 12px", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", opacity: b.status === "rejected" ? 0.55 : 1 }}
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
  );
}
