import Link from "next/link";
import { StatusBadge } from "./StatusBadge";
import { deriveDisplayStatus } from "@/lib/invoice-status";
import { formatCents } from "@/lib/money";
import { formatDateShort } from "@/lib/dates";

export type InvoiceRow = {
  id: string;
  number: string;
  clientName: string;
  status: string;
  issueDate: Date;
  dueDate: Date;
  totalCents: number;
};

export function InvoiceTable({ invoices }: { invoices: InvoiceRow[] }) {
  if (invoices.length === 0) {
    return <div className="empty-state">No invoices here yet.</div>;
  }
  return (
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
            <td>{inv.clientName}</td>
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
  );
}
