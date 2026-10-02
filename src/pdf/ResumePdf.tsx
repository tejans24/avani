import path from "node:path";
import React from "react";
import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { RESUME_LAYOUT as L } from "@/lib/jobs/resume-layout";
import type { Resume } from "@/lib/jobs/resume-schema";

/**
 * The owner's résumé layout (measured from their Word file, see
 * resume-layout.ts) rendered with react-pdf. Calibri can't be redistributed,
 * so the PDF embeds Carlito: metric-compatible with Calibri (same widths, so
 * the same line breaks and page count), SIL OFL licensed, and the font the
 * owner's own PDF export already used.
 */

const FONT_DIR = path.join(process.cwd(), "src/pdf/fonts");
let registered = false;
function registerFonts() {
  if (registered) return;
  Font.register({
    family: "Carlito",
    fonts: [
      { src: path.join(FONT_DIR, "carlito-latin-400-normal.woff") },
      { src: path.join(FONT_DIR, "carlito-latin-700-normal.woff"), fontWeight: 700 },
      { src: path.join(FONT_DIR, "carlito-latin-400-italic.woff"), fontStyle: "italic" },
      { src: path.join(FONT_DIR, "carlito-latin-700-italic.woff"), fontWeight: 700, fontStyle: "italic" },
    ],
  });
  // Résumé text must never be hyphenated mid-word.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

const IN = 72;
const s = StyleSheet.create({
  page: {
    fontFamily: "Carlito",
    fontSize: L.font.bodyPt,
    lineHeight: 1.22,
    color: L.colors.text,
    paddingTop: L.page.marginTopIn * IN,
    paddingBottom: L.page.marginBottomIn * IN,
    paddingHorizontal: L.page.marginSideIn * IN,
  },
  name: { fontSize: L.name.sizePt, fontWeight: 700, color: L.colors.name, letterSpacing: L.name.letterSpacingPt, lineHeight: 1.05, marginBottom: L.name.spaceAfterPt },
  contact: {
    fontSize: L.contactLine.sizePt,
    color: L.colors.contactLine,
    paddingBottom: L.contactLine.ruleGapPt,
    borderBottomWidth: L.contactLine.ruleWidthPt,
    borderBottomColor: L.colors.rule,
    marginBottom: L.contactLine.spaceAfterPt,
  },
  heading: {
    fontSize: L.sectionHeading.sizePt,
    fontWeight: 700,
    color: L.colors.sectionHeading,
    letterSpacing: L.sectionHeading.letterSpacingPt,
    textTransform: "uppercase",
    marginTop: L.sectionHeading.spaceBeforePt,
    marginBottom: L.sectionHeading.spaceAfterPt,
  },
  para: { marginBottom: 1 },
  skill: { marginBottom: L.skillLine.spaceAfterPt },
  skillGroup: { fontWeight: 700, color: L.colors.name },
  roleHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: L.roleHeader.spaceBeforePt, marginBottom: L.roleHeader.spaceAfterPt },
  roleTitle: { fontSize: L.roleHeader.sizePt, fontWeight: 700, color: L.colors.name, flexShrink: 1, paddingRight: 8 },
  roleDates: { fontSize: L.roleHeader.datesSizePt, color: L.roleHeader.datesColor, flexShrink: 0 },
  // Word's list: the dot sits slightly in from the margin, text at the 0.25in tab.
  bulletRow: { flexDirection: "row", marginBottom: L.bullet.spaceAfterPt, paddingLeft: 6 },
  bulletDot: { width: L.bullet.indentIn * IN - 6 },
  bulletText: { flex: 1 },
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function month(ym: string | null): string {
  if (!ym) return L.dateFormat.present;
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

/** "Mar 2021 – Mar 2022, Jul 2024 – Present" (en dash, as in the owner's résumé). */
export function formatPeriods(periods: { start: string; end?: string | null }[]): string {
  return periods.map((p) => `${month(p.start)}${L.dateFormat.rangeSeparator}${month(p.end ?? null)}`).join(L.dateFormat.multiSeparator);
}

export function contactLine(r: Resume): string {
  const c = r.contact;
  return [r.headline, c.location, c.phone, c.email, ...c.links.map((l) => l.url.replace(/^https?:\/\//, "")), c.citizenship]
    .filter((x): x is string => Boolean(x && x.trim()))
    .join(L.contactLine.separator);
}

function Bullet({ children }: { children: string }) {
  return (
    <View style={s.bulletRow} wrap={false}>
      <Text style={s.bulletDot}>•</Text>
      <Text style={s.bulletText}>{children}</Text>
    </View>
  );
}

export function ResumePdf({ resume }: { resume: Resume }) {
  registerFonts();
  const r = resume;
  return (
    <Document title={`${r.contact.firstName} ${r.contact.lastName} résumé`} author={`${r.contact.firstName} ${r.contact.lastName}`}>
      <Page size="LETTER" style={s.page}>
        <Text style={s.name}>
          {r.contact.firstName} {r.contact.lastName}
        </Text>
        <Text style={s.contact}>{contactLine(r)}</Text>

        <Text style={s.heading}>Summary</Text>
        <Text style={s.para}>{r.summary}</Text>

        {r.skills.length > 0 && (
          <>
            <Text style={s.heading}>Core Skills</Text>
            {r.skills.map((g) => (
              <Text key={g.group} style={s.skill}>
                <Text style={s.skillGroup}>{g.group}: </Text>
                {g.text}
              </Text>
            ))}
          </>
        )}

        <Text style={s.heading}>Experience</Text>
        {r.experience.map((e) => (
          <View key={e.id}>
            {/* Keep the role header with its first line. */}
            <View wrap={false}>
              <View style={s.roleHeader}>
                <Text style={s.roleTitle}>{[e.title, e.organization, e.location].filter(Boolean).join(", ")}</Text>
                <Text style={s.roleDates}>{formatPeriods(e.periods)}</Text>
              </View>
              {e.intro && <Text style={s.para}>{e.intro}</Text>}
            </View>
            {e.bullets.map((b) => (
              <Bullet key={b.id}>{b.text}</Bullet>
            ))}
          </View>
        ))}

        {r.clearance.length > 0 && (
          <>
            <Text style={s.heading}>Clearance</Text>
            {r.clearance.map((c, i) => (
              <Bullet key={i}>{c}</Bullet>
            ))}
          </>
        )}

        {(r.education.length > 0 || r.additional.length > 0) && (
          <>
            <Text style={s.heading}>Education</Text>
            {r.education.map((e) => (
              <Text key={e.id} style={s.para}>
                {e.text}
              </Text>
            ))}
            {r.additional.map((a, i) => (
              <Text key={i} style={s.para}>
                {a}
              </Text>
            ))}
          </>
        )}
      </Page>
    </Document>
  );
}
