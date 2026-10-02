/**
 * Layout of the owner's existing résumé, measured from their Word file
 * (General_Resume.docx). The HTML/CSS PDF template reproduces these values so
 * an exported résumé looks like the one they already send.
 *
 * Units: pt for type, in for page. Word stores half-points (sz) and twips
 * (1/20 pt); converted here. Section order is fixed.
 */
export const RESUME_LAYOUT = {
  page: { size: "Letter", marginTopIn: 0.4, marginBottomIn: 0.4, marginSideIn: 0.5 },
  /** Calibri in Word; the PDF embeds Carlito (metric-compatible, open license). */
  font: { family: ["Calibri", "Carlito", "sans-serif"], bodyPt: 10.5, lineHeight: 1.0 },
  colors: {
    text: "#16181C",
    name: "#0F1B28",
    sectionHeading: "#26405E",
    contactLine: "#3C424B",
    rule: "#26405E",
  },
  name: { sizePt: 26, bold: true, letterSpacingPt: -0.5, spaceAfterPt: 1 },
  /** Headline + contact items joined by "  |  ", with a 1.5pt rule beneath. */
  contactLine: { sizePt: 9.5, separator: "  |  ", ruleWidthPt: 1.5, ruleGapPt: 4, spaceAfterPt: 4 },
  sectionHeading: { sizePt: 9.5, bold: true, uppercase: true, letterSpacingPt: 1.4, spaceBeforePt: 7, spaceAfterPt: 3 },
  /** Skills: bold "Group:" then regular text. */
  skillLine: { spaceAfterPt: 1 },
  /** Role header: bold "Title, Organization, Location", dates right-aligned and muted. */
  roleHeader: { sizePt: 11, bold: true, spaceBeforePt: 7, spaceAfterPt: 1, datesSizePt: 9.5, datesColor: "#3C424B" },
  /** Date ranges use an en dash with spaces ("Mar 2021 – Present"). Never an em dash. */
  dateFormat: { month: "MMM yyyy", rangeSeparator: " – ", present: "Present", multiSeparator: ", " },
  bullet: { spaceAfterPt: 1.5, indentIn: 0.25 },
  sectionOrder: ["summary", "skills", "experience", "clearance", "education", "additional"] as const,
} as const;
