"use client";

import { useEffect, useRef, useState } from "react";
import { Eyebrow } from "@/components/platform/ds";

/** The bookmarklet runs on the job page: collect, open Avani, hand over on "ready". */
function bookmarkletFor(origin: string): string {
  const src = `(()=>{const A=${JSON.stringify(origin)};const ld=[...document.querySelectorAll('script[type="application/ld+json"]')].map(s=>{try{return JSON.parse(s.textContent)}catch(e){return null}}).filter(Boolean);const p={url:location.href,pageTitle:document.title,text:(document.body.innerText||"").slice(0,60000),jsonLd:ld};const w=window.open(A+"/jobs/capture?via=bookmarklet","avani-capture");const h=e=>{if(e.origin===A&&e.data&&e.data.type==="avani-capture-ready"){w.postMessage({type:"avani-capture",payload:p},A);window.removeEventListener("message",h)}};window.addEventListener("message",h)})();`;
  return `javascript:${encodeURIComponent(src)}`;
}

export function CaptureHelpers() {
  const [origin, setOrigin] = useState<string | null>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    setOrigin(window.location.origin);
    // Installability for the Android share target.
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  // Set the javascript: href on the DOM directly; React will refuse it as a prop.
  useEffect(() => {
    if (origin && linkRef.current) linkRef.current.setAttribute("href", bookmarkletFor(origin));
  }, [origin]);

  return (
    <div className="form-card" style={{ display: "grid", gap: 14, fontSize: "var(--text-sm)", lineHeight: 1.6 }}>
      <Eyebrow index="?">Faster ways to add jobs</Eyebrow>
      <div>
        <strong>Desktop:</strong> drag this to your bookmarks bar, then click it on any job page (LinkedIn, Indeed, company sites).{" "}
        {origin && (
          <a
            ref={linkRef}
            onClick={(e) => e.preventDefault()}
            style={{ display: "inline-block", padding: "4px 10px", border: "1px dashed var(--border-default)", borderRadius: "var(--radius-md)", fontWeight: 600 }}
          >
            Add to Avani
          </a>
        )}
        <div style={{ color: "var(--text-muted)" }}>It reads the page in your browser, so sites that block servers still work. Nothing saves until you press Save.</div>
      </div>
      <div>
        <strong>Android:</strong> open Avani in Chrome, menu → <em>Add to Home screen</em> (Install). Then use <em>Share → Avani</em> on any job page.
      </div>
      <div>
        <strong>iPhone:</strong> in the Shortcuts app, create a shortcut that <em>Receives URLs from the Share Sheet</em> and runs{" "}
        <em>Open URLs</em> with <code>{origin ?? "https://your-avani"}/jobs/capture?via=shortcut&amp;url=</code> followed by the Shortcut Input. Name it “Add to Avani”.
        If a site blocks reading the page, you&apos;ll be asked to paste the text.
      </div>
    </div>
  );
}
