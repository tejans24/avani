"use client";

import { useEffect, useRef, useState } from "react";
import { Eyebrow } from "@/components/platform/ds";

/**
 * The bookmarklet runs on the job page: it collects the URL, title, visible
 * text, JSON-LD, the <h1>, OpenGraph tags and Phenom's job object, and opens
 * Avani with that data in the URL fragment.
 * (A postMessage hand-off failed on sites that set Cross-Origin-Opener-
 * Policy, which severs window.opener.) Text is capped so the URL stays well
 * inside browser limits; JSON-LD is dropped first if the page is huge.
 */
function bookmarkletFor(origin: string): string {
  const src = `(()=>{const A=${JSON.stringify(origin)};const ld=[...document.querySelectorAll('script[type="application/ld+json"]')].map(s=>{try{return JSON.parse(s.textContent)}catch(e){return null}}).filter(Boolean);const m=n=>{const e=document.querySelector('meta[property="'+n+'"],meta[name="'+n+'"]');return e?e.content:undefined};const h=document.querySelector("h1");let em;try{const j=window.phApp&&phApp.ddo&&phApp.ddo.jobDetail&&phApp.ddo.jobDetail.data&&phApp.ddo.jobDetail.data.job;if(j){em={};for(const k of ["title","companyName","location","cityStateCountry","cityState","city","state","country","description","postedDate","dateCreated","workplaceType","type"])if(typeof j[k]==="string")em[k]=j[k].slice(0,20000)}}catch(e){}const p={url:location.href,pageTitle:document.title,text:(document.body.innerText||"").slice(0,40000),jsonLd:ld,meta:{h1:h?h.innerText.slice(0,300):undefined,ogTitle:m("og:title"),siteName:m("og:site_name")},embedded:em};let s=JSON.stringify(p);if(s.length>300000){p.jsonLd=[];s=JSON.stringify(p)}window.open(A+"/jobs/capture?via=bookmarklet#d="+encodeURIComponent(s),"_blank")})();`;
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
