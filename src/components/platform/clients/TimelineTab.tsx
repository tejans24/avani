import { db } from "@/lib/db";
import { Badge } from "@/components/platform/ds";
import { formatDateLong, dateToIso, todayUtc } from "@/lib/dates";
import {
  INTERACTION_TYPE_LABEL,
  INTERACTION_DIRECTION_LABEL,
} from "@/lib/bd-playbook";
import type { InteractionType } from "@/lib/validations";
import { InteractionComposer } from "./InteractionComposer";
import { DeleteInteractionButton } from "./DeleteInteractionButton";

const TYPE_TONE: Record<InteractionType, string> = {
  EMAIL: "accent",
  CALL: "brand",
  MEETING: "positive",
  NOTE: "neutral",
};

export async function TimelineTab({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const [interactions, contacts] = await Promise.all([
    db.interaction.findMany({
      where: { clientId },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      include: { contact: { select: { name: true } } },
    }),
    db.contact.findMany({
      where: { clientId, archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <>
      <p style={{ margin: "0 0 16px", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
        Every touch with {clientName} — calls, meetings, and emails. App-sent
        invoices and reminders log themselves. Internal only.
      </p>

      <InteractionComposer
        clientId={clientId}
        contacts={contacts}
        defaultDate={dateToIso(todayUtc())}
      />

      {interactions.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">No interactions logged yet</p>
          <p>Log your first call, meeting, or note above to start the timeline.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {interactions.map((ix) => {
            const auto = ix.source != null;
            return (
              <div
                key={ix.id}
                data-testid="interaction-row"
                data-auto={auto || undefined}
                className="activity-row"
                style={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "12px 16px",
                  display: "grid",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Badge tone={TYPE_TONE[ix.type]}>{INTERACTION_TYPE_LABEL[ix.type]}</Badge>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                    {INTERACTION_DIRECTION_LABEL[ix.direction]}
                  </span>
                  {auto && <Badge tone="neutral">Auto</Badge>}
                  <span
                    style={{ marginLeft: "auto", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}
                  >
                    {formatDateLong(ix.occurredAt)}
                    {ix.contact ? ` · ${ix.contact.name}` : ""}
                  </span>
                  {!auto && (
                    <span style={{ marginLeft: 4 }}>
                      <DeleteInteractionButton id={ix.id} />
                    </span>
                  )}
                </div>
                {ix.subject && (
                  <div
                    style={{
                      fontSize: "var(--text-sm)",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {ix.subject}
                  </div>
                )}
                {ix.body && (
                  <div
                    style={{
                      fontSize: "var(--text-sm)",
                      color: "var(--text-secondary)",
                      whiteSpace: "pre-line",
                    }}
                  >
                    {ix.body}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
