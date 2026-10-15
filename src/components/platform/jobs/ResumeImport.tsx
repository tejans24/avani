"use client";

import { useState } from "react";
import { importMasterResume } from "@/actions/tailor";
import { Button } from "@/components/platform/ds";
import { ActionMessage, useAction } from "./useAction";

/** Import a new master version from master.json (file or paste). Never edits. */
export function ResumeImport() {
  const { pending, error, note, run } = useAction();
  const [text, setText] = useState("");

  return (
    <div className="form-card" style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 6, fontSize: "var(--text-sm)" }}>
        <span>master.json</span>
        <input
          type="file"
          accept="application/json,.json"
          className="file-input"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setText(await f.text());
          }}
        />
      </label>
      <textarea
        aria-label="Or paste master.json"
        rows={6}
        placeholder="…or paste the JSON here"
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ font: "inherit", fontFamily: "var(--font-mono, monospace)", fontSize: 12, padding: 10, border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }}
      />
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Button type="button" variant="primary" size="sm" disabled={pending || !text.trim()} onClick={() => run(() => importMasterResume(text))}>
          Import as new version
        </Button>
        <ActionMessage error={error} note={note} />
      </div>
    </div>
  );
}
