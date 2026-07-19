import Link from "next/link";
import { StatusBadge } from "./StatusBadge";
import { Button } from "@/components/platform/ds";
import { deriveDisplayStatus } from "@/lib/invoice-status";
import { formatCents } from "@/lib/money";
import { formatDateShort } from "@/lib/dates";

export type InvoiceRow = {
  id: string;
  number: string;
  clientName: string;
  /** When set, the client name links to the client detail page. */
  clientId?: string;
  status: string;
  issueDate: Date;
  dueDate: Date;
  totalCents: number;
};

export function InvoiceTable({ invoices }: { invoices: InvoiceRow[] }) {
  if (invoices.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-title">No invoices here yet</p>
        <p>Draft an invoice, send it, and track it through paid — all from this list.</p>
        <div className="empty-actions">
          <Button href="/invoices/new" variant="primary" size="sm">
            New invoice
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="table-scroll">
    <table className="data-table">
      <thead>
        <tr>
          <th>Number</th>
          <th>Client</th>
          <th>Status</th>
          <th>Issued</th>
          <th>Due</th>
          <th className="num">Total</th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((inv) => (
          <tr key={inv.id}>
            <td>
              <Link href={`/invoices/${inv.id}`}>{inv.number}</Link>
            </td>
            <td>
              {inv.clientId ? (
                <Link href={`/clients/${inv.clientId}`}>{inv.clientName}</Link>
              ) : (
                inv.clientName
              )}
            </td>
            <td>
              <StatusBadge status={deriveDisplayStatus(inv)} />
            </td>
            <td>{formatDateShort(inv.issueDate)}</td>
            <td>{formatDateShort(inv.dueDate)}</td>
            <td className="num">{formatCents(inv.totalCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
