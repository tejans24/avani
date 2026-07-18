import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Mercury bank API client (read-only).
 *
 * MERCURY_MODE=live — the real API:
 *   Base URL:  https://api.mercury.com/api/v1
 *   Auth:      `Authorization: Bearer ${MERCURY_API_KEY}` — a READ-ONLY token,
 *              server-only; never ship it to the client bundle.
 *   GET /accounts
 *     -> { accounts: [...] }
 *   GET /account/{id}/transactions?limit=500&offset=N&start=YYYY-MM-DD
 *     -> { transactions: [...] }
 *     Paginated: keep requesting with offset += limit until a short page
 *     (fewer than `limit` rows) comes back.
 *
 * MERCURY_MODE=fake — reads JSON fixtures from
 * `process.env.MERCURY_FIXTURES_DIR ?? e2e/fixtures/mercury`:
 *   accounts.json                    (array of MercuryAccount)
 *   transactions-<accountId>.json    (array of MercuryTransaction;
 *                                     missing file -> [])
 */

export type MercuryAccount = {
  id: string;
  name: string;
  kind: string;
  accountNumber?: string | null;
};

export type MercuryTransaction = {
  id: string;
  /** Signed DOLLARS from the business's perspective: credit +, debit −. */
  amount: number;
  postedAt: string | null;
  createdAt: string;
  counterpartyName: string | null;
  bankDescription: string | null;
  /** "sent" | "pending" | "cancelled" | "failed" — only "sent" is imported. */
  status: string;
};

const BASE_URL = "https://api.mercury.com/api/v1";
const PAGE_SIZE = 500;

function isFakeMode(): boolean {
  return process.env.MERCURY_MODE === "fake";
}

function fixturesDir(): string {
  return (
    process.env.MERCURY_FIXTURES_DIR ??
    path.join(process.cwd(), "e2e/fixtures/mercury")
  );
}

async function readFixture<T>(file: string, missingFallback?: T): Promise<T> {
  try {
    const raw = await readFile(path.join(fixturesDir(), file), "utf8");
    return JSON.parse(raw) as T;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT" && missingFallback !== undefined) {
      return missingFallback;
    }
    throw new Error(
      `Mercury fixture ${file} could not be read: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }
}

async function mercuryGet<T>(pathname: string): Promise<T> {
  const key = process.env.MERCURY_API_KEY;
  if (!key || key.includes("placeholder")) {
    throw new Error(
      "MERCURY_API_KEY is not configured — set a read-only Mercury API token (or MERCURY_MODE=fake for local dev)."
    );
  }
  const res = await fetch(`${BASE_URL}${pathname}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const snippet = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`Mercury API ${res.status} on ${pathname}: ${snippet}`);
  }
  return (await res.json()) as T;
}

export async function fetchMercuryAccounts(): Promise<MercuryAccount[]> {
  if (isFakeMode()) {
    return readFixture<MercuryAccount[]>("accounts.json");
  }
  const body = await mercuryGet<{ accounts: MercuryAccount[] }>("/accounts");
  return body.accounts;
}

export async function fetchMercuryTransactions(
  accountId: string,
  opts: { start?: string } = {}
): Promise<MercuryTransaction[]> {
  if (isFakeMode()) {
    return readFixture<MercuryTransaction[]>(
      `transactions-${accountId}.json`,
      []
    );
  }
  const all: MercuryTransaction[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (opts.start) params.set("start", opts.start);
    const body = await mercuryGet<{ transactions: MercuryTransaction[] }>(
      `/account/${accountId}/transactions?${params.toString()}`
    );
    all.push(...body.transactions);
    if (body.transactions.length < PAGE_SIZE) break;
  }
  return all;
}
