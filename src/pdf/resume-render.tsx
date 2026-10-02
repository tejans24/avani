import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/lib/db";
import { resumeSchema, type Resume } from "@/lib/jobs/resume-schema";
import { checkDocStyle, checkTruth, hasBlocking, renderResume, type TailoredDoc } from "@/lib/jobs/tailor";
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

export async function renderTailoredPdf(tailoredId: string): Promise<{ buffer: Buffer; filename: string; pages: number }> {
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
  return { buffer, filename: resumeFilename(resume, t.posting.company.name, t.posting.title), pages: pdfPageCount(buffer) };
}
