"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button } from "@/components/platform/ds";

type Info = { filename: string; pages: number; maxPages: number };

const small = { fontSize: "var(--text-sm)" } as const;

/**
 * The exact PDF you'd download, over the editor: close it and keep editing.
 * Shows the saved version (unsaved edits aren't in it, and it says so).
 */
export function PdfPreviewDialog({ versionId, version, unsaved, blocking, primary = false }: { versionId: string; version: number; unsaved: boolean; blocking: boolean; primary?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const src = `/api/jobs/tailored/${versionId}/pdf`;

  useEffect(() => {
    if (!open) return;
    setInfo(null);
    setError(null);
    fetch(`${src}?info=1`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Couldn't make the PDF.");
        setInfo(body as Info);
      })
      .catch((e: Error) => setError(e.message));
  }, [open, src]);

  const show = () => {
    setOpen(true);
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();

  return (
    <>
      <Button type="button" variant={primary ? "primary" : "secondary"} size="sm" disabled={blocking} title={blocking ? "Fix the must-fix issues first" : undefined} onClick={show}>
        Preview PDF
      </Button>
      <dialog ref={dialog} className="pdf-dialog" onClose={() => setOpen(false)} aria-label={`Preview of version ${version}`}>
        <div className="pdf-dialog-head">
          <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <strong style={{ ...small, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{info?.filename ?? `Version ${version}`}</strong>
            <span style={{ ...small, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", color: "var(--text-secondary)" }}>
              {info && (
                <Badge tone={info.pages <= info.maxPages ? "positive" : "caution"}>
                  {info.pages} page{info.pages === 1 ? "" : "s"}
                </Badge>
              )}
              {info && info.pages > info.maxPages && <span>Over your {info.maxPages}-page limit: trim older roles, then save.</span>}
              {unsaved && <span style={{ color: "var(--caution)" }}>Showing v{version} as saved; your unsaved edits aren&apos;t in it.</span>}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <a href={src} target="_blank" rel="noreferrer" style={small}>
              Open in new tab
            </a>
            <Button href={`${src}?download=1`} variant="primary" size="sm" aria-disabled={!info || undefined}>
              Download
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={close} aria-label="Close preview">
              Close
            </Button>
          </div>
        </div>
        {error ? (
          <div className="empty-state" style={{ margin: 16 }}>
            <p className="empty-title">Can&apos;t export yet</p>
            <p>{error}</p>
          </div>
        ) : (
          open && <iframe title="Résumé PDF preview" src={src} className="pdf-dialog-frame" />
        )}
      </dialog>
    </>
  );
}
