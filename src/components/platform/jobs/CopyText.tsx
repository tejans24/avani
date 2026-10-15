"use client";

import { useState } from "react";
import { Button, Eyebrow } from "@/components/platform/ds";

/** A block of text with a Copy button (cover note on the preview page). */
export function CopyText({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="form-card" style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Eyebrow index="✎">{label}</Eyebrow>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div style={{ whiteSpace: "pre-wrap", fontSize: "var(--text-sm)", lineHeight: 1.6 }}>{text}</div>
    </div>
  );
}
