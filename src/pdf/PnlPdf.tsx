import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { PnlData, PnlRow } from "@/lib/pnl";
import { formatCents } from "@/lib/money";

export type PnlPdfProps = {
  data: PnlData;
  year: number;
  companyName: string;
  reconciliation: { invoicedPaidCents: number; grossReceiptsCents: number };
};

export function renderPnlPdfBuffer(props: PnlPdfProps): Promise<Buffer> {
  return renderToBuffer(<PnlPdf {...props} />);
}

/** Brand hex constants (react-pdf can't read CSS custom properties). */
const INK = "#211F1A";
const INK_SOFT = "#494539";
const INK_MUTED = "#6E6657";
const FOREST = "#28352B";
const SAGE = "#6E8167";
const HAIRLINE = "#E2D9C6";
const BORDER = "#D2C8B4";

const styles = StyleSheet.create({
  page: { padding: 48, fontFamily: "Helvetica", color: INK, fontSize: 9 },
  title: { fontSize: 22, marginBottom: 2 },
  subtitle: { fontSize: 9, color: INK_MUTED, marginBottom: 14 },
  rule: { height: 2, backgroundColor: FOREST, marginBottom: 16 },
  section: {
    fontSize: 7,
    color: SAGE,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 12,
    marginBottom: 4,
  },
  headRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingBottom: 4,
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: HAIRLINE,
    paddingVertical: 3,
  },
  totalRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: FOREST,
    paddingVertical: 4,
    marginTop: 2,
  },
  name: { flex: 3 },
  taxLine: { flex: 1.4, color: INK_MUTED, fontSize: 7 },
  cell: { flex: 1, textAlign: "right" },
  totalCell: { flex: 1.2, textAlign: "right" },
  bold: { fontFamily: "Helvetica-Bold" },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    borderTopWidth: 0.5,
    borderTopColor: HAIRLINE,
    paddingTop: 6,
    fontSize: 7,
    color: INK_MUTED,
    textAlign: "center",
  },
});

const TAX_LINE_SHORT: Record<string, string> = {
  GROSS_RECEIPTS: "1a",
  OFFICER_COMPENSATION: "7",
  SALARIES_WAGES: "8",
  REPAIRS_MAINTENANCE: "9",
  RENTS: "11",
  TAXES_LICENSES: "12",
  INTEREST: "13",
  DEPRECIATION: "14",
  ADVERTISING: "16",
  EMPLOYEE_BENEFITS: "18",
  OTHER_DEDUCTIONS: "19",
  NONE: "",
};

function PdfRow({ row, negate }: { row: PnlRow; negate: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.name}>{row.name}</Text>
      <Text style={styles.taxLine}>
        {TAX_LINE_SHORT[row.taxLine] ? `1120-S ln ${TAX_LINE_SHORT[row.taxLine]}` : ""}
      </Text>
      {row.cells.map((c) => (
        <Text key={c.periodKey} style={styles.cell}>
          {c.cents === 0 ? "—" : formatCents(negate ? -c.cents : c.cents)}
        </Text>
      ))}
      <Text style={[styles.totalCell, styles.bold]}>
        {formatCents(negate ? -row.totalCents : row.totalCents)}
      </Text>
    </View>
  );
}

export function PnlPdf({ data, year, companyName, reconciliation }: PnlPdfProps) {
  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>Profit &amp; Loss — {year}</Text>
        <Text style={styles.subtitle}>
          {companyName} · categorized transactions mapped to Form 1120-S lines ·
          prepared {new Date().toISOString().slice(0, 10)}
        </Text>
        <View style={styles.rule} />

        <View style={styles.headRow}>
          <Text style={[styles.name, styles.bold]}>Category</Text>
          <Text style={styles.taxLine} />
          {data.periods.map((p) => (
            <Text key={p.key} style={[styles.cell, styles.bold]}>
              {p.label}
            </Text>
          ))}
          <Text style={[styles.totalCell, styles.bold]}>Total</Text>
        </View>

        <Text style={styles.section}>Income</Text>
        {data.income.map((r) => (
          <PdfRow key={r.name} row={r} negate={false} />
        ))}

        <Text style={styles.section}>Expenses</Text>
        {data.expenses.map((r) => (
          <PdfRow key={r.name} row={r} negate />
        ))}

        <View style={styles.totalRow}>
          <Text style={[styles.name, styles.bold]}>Net profit</Text>
          <Text style={styles.taxLine} />
          {data.netProfitCells.map((c) => (
            <Text key={c.periodKey} style={[styles.cell, styles.bold]}>
              {formatCents(c.cents)}
            </Text>
          ))}
          <Text style={[styles.totalCell, styles.bold]}>
            {formatCents(data.netProfitCents)}
          </Text>
        </View>

        {data.uncategorized && (
          <>
            <Text style={styles.section}>Needs categorizing</Text>
            <PdfRow row={data.uncategorized} negate={false} />
          </>
        )}

        {data.belowLine.length > 0 && (
          <>
            <Text style={styles.section}>Below the line (owner &amp; transfers)</Text>
            {data.belowLine.map((r) => (
              <PdfRow key={r.name} row={r} negate={false} />
            ))}
          </>
        )}

        <Text style={{ marginTop: 10, fontSize: 7, color: INK_SOFT }}>
          Reconciliation: invoiced &amp; paid {formatCents(reconciliation.invoicedPaidCents)} ·
          gross-receipts deposits {formatCents(reconciliation.grossReceiptsCents)}
        </Text>

        <Text style={styles.footer}>
          Generated by Avani · management report, not a tax filing — review with
          your CPA
        </Text>
      </Page>
    </Document>
  );
}
