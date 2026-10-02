import { readFile } from "node:fs/promises";
import path from "node:path";

import { JOB_FINDER_USER_AGENT } from "@/lib/jobs/robots";
import type { FetchCtx, FetchResult } from "./types";

/**
 * JOBS_SOURCE_MODE=live (default): real requests, one at a time, with a
 * clear user-agent, a timeout, and a pause between requests.
 *
 * JOBS_SOURCE_MODE=fake: reads JSON fixtures from
 * `process.env.JOBS_FIXTURES_DIR ?? e2e/fixtures/jobs`, one file per URL,
 * named by fixtureName(url). Missing file → 404.
 */

const PAUSE_MS = 400;
const TIMEOUT_MS = 20_000;

export function fixtureName(url: string, method = "GET"): string {
  const base = url.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "_").replace(/_+$/, "");
  return `${method === "POST" ? "POST_" : ""}${base}.json`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function liveFetchCtx(now = new Date()): FetchCtx {
  let last = 0;
  return {
    now,
    async fetchJson(url, init) {
      const wait = last + PAUSE_MS - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      try {
        const res = await fetch(url, {
          method: init?.method ?? "GET",
          headers: {
            "User-Agent": `${JOB_FINDER_USER_AGENT}/1.0 (personal job search)`,
            Accept: "application/json",
            ...(init?.body ? { "Content-Type": "application/json" } : {}),
            ...init?.headers,
          },
          body: init?.body ? JSON.stringify(init.body) : undefined,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const text = await res.text();
        let body: unknown = null;
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
        return { status: res.status, body };
      } catch (e) {
        return { status: 0, body: String(e) };
      }
    },
  };
}

export function fakeFetchCtx(now = new Date(), dir = process.env.JOBS_FIXTURES_DIR ?? "e2e/fixtures/jobs"): FetchCtx {
  return {
    now,
    async fetchJson(url, init): Promise<FetchResult> {
      try {
        const text = await readFile(path.join(dir, fixtureName(url, init?.method)), "utf8");
        return { status: 200, body: JSON.parse(text) };
      } catch {
        return { status: 404, body: null };
      }
    },
  };
}

export function sourceFetchCtx(now = new Date()): FetchCtx {
  return process.env.JOBS_SOURCE_MODE === "fake" ? fakeFetchCtx(now) : liveFetchCtx(now);
}

/** In-memory ctx for unit tests: url (or "POST url") → body. */
export function memoryFetchCtx(responses: Record<string, unknown>, now = new Date()): FetchCtx & { calls: string[] } {
  const calls: string[] = [];
  return {
    now,
    calls,
    async fetchJson(url, init) {
      const key = init?.method === "POST" ? `POST ${url}` : url;
      calls.push(key);
      return key in responses ? { status: 200, body: responses[key] } : { status: 404, body: null };
    },
  };
}
