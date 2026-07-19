"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/ds/components/forms/Select";

/**
 * Client dropdown for the global invoices list. Navigates via query param,
 * preserving the current status filter.
 */
export function InvoiceClientFilter({
  clients,
  selected,
  status,
}: {
  clients: { id: string; name: string }[];
  selected: string;
  status: string;
}) {
  const router = useRouter();

  return (
    <div style={{ width: 220, maxWidth: "100%" }}>
      <Select
        aria-label="Filter by client"
        value={selected}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
          const params = new URLSearchParams();
          if (status !== "all") params.set("status", status);
          if (e.target.value) params.set("client", e.target.value);
          const qs = params.toString();
          router.push(qs ? `/invoices?${qs}` : "/invoices");
        }}
      >
        <option value="">All clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
