import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/lib/db";
import { resumeSchema, type Resume } from "@/lib/jobs/resume-schema";
import { maxResumePages, type Lane } from "@/lib/jobs/scoring-config";
import { applyTrims, checkDocStyle, checkTruth, hasBlocking, renderResume, trimPlan, type TailoredDoc } from "@/lib/jobs/tailor";
import { ResumePdf } from "./ResumePdf";

/** "Lastname_Firstname_Company_Role.pdf", filesystem-safe. */
export function resumeFilename(r: Resume, company: string, role: string): string {
  const part = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  return `${[r.contact.lastName, r.contact.firstName, company, role].map(part).filter(Boolean).join("_")}.pdf`;
}

/** Page count of a rendered PDF (react-pdf writes one /Type /Page object per page). */
export function pdfPageCount(buffer: Buffer): number {
  return (buffer.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
}

export class ResumeExportBlockedError extends Error {}

export async function renderTailoredPdf(tailoredId: string): Promise<{ buffer: Buffer; filename: string; pages: number; maxPages: number }> {
  const t = await db.tailoredResume.findUniqueOrThrow({
    where: { id: tailoredId },
    include: { master: true, posting: { include: { company: { select: { name: true } } } } },
  });
  const master = resumeSchema.parse(t.master.data) as Resume;
  const doc = t.data as unknown as TailoredDoc;
  // The same checks the editor shows: a version with must-fix issues never exports.
  if (hasBlocking(checkTruth(master, doc), checkDocStyle(master, doc))) {
    throw new ResumeExportBlockedError("This version has must-fix issues.");
  }
  const resume = renderResume(master, doc);
  const buffer = await renderToBuffer(<ResumePdf resume={resume} />);
  return {
    buffer,
    filename: resumeFilename(resume, t.posting.company.name, t.posting.title),
    pages: pdfPageCount(buffer),
    maxPages: maxResumePages(t.posting.lane as Lane),
  };
}

/** Render a document (saved or not) and count its pages. */
export async function renderDocPdf(master: Resume, doc: TailoredDoc): Promise<{ buffer: Buffer; pages: number }> {
  const buffer = await renderToBuffer(<ResumePdf resume={renderResume(master, doc)} />);
  return { buffer, pages: pdfPageCount(buffer) };
}

/**
 * Trim a version until its PDF fits maxPages, following trimPlan's order, with
 * as few cuts as possible (binary search over how many of the planned cuts to
 * make: a handful of renders). Cut bullets are marked rejected, so the owner
 * can bring any back. When even every planned cut isn't enough, all are made
 * and the result says so.
 */
export async function fitDocToPages(
  master: Resume,
  doc: TailoredDoc,
  maxPages: number
): Promise<{ doc: TailoredDoc; pages: number; bulletsCut: number; skillLinesHidden: number; fits: boolean }> {
  const start = await renderDocPdf(master, doc);
  if (start.pages <= maxPages) return { doc, pages: start.pages, bulletsCut: 0, skillLinesHidden: 0, fits: true };
  const ops = trimPlan(master, doc);
  let lo = 1;
  let hi = ops.length;
  let best: { k: number; pages: number } | null = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const { pages } = await renderDocPdf(master, applyTrims(doc, ops.slice(0, mid)));
    if (pages <= maxPages) {
      best = { k: mid, pages };
      hi = mid - 1;
    } else lo = mid + 1;
  }
  const k = best?.k ?? ops.length;
  const used = ops.slice(0, k);
  const trimmed = applyTrims(doc, used);
  const pages = best?.pages ?? (await renderDocPdf(master, trimmed)).pages;
  const shownBefore = doc.skillGroupsShown ?? master.skills.length;
  return {
    doc: trimmed,
    pages,
    bulletsCut: used.filter((o) => o.kind === "bullet").length,
    skillLinesHidden: shownBefore - (trimmed.skillGroupsShown ?? shownBefore),
    fits: pages <= maxPages,
  };
}
