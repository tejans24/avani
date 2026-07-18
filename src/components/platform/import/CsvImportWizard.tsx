"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { parseCsv, detectColumns, parseCsvDate } from "@/lib/csv";
import { dollarsToCents } from "@/lib/money";
import { importCsvRows } from "@/actions/import-csv";
import { Button, Callout } from "@/components/platform/ds";
import { ColumnMapper, type ColumnMapping } from "./ColumnMapper";
import { PreviewTable, type PreviewRow } from "./PreviewTable";

/**
 * Three-step CSV import wizard: upload -> map columns -> preview & import.
 *
 * SIGN CONTRACT: the wizard sign-normalizes amounts to the business
 * perspective (+ money in, - money out) BEFORE submitting — when "amounts are
 * charges" is on (Amex-style), signs are flipped, mirroring
 * src/lib/transactions.ts normalizeCsvAmount. The server action
 * (importCsvRows) stores amounts exactly as submitted and applies nothing
 * further to signs. The same normalized value drives the preview display.
 */

/**
 * Parse a CSV amount cell into signed cents. dollarsToCents rejects
 * negatives, so a leading minus is stripped first and re-applied after.
 */
function parseAmountCents(raw: string): number | null {
  let s = raw.trim();
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  const cents = dollarsToCents(s);
  if (cents === null) return null;
  return negative ? -cents : cents;
}

/**
 * Sign flip into the business convention. Mirrors normalizeCsvAmount in
 * src/lib/transactions.ts (kept in sync; not imported because that module
 * pulls in node:crypto, which can't ship in a client bundle).
 */
function normalizeAmount(csvCents: number, amountsAreCharges: boolean): number {
  if (!amountsAreCharges) return csvCents;
  return csvCents === 0 ? 0 : -csvCents;
}

type Step = "upload" | "map" | "preview" | "done";

const hintStyle: React.CSSProperties = {
  margin: "8px 0 0",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-sm)",
  color: "var(--ink-soft)",
};

export function CsvImportWizard({
  account,
}: {
  account: { id: string; name: string; amountsAreCharges: boolean };
}) {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [amountsAreCharges, setAmountsAreCharges] = useState(account.amountsAreCharges);
  const [skipFirstRow, setSkipFirstRow] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    const reader = new FileReader();
    reader.onerror = () => setUploadError("Couldn't read the file. Try again.");
    reader.onload = () => {
      const rows = parseCsv(String(reader.result ?? ""));
      if (rows.length === 0) {
        setUploadError("The file is empty or couldn't be parsed as CSV.");
        return;
      }
      const detected = detectColumns(rows[0]);
      const foundAny =
        detected.date !== undefined ||
        detected.description !== undefined ||
        detected.amount !== undefined;
      setFileName(file.name);
      setRawRows(rows);
      setMapping(detected);
      setSkipFirstRow(foundAny);
      setStep("map");
    };
    reader.readAsText(file);
  };

  const dataRows = useMemo(
    () => (skipFirstRow ? rawRows.slice(1) : rawRows),
    [rawRows, skipFirstRow]
  );

  const mappingComplete =
    mapping.date !== undefined &&
    mapping.description !== undefined &&
    mapping.amount !== undefined;

  const previewRows: PreviewRow[] = useMemo(() => {
    if (!mappingComplete) return [];
    return dataRows.map((cells, index) => {
      const dateCell = cells[mapping.date!] ?? "";
      const descriptionCell = (cells[mapping.description!] ?? "").trim();
      const amountCell = cells[mapping.amount!] ?? "";

      const dateIso = parseCsvDate(dateCell);
      const rawCents = parseAmountCents(amountCell);

      let invalidReason: string | null = null;
      if (dateIso === null) invalidReason = `Invalid date "${dateCell.trim()}"`;
      else if (rawCents === null) invalidReason = `Invalid amount "${amountCell.trim()}"`;
      else if (descriptionCell === "") invalidReason = "Missing description";

      return {
        index,
        dateIso,
        description: descriptionCell,
        signedCents:
          rawCents === null ? null : normalizeAmount(rawCents, amountsAreCharges),
        invalidReason,
      };
    });
  }, [dataRows, mapping, mappingComplete, amountsAreCharges]);

  const validRows = previewRows.filter((r) => r.invalidReason === null);

  const onImport = () => {
    setImportError(null);
    startTransition(async () => {
      const res = await importCsvRows({
        accountId: account.id,
        rows: validRows.map((r) => ({
          dateIso: r.dateIso!,
          amountCents: r.signedCents!,
          description: r.description,
        })),
      });
      // `=== false` (not `else`) so the union narrows under strict:false.
      if (res.ok === false) {
        setImportError(res.error);
        return;
      }
      setResult({ imported: res.imported, skipped: res.skipped });
      setStep("done");
    });
  };

  if (step === "done" && result) {
    return (
      <div className="form-card">
        <Callout tone={result.imported > 0 ? "brand" : "muted"}>
          Imported {result.imported} transaction{result.imported === 1 ? "" : "s"}, skipped{" "}
          {result.skipped} duplicate{result.skipped === 1 ? "" : "s"}.
        </Callout>
        <div className="form-actions">
          <Button href="/accounts" variant="ghost">
            Back to accounts
          </Button>
          <Button href={`/transactions?account=${account.id}`} variant="primary">
            View transactions
          </Button>
        </div>
      </div>
    );
  }

  if (step === "upload") {
    return (
      <div className="form-card">
        <label
          htmlFor="csv-file"
          style={{
            display: "block",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
            fontWeight: "var(--weight-medium)" as React.CSSProperties["fontWeight"],
            color: "var(--ink)",
            marginBottom: 8,
          }}
        >
          CSV file
        </label>
        <input id="csv-file" type="file" accept=".csv,text/csv" onChange={onFileChange} />
        <p style={hintStyle}>
          Export transactions from your bank or card as CSV, then upload the file here.
        </p>
        {uploadError && (
          <p role="alert" style={{ ...hintStyle, color: "var(--critical)" }}>
            {uploadError}
          </p>
        )}
      </div>
    );
  }

  if (step === "map") {
    return (
      <div className="form-card">
        <ColumnMapper
          headerRow={rawRows[0] ?? []}
          mapping={mapping}
          onMappingChange={setMapping}
          amountsAreCharges={amountsAreCharges}
          onAmountsAreChargesChange={setAmountsAreCharges}
          skipFirstRow={skipFirstRow}
          onSkipFirstRowChange={setSkipFirstRow}
        />
        <p style={hintStyle}>
          {fileName} — {rawRows.length} row{rawRows.length === 1 ? "" : "s"} in file.
        </p>
        <div className="form-actions">
          <Button type="button" variant="ghost" onClick={() => setStep("upload")}>
            Back
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!mappingComplete || dataRows.length === 0}
            onClick={() => setStep("preview")}
          >
            Continue to preview
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="form-card">
      <PreviewTable rows={previewRows} />
      <p style={hintStyle} data-testid="import-summary">
        {validRows.length} of {previewRows.length} rows will import.
      </p>
      {importError && (
        <p role="alert" style={{ ...hintStyle, color: "var(--critical)" }}>
          {importError}
        </p>
      )}
      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={() => setStep("map")} disabled={pending}>
          Back
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={onImport}
          disabled={pending || validRows.length === 0}
        >
          {pending
            ? "Importing…"
            : `Import ${validRows.length} transaction${validRows.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}
