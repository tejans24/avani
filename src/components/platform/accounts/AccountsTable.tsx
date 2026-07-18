import Link from "next/link";
import { Badge } from "@/components/platform/ds";

export type AccountRow = {
  id: string;
  name: string;
  kind: "BANK" | "CREDIT_CARD";
  institution: string;
  mask: string | null;
  source: "MERCURY_API" | "CSV";
  archived: boolean;
  transactionCount: number;
};

const SOURCE_LABELS: Record<AccountRow["source"], string> = {
  MERCURY_API: "Mercury API",
  CSV: "CSV",
};

/**
 * Accounts list table (server-renderable). The account name links to the CSV
 * import wizard; a separate Edit link opens the edit form.
 */
export function AccountsTable({ accounts }: { accounts: AccountRow[] }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Institution</th>
          <th>Kind</th>
          <th>Number</th>
          <th>Source</th>
          <th className="num">Transactions</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {accounts.map((account) => (
          <tr key={account.id}>
            <td>
              <Link href={`/accounts/${account.id}/import`} title="Import CSV">
                {account.name}
              </Link>
            </td>
            <td>{account.institution}</td>
            <td>
              {account.kind === "BANK" ? (
                <Badge tone="brand">Bank</Badge>
              ) : (
                <Badge tone="accent">Credit card</Badge>
              )}
            </td>
            <td>{account.mask ? `•••• ${account.mask}` : "—"}</td>
            <td>{SOURCE_LABELS[account.source]}</td>
            <td className="num">{account.transactionCount}</td>
            <td>
              {account.archived ? (
                <Badge tone="caution">Archived</Badge>
              ) : (
                <Badge tone="positive">Active</Badge>
              )}
            </td>
            <td>
              <Link href={`/accounts/${account.id}/edit`}>Edit</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
