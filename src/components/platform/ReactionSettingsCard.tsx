"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/platform/ds";
import { updateReactionSetting } from "@/actions/notifications";

/**
 * Automation toggles. Handlers for OFF reactions are built and waiting —
 * flipping a switch requires no code change (see src/lib/events/register.ts).
 */
export function ReactionSettingsCard({
  initial,
}: {
  initial: Record<string, boolean>;
}) {
  const [overdueEmails, setOverdueEmails] = useState(initial.overdueEmails ?? false);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string, value: boolean, set: (v: boolean) => void) {
    set(value);
    startTransition(async () => {
      const res = await updateReactionSetting(key, value);
      if (res.ok === false) {
        set(!value);
        setError(res.error);
      } else {
        setError(null);
      }
    });
  }

  return (
    <div className="form-card" style={{ marginTop: 24 }}>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-lg)",
          margin: "0 0 6px",
          color: "var(--text-primary)",
        }}
      >
        Automations
      </h2>
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-sm)",
          color: "var(--text-muted)",
          margin: "0 0 18px",
        }}
      >
        The system always notifies you in-app and by email. These switches
        control what it may do outward on your behalf.
      </p>
      {/* ds Switch calls onChange with the next boolean, not an event */}
      <Switch
        label="Email clients an overdue payment reminder (max once per 7 days per invoice)"
        checked={overdueEmails}
        data-testid="toggle-overdue-emails"
        onChange={(next: boolean) => toggle("overdueEmails", next, setOverdueEmails)}
      />
      {error && (
        <p role="alert" style={{ color: "var(--critical)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
