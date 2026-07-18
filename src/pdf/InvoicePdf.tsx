import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatBps, formatCents } from "@/lib/money";
import { formatDateShort } from "@/lib/dates";
import type { InvoicePdfData } from "./types";

/**
 * Avani brand palette (hardcoded — react-pdf cannot read CSS variables).
 */
const colors = {
  ink: "#211F1A",
  inkSoft: "#494539",
  inkMuted: "#6E6657",
  forest: "#28352B",
  sage: "#6E8167",
  clay: "#B0532F",
  bone: "#F4EFE5",
  hairline: "#E2D9C6",
  borderDefault: "#D2C8B4",
  warmWhite: "#FBF8F1",
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: colors.ink,
    backgroundColor: colors.warmWhite,
    paddingTop: 48,
    paddingBottom: 68,
    paddingHorizontal: 48,
  },

  // 1. Header
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  title: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    color: colors.ink,
  },
  invoiceNumber: {
    marginTop: 4,
    fontSize: 10,
    color: colors.inkMuted,
  },
  amountDueBlock: {
    alignItems: "flex-end",
  },
  amountDueLabel: {
    fontSize: 7,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: colors.inkMuted,
  },
  amountDueValue: {
    marginTop: 4,
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: colors.forest,
  },
  headerRule: {
    marginTop: 16,
    borderBottomWidth: 2,
    borderBottomColor: colors.forest,
  },

  // 2. Meta row
  metaRow: {
    flexDirection: "row",
    marginTop: 24,
  },
  metaCol: {
    marginRight: 48,
  },
  metaLabel: {
    fontSize: 7,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: colors.inkMuted,
  },
  metaValue: {
    marginTop: 4,
    fontSize: 10,
    color: colors.ink,
  },

  // 3. From | To
  partiesRow: {
    flexDirection: "row",
    marginTop: 28,
  },
  partyCol: {
    flex: 1,
    paddingRight: 24,
  },
  partyLabel: {
    fontSize: 7,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: colors.sage,
  },
  partyName: {
    marginTop: 6,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: colors.ink,
  },
  partyLine: {
    marginTop: 2,
    fontSize: 9,
    color: colors.inkSoft,
    lineHeight: 1.4,
  },

  // 4. Line items table
  table: {
    marginTop: 28,
  },
  tableHeader: {
    flexDirection: "row",
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDefault,
  },
  tableHeaderCell: {
    fontSize: 7,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: colors.inkMuted,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  tableCell: {
    fontSize: 10,
    color: colors.ink,
  },
  colDescription: { flex: 6, textAlign: "left" },
  colHours: { flex: 1.2, textAlign: "right" },
  colRate: { flex: 1.6, textAlign: "right" },
  colAmount: { flex: 1.8, textAlign: "right" },

  // 5. Totals
  totalsWrap: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 16,
  },
  totalsBlock: {
    width: 220,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalsLabel: {
    fontSize: 10,
    color: colors.inkSoft,
  },
  totalsValue: {
    fontSize: 10,
    color: colors.ink,
  },
  totalsRule: {
    marginVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDefault,
  },
  totalLabel: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: colors.ink,
  },
  totalValue: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: colors.ink,
  },

  // 6/7. Terms + payment instructions
  section: {
    marginTop: 22,
  },
  sectionHeading: {
    fontSize: 7,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: colors.sage,
  },
  sectionBody: {
    marginTop: 6,
    fontSize: 9,
    color: colors.inkSoft,
    lineHeight: 1.5,
  },

  // 8. Footer
  footer: {
    position: "absolute",
    left: 48,
    right: 48,
    bottom: 40,
  },
  footerRule: {
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  footerText: {
    marginTop: 8,
    fontSize: 8,
    color: colors.inkMuted,
    textAlign: "center",
  },
});

function cityLine(parts: {
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}): string {
  const cityState = [parts.city, parts.state].filter(Boolean).join(", ");
  return [cityState, parts.postalCode].filter(Boolean).join(" ");
}

export function InvoicePdf({ data }: { data: InvoicePdfData }) {
  const { from, to } = data;
  const fromCityLine = cityLine(from);
  const toCityLine = cityLine(to);
  const paymentLines = from.paymentInstructions
    .split("\n")
    .map((line) => line.trimEnd());

  return (
    <Document
      title={`Invoice ${data.number}`}
      author={from.companyName}
      producer={from.companyName}
      creator={from.companyName}
    >
      <Page size="LETTER" style={styles.page}>
        {/* 1. Title + amount due */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Invoice</Text>
            <Text style={styles.invoiceNumber}>{data.number}</Text>
          </View>
          <View style={styles.amountDueBlock}>
            <Text style={styles.amountDueLabel}>Amount due</Text>
            <Text style={styles.amountDueValue}>
              {formatCents(data.totalCents)}
            </Text>
          </View>
        </View>
        <View style={styles.headerRule} />

        {/* 2. Meta row */}
        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Invoice date</Text>
            <Text style={styles.metaValue}>
              {formatDateShort(data.issueDate)}
            </Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Due date</Text>
            <Text style={styles.metaValue}>{formatDateShort(data.dueDate)}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Pay via</Text>
            <Text style={styles.metaValue}>{data.payViaLabel}</Text>
          </View>
        </View>

        {/* 3. From | To */}
        <View style={styles.partiesRow}>
          <View style={styles.partyCol}>
            <Text style={styles.partyLabel}>From</Text>
            <Text style={styles.partyName}>{from.companyName}</Text>
            <Text style={styles.partyLine}>{from.addressLine1}</Text>
            {from.addressLine2 ? (
              <Text style={styles.partyLine}>{from.addressLine2}</Text>
            ) : null}
            {fromCityLine ? (
              <Text style={styles.partyLine}>{fromCityLine}</Text>
            ) : null}
            <Text style={styles.partyLine}>{from.country}</Text>
            <Text style={styles.partyLine}>{from.email}</Text>
            {from.phone ? (
              <Text style={styles.partyLine}>{from.phone}</Text>
            ) : null}
          </View>
          <View style={styles.partyCol}>
            <Text style={styles.partyLabel}>To</Text>
            <Text style={styles.partyName}>{to.name}</Text>
            {to.contactName ? (
              <Text style={styles.partyLine}>{to.contactName}</Text>
            ) : null}
            {to.addressLine1 ? (
              <Text style={styles.partyLine}>{to.addressLine1}</Text>
            ) : null}
            {to.addressLine2 ? (
              <Text style={styles.partyLine}>{to.addressLine2}</Text>
            ) : null}
            {toCityLine ? (
              <Text style={styles.partyLine}>{toCityLine}</Text>
            ) : null}
            {to.country ? (
              <Text style={styles.partyLine}>{to.country}</Text>
            ) : null}
            <Text style={styles.partyLine}>{to.billingEmail}</Text>
          </View>
        </View>

        {/* 4. Line items */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colDescription]}>
              Description
            </Text>
            <Text style={[styles.tableHeaderCell, styles.colHours]}>Hours</Text>
            <Text style={[styles.tableHeaderCell, styles.colRate]}>Rate</Text>
            <Text style={[styles.tableHeaderCell, styles.colAmount]}>
              Amount
            </Text>
          </View>
          {data.lineItems.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.colDescription]}>
                {item.description}
              </Text>
              <Text style={[styles.tableCell, styles.colHours]}>
                {item.quantityStr}
              </Text>
              <Text style={[styles.tableCell, styles.colRate]}>
                {formatCents(item.unitPriceCents)}
              </Text>
              <Text style={[styles.tableCell, styles.colAmount]}>
                {formatCents(item.amountCents)}
              </Text>
            </View>
          ))}
        </View>

        {/* 5. Totals */}
        <View style={styles.totalsWrap}>
          <View style={styles.totalsBlock}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>
                {formatCents(data.subtotalCents)}
              </Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>
                {data.taxRateBps > 0
                  ? `Sales tax (${formatBps(data.taxRateBps)})`
                  : "Sales tax"}
              </Text>
              <Text style={styles.totalsValue}>
                {formatCents(data.taxCents)}
              </Text>
            </View>
            <View style={styles.totalsRule} />
            <View style={styles.totalsRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>
                {formatCents(data.totalCents)}
              </Text>
            </View>
          </View>
        </View>

        {/* 6. Terms */}
        {data.memo ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Terms</Text>
            <Text style={styles.sectionBody}>{data.memo}</Text>
          </View>
        ) : null}

        {/* 7. Payment instructions */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Payment instructions</Text>
          <View style={{ marginTop: 6 }}>
            {paymentLines.map((line, i) => (
              <Text key={i} style={[styles.sectionBody, { marginTop: 0 }]}>
                {line === "" ? " " : line}
              </Text>
            ))}
          </View>
        </View>

        {/* 8. Footer */}
        <View style={styles.footer} fixed>
          <View style={styles.footerRule} />
          <Text style={styles.footerText}>
            {from.companyName} · {from.email}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export default InvoicePdf;
