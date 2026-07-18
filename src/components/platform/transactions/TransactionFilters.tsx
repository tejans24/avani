"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/ds/components/forms/Select";
import { Input } from "@/ds/components/forms/Input";

export type FilterValues = {
  account: string;
  category: string;
  status: string; // "" | "unreviewed" | "reviewed" | "excluded"
  month: string; // "" | "YYYY-MM"
  q: string;
};

type AccountOption = { id: string; name: string };
type CategoryOption = { id: string; name: string };

const STATUS_TABS: [string, string][] = [
  ["", "All"],
  ["unreviewed", "Unreviewed"],
  ["reviewed", "Reviewed"],
  ["excluded", "Excluded"],
];

/** Build a /transactions URL from filter values, dropping empties (and page). */
function hrefFor(values: FilterValues): string {
  const sp = new URLSearchParams();
  if (values.account) sp.set("account", values.account);
  if (values.category) sp.set("category", values.category);
  if (values.status) sp.set("status", values.status);
  if (values.month) sp.set("month", values.month);
  if (values.q) sp.set("q", values.q);
  const qs = sp.toString();
  return qs ? `/transactions?${qs}` : "/transactions";
}

const compactSelect = { padding: "8px 30px 8px 10px", fontSize: "var(--text-sm)" };
const compactInput = { padding: "8px 10px", fontSize: "var(--text-sm)" };

export function TransactionFilters({
  accounts,
  categories,
  values,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  values: FilterValues;
}) {
  const router = useRouter();
  const [account, setAccount] = useState(values.account);
  const [category, setCategory] = useState(values.category);
  const [month, setMonth] = useState(values.month);
  const [q, setQ] = useState(values.q);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = (): FilterValues => ({
    account,
    category,
    status: values.status,
    month,
    q,
  });

  const navigate = (next: Partial<FilterValues>) => {
    router.replace(hrefFor({ ...current(), ...next }));
  };

  const onSearch = (value: string) => {
    setQ(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => navigate({ q: value }), 300);
  };

  return (
    <>
      <div className="filter-tabs">
        {STATUS_TABS.map(([value, label]) => (
          <Link
            key={label}
            href={hrefFor({ ...current(), status: value })}
            data-active={values.status === value || undefined}
          >
            {label}
          </Link>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div style={{ width: 190 }}>
          <Select
            aria-label="Filter by account"
            value={account}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              setAccount(e.target.value);
              navigate({ account: e.target.value });
            }}
            style={compactSelect}
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <div style={{ width: 220 }}>
          <Select
            aria-label="Filter by category"
            value={category}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              setCategory(e.target.value);
              navigate({ category: e.target.value });
            }}
            style={compactSelect}
          >
            <option value="">All categories</option>
            <option value="none">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <Input
          aria-label="Filter by month"
          type="month"
          value={month}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setMonth(e.target.value);
            navigate({ month: e.target.value });
          }}
          style={{ ...compactInput, width: 170 }}
        />
        <Input
          aria-label="Search transactions"
          type="search"
          placeholder="Search description or merchant"
          value={q}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearch(e.target.value)}
          style={{ ...compactInput, width: 250 }}
        />
      </div>
    </>
  );
}
