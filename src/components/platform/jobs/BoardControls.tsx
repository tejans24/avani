"use client";

import { useState } from "react";
import { addJobBoard, deleteJobBoard, refreshJobBoardNow, setJobBoardEnabled } from "@/actions/jobs";
import { Button } from "@/components/platform/ds";
import { Field, Input, Select } from "@/components/form/shared";
import { ActionMessage, useAction } from "./useAction";

export function BoardRowActions({ id, enabled }: { id: string; enabled: boolean }) {
  const { pending, error, note, run } = useAction();
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run(() => refreshJobBoardNow(id))}>
        {pending ? "Fetching…" : "Refresh now"}
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setJobBoardEnabled(id, !enabled))}>
        {enabled ? "Pause" : "Resume"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => window.confirm("Remove this board? Its postings stay.") && run(() => deleteJobBoard(id))}
      >
        Remove
      </Button>
      <ActionMessage error={error} note={note} />
    </div>
  );
}

const HINTS: Record<string, string> = {
  GREENHOUSE: "Board id from boards.greenhouse.io/<id>",
  LEVER: "Site id from jobs.lever.co/<id>",
  ASHBY: "Board id from jobs.ashbyhq.com/<id>",
  SMARTRECRUITERS: "Company id from jobs.smartrecruiters.com/<id>",
  WORKDAY: "tenant/site, e.g. acme/External (verify robots.txt first with npm run jobs:verify-boards)",
  USAJOBS: "Search query, e.g. JobCategoryCode=2210&RemoteIndicator=True",
};

export function AddBoardForm() {
  const { pending, error, note, run } = useAction();
  const [source, setSource] = useState("GREENHOUSE");
  const [slug, setSlug] = useState("");
  const [host, setHost] = useState("");
  const [companyName, setCompanyName] = useState("");

  return (
    <div className="form-card" style={{ display: "grid", gap: 14 }}>
      <div className="form-grid">
        <Field label="Source" htmlFor="board-source">
          <Select id="board-source" value={source} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSource(e.target.value)}>
            {Object.keys(HINTS).map((s) => (
              <option key={s} value={s}>
                {s === "SMARTRECRUITERS" ? "SmartRecruiters" : s === "USAJOBS" ? "USAJOBS" : s[0] + s.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Company" htmlFor="board-company">
          <Input id="board-company" value={companyName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCompanyName(e.target.value)} />
        </Field>
        <Field label="Board id" htmlFor="board-slug" hint={HINTS[source]}>
          <Input id="board-slug" value={slug} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSlug(e.target.value)} />
        </Field>
        {source === "WORKDAY" && (
          <Field label="Workday host" htmlFor="board-host" hint="e.g. acme.wd5.myworkdayjobs.com">
            <Input id="board-host" value={host} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHost(e.target.value)} />
          </Field>
        )}
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(() => addJobBoard({ source: source as "GREENHOUSE", slug, host: host || undefined, companyName }), () => {
              setSlug("");
              setHost("");
              setCompanyName("");
              window.location.reload();
            })
          }
        >
          Add board
        </Button>
        <ActionMessage error={error} note={note} />
      </div>
    </div>
  );
}
