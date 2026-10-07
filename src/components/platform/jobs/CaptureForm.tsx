"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { captureJob, fetchCaptureDraft, fillCaptureWithClaude, previewCapture } from "@/actions/jobs";
import { Button, Eyebrow } from "@/components/platform/ds";
import { Field, Input, Textarea } from "@/components/form/shared";
import type { CaptureDraft, CapturePayload } from "@/lib/jobs/capture";
import { ActionMessage, useAction } from "./useAction";

type Via = "bookmarklet" | "share" | "shortcut" | "paste";

const URL_IN_TEXT = /https?:\/\/[^\s<>"]+/i;

/**
 * Add a job from your own browser, for sites that block server fetching.
 * Entry points: the bookmarklet (opens this page and hands it the page data
 * in the URL fragment), the Android share target / iOS Shortcut (?url=&title=&text=),
 * or paste. Nothing saves until "Save job".
 */
export function CaptureForm({
  initial,
  aiEnabled,
}: {
  initial: { url?: string; title?: string; text?: string; via?: string };
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const { pending, error, run } = useAction();
  const [status, setStatus] = useState<string | null>(null);
  const [via, setVia] = useState<Via>(
    initial.via === "bookmarklet" ? "bookmarklet" : initial.via === "shortcut" ? "shortcut" : initial.url || initial.text ? "share" : "paste"
  );
  const [url, setUrl] = useState(initial.url ?? initial.text?.match(URL_IN_TEXT)?.[0] ?? "");
  const [paste, setPaste] = useState("");
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [form, setForm] = useState({ title: "", companyName: "", location: "", workMode: "", postedOn: "", compMin: "", compMax: "", descriptionText: "" });
  // Fields the owner has typed in: Claude never overwrites them.
  const touched = useRef(new Set<string>());
  const jsonLdRef = useRef<unknown[] | undefined>(undefined);
  const pageRef = useRef<{ pageTitle?: string; text: string }>({ text: "" });
  const [aiBusy, setAiBusy] = useState(false);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);

  const fillWithClaude = async () => {
    setAiBusy(true);
    setAiWarnings([]);
    setStatus("Reading the page with Claude…");
    const r = await fillCaptureWithClaude(pageRef.current);
    setAiBusy(false);
    if ("error" in r) {
      setStatus(r.error);
      return;
    }
    const f = r.fields;
    const pick = (k: string, fromClaude: string, prev: string) => (touched.current.has(k) || !fromClaude ? prev : fromClaude);
    setForm((prev) => ({
      title: pick("title", f.title, prev.title),
      companyName: pick("companyName", f.companyName, prev.companyName),
      location: pick("location", f.location || (f.workMode === "REMOTE" ? "Remote" : ""), prev.location),
      workMode: pick("workMode", f.workMode === "UNKNOWN" ? "" : f.workMode, prev.workMode),
      postedOn: pick("postedOn", /^\d{4}-\d{2}-\d{2}$/.test(f.postedOn) ? f.postedOn : "", prev.postedOn),
      compMin: pick("compMin", f.payMin ? String(Math.round(f.payMin)) : "", prev.compMin),
      compMax: pick("compMax", f.payMax ? String(Math.round(f.payMax)) : "", prev.compMax),
      descriptionText: pick("descriptionText", f.descriptionText, prev.descriptionText),
    }));
    setAiWarnings(r.warnings);
    setStatus("Filled by Claude from the page. Check every field, then save.");
  };

  const applyPayload = async (payload: CapturePayload) => {
    jsonLdRef.current = payload.jsonLd;
    pageRef.current = { pageTitle: payload.pageTitle, text: payload.text ?? "" };
    const d = await previewCapture(payload);
    setDraft(d);
    setUrl(d.url);
    setForm({
      title: d.title ?? "",
      companyName: d.companyName ?? "",
      location: d.location ?? (d.remote ? "Remote" : ""),
      workMode: "",
      postedOn: d.postedAt ? new Date(d.postedAt).toISOString().slice(0, 10) : "",
      compMin: d.compMinCents ? String(Math.round(d.compMinCents / 100)) : "",
      compMax: d.compMaxCents ? String(Math.round(d.compMaxCents / 100)) : "",
      descriptionText: d.descriptionText,
    });
  };

  // Claude reads every posting (once, right away): even pages with structured
  // job data often leave out the pay or bury it in the text ("program budget").
  // The app's own reading is the instant first draft and the fallback. The
  // button stays for retries; fields you've edited are never overwritten.
  const autoFilled = useRef(false);
  useEffect(() => {
    if (!draft || !aiEnabled || autoFilled.current) return;
    if (pageRef.current.text.trim().length < 40) return;
    autoFilled.current = true;
    void fillWithClaude();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, aiEnabled]);

  // Bookmarklet: the page data arrives in the URL fragment (#d=…), which is
  // never sent to a server and doesn't depend on window.opener (job sites
  // with Cross-Origin-Opener-Policy, like Phenom-hosted careers sites, sever
  // it). Read it once, then clear it from the address bar.
  const bookmarkletRead = useRef(false);
  useEffect(() => {
    // Once only: dev-mode effects run twice, and the fragment is cleared on the first read.
    if (initial.via !== "bookmarklet" || bookmarkletRead.current) return;
    bookmarkletRead.current = true;
    const hash = window.location.hash;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (!hash.startsWith("#d=")) {
      setStatus("The job page's data didn't come through. Paste the job text below instead.");
      setVia("paste");
      return;
    }
    try {
      const payload = JSON.parse(decodeURIComponent(hash.slice(3))) as CapturePayload;
      setStatus("Got the page. Check the details, then save.");
      void applyPayload(payload);
    } catch {
      setStatus("The job page's data was cut off. Paste the job text below instead.");
      setVia("paste");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shared or Shortcut-opened link: try fetching it server-side first.
  useEffect(() => {
    if (initial.via === "bookmarklet" || !url || draft) return;
    setStatus("Reading the page…");
    void fetchCaptureDraft(url).then(async (r) => {
      if ("error" in r) {
        setStatus(r.error);
        return;
      }
      await applyPayload({ ...r.payload, pageTitle: r.payload.pageTitle ?? initial.title });
      setStatus("Read the page. Check the details, then save.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    touched.current.add(k);
    setForm({ ...form, [k]: e.target.value });
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {!draft && (
        <div className="form-card" style={{ display: "grid", gap: 14 }}>
          <Eyebrow index="01">The job</Eyebrow>
          <Field label="Link to the posting" htmlFor="cap-url">
            <Input id="cap-url" value={url} placeholder="https://…" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)} />
          </Field>
          <Field label="Job text" htmlFor="cap-paste" hint="Select all on the job page and paste here if the site blocks reading it.">
            <Textarea id="cap-paste" rows={8} value={paste} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPaste(e.target.value)} />
          </Field>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={pending || !url}
              onClick={() => {
                setVia(via === "share" || via === "shortcut" ? via : "paste");
                if (paste.trim()) void applyPayload({ url, text: paste });
                else
                  void fetchCaptureDraft(url).then((r) => ("error" in r ? setStatus(r.error) : applyPayload(r.payload)));
              }}
            >
              {paste.trim() ? "Use this text" : "Read the page"}
            </Button>
            {status && <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{status}</span>}
          </div>
        </div>
      )}

      {draft && (
        <div className="form-card" style={{ display: "grid", gap: 14 }}>
          <Eyebrow index="02">Check, then save</Eyebrow>
          {status && <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{status}</span>}
          {(draft.missing.length > 0 || (aiEnabled && pageRef.current.text.trim().length >= 40)) && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {draft.missing.length > 0 && (
                <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--caution)" }}>
                  The page didn&apos;t say: {draft.missing.map((m) => ({ title: "title", companyName: "company", location: "location", descriptionText: "description" })[m]).join(", ")}.
                  {aiEnabled ? " Claude reads the page to fill them; check the result." : " Fill those in, or set ANTHROPIC_API_KEY to have Claude read the page."}
                </p>
              )}
              {/* Always on offer: the app's own reading is free and instant but can guess wrong on an odd page. */}
              {aiEnabled && pageRef.current.text.trim().length >= 40 && (
                <Button type="button" variant="secondary" size="sm" disabled={aiBusy} onClick={fillWithClaude}>
                  {aiBusy ? "Reading…" : draft.missing.length > 0 ? "Read again with Claude" : "Read with Claude instead"}
                </Button>
              )}
            </div>
          )}
          {draft.guessed.length > 0 && (
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
              No job data on the page, so {draft.guessed.map((m) => ({ title: "title", companyName: "company", location: "location" })[m]).join(", ")}{" "}
              {draft.guessed.length === 1 ? "was" : "were"} taken from the page heading, title and address. Check{" "}
              {draft.guessed.length === 1 ? "it" : "them"}.
            </p>
          )}
          {draft.questions.length > 0 && (
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }} data-testid="form-questions">
              Found {draft.questions.length} application question{draft.questions.length === 1 ? "" : "s"} on the page. They&apos;ll be saved to this
              job&apos;s Application answers, with your contact details filled in by the app.
            </p>
          )}
          {aiWarnings.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--text-sm)", color: "var(--caution)" }}>
              {aiWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <div className="form-grid">
            <Field label="Title" htmlFor="cap-title">
              <Input id="cap-title" value={form.title} onChange={set("title")} />
            </Field>
            <Field label="Company" htmlFor="cap-company">
              <Input id="cap-company" value={form.companyName} onChange={set("companyName")} />
            </Field>
            <Field label="Location" htmlFor="cap-location" hint="Use “Remote” for remote roles.">
              <Input id="cap-location" value={form.location} onChange={set("location")} />
            </Field>
            <Field label="Work mode" htmlFor="cap-work-mode" hint="From the page; you can change it later on the job page.">
              <select id="cap-work-mode" value={form.workMode} onChange={set("workMode")} style={{ font: "inherit", padding: "8px 10px", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", background: "var(--color-surface)", width: "100%" }}>
                <option value="">Read it from the text</option>
                <option value="REMOTE">Remote</option>
                <option value="OCCASIONAL_HYBRID">Occasional office days</option>
                <option value="HYBRID">Hybrid (set office days)</option>
                <option value="ONSITE">On-site</option>
              </select>
            </Field>
            <Field label="Posted" htmlFor="cap-posted">
              <Input id="cap-posted" type="date" value={form.postedOn} onChange={set("postedOn")} />
            </Field>
            <Field label="Pay min ($/yr)" htmlFor="cap-min">
              <Input id="cap-min" inputMode="numeric" value={form.compMin} onChange={set("compMin")} />
            </Field>
            <Field label="Pay max ($/yr)" htmlFor="cap-max">
              <Input id="cap-max" inputMode="numeric" value={form.compMax} onChange={set("compMax")} />
            </Field>
            <Field label="Description" htmlFor="cap-desc" className="span-2">
              <Textarea id="cap-desc" rows={10} value={form.descriptionText} onChange={set("descriptionText")} />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Button
              type="button"
              variant="primary"
              size="md"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    captureJob({
                      url,
                      title: form.title,
                      companyName: form.companyName,
                      location: form.location,
                      descriptionText: form.descriptionText,
                      postedOn: form.postedOn,
                      compMin: form.compMin ? Number(form.compMin.replace(/[^\d]/g, "")) || undefined : undefined,
                      compMax: form.compMax ? Number(form.compMax.replace(/[^\d]/g, "")) || undefined : undefined,
                      capturedVia: via,
                      jsonLd: jsonLdRef.current,
                      questions: draft.questions,
                      workMode: (form.workMode || undefined) as "REMOTE" | "OCCASIONAL_HYBRID" | "HYBRID" | "ONSITE" | undefined,
                    }),
                  (r) => router.push(`/jobs/${r.id}${r.note ? "?existing=1" : ""}`)
                )
              }
            >
              Save job
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setDraft(null)}>
              Start over
            </Button>
            <ActionMessage error={error} />
          </div>
        </div>
      )}
    </div>
  );
}
