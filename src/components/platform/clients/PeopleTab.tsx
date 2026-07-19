import { db } from "@/lib/db";
import { Badge, Button } from "@/components/platform/ds";
import { CONTACT_ROLE_LABEL } from "@/lib/bd-playbook";
import type { ContactRole } from "@/lib/validations";
import { ContactActions } from "./ContactActions";

const ROLE_TONE: Record<ContactRole, string> = {
  DECISION_MAKER: "brand",
  CHAMPION: "positive",
  INFLUENCER: "accent",
  BLOCKER: "critical",
  USER: "neutral",
  OTHER: "neutral",
};

type ContactNode = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  role: ContactRole | null;
  reportsToId: string | null;
  notes: string | null;
  isPrimary: boolean;
};

/** Group contacts into a light org tree keyed by reportsToId. */
function childrenOf(contacts: ContactNode[], parentId: string | null): ContactNode[] {
  const ids = new Set(contacts.map((c) => c.id));
  return contacts
    .filter((c) => {
      // A contact whose manager isn't in the visible set (e.g. archived) is
      // treated as a root so it never disappears from the tree.
      const parent = c.reportsToId && ids.has(c.reportsToId) ? c.reportsToId : null;
      return parent === parentId;
    })
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name));
}

function ContactCard({ clientId, contact }: { clientId: string; contact: ContactNode }) {
  const contactLine = [contact.email, contact.phone].filter(Boolean).join(" · ");
  return (
    <div
      data-testid="contact-card"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        padding: "14px 16px",
        display: "grid",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-base)",
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          {contact.name}
        </span>
        {contact.title && (
          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            {contact.title}
          </span>
        )}
        {contact.isPrimary && <Badge tone="brand">Primary</Badge>}
        {contact.role && (
          <Badge tone={ROLE_TONE[contact.role]}>{CONTACT_ROLE_LABEL[contact.role]}</Badge>
        )}
        <div style={{ marginLeft: "auto" }}>
          <ContactActions clientId={clientId} contactId={contact.id} archived={false} />
        </div>
      </div>
      {contactLine && (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{contactLine}</div>
      )}
      {contact.notes && (
        <div
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--text-secondary)",
            whiteSpace: "pre-line",
            borderTop: "1px solid var(--border-subtle)",
            marginTop: 2,
            paddingTop: 8,
          }}
        >
          {contact.notes}
        </div>
      )}
    </div>
  );
}

/** Recursively render a contact and its reports, indented. */
function OrgBranch({
  clientId,
  contacts,
  parentId,
  depth,
}: {
  clientId: string;
  contacts: ContactNode[];
  parentId: string | null;
  depth: number;
}) {
  const nodes = childrenOf(contacts, parentId);
  if (nodes.length === 0) return null;
  return (
    <div style={{ display: "grid", gap: 12, marginLeft: depth > 0 ? 20 : 0 }}>
      {nodes.map((c) => (
        <div key={c.id} style={{ display: "grid", gap: 12 }}>
          <ContactCard clientId={clientId} contact={c} />
          <OrgBranch clientId={clientId} contacts={contacts} parentId={c.id} depth={depth + 1} />
        </div>
      ))}
    </div>
  );
}

export async function PeopleTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const contacts = (await db.contact.findMany({
    where: { clientId, archived: false },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      title: true,
      email: true,
      phone: true,
      role: true,
      reportsToId: true,
      notes: true,
      isPrimary: true,
    },
  })) as ContactNode[];

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
          People you're mapping inside {clientName} — roles, reporting lines, and what you know.
          Internal only.
        </p>
        <Button href={`/clients/${clientId}/contacts/new`} variant="secondary" size="sm">
          Add contact
        </Button>
      </div>

      {contacts.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">No contacts mapped yet</p>
          <p>
            Add the people you deal with at {clientName} — who decides, who champions you, and the
            politics worth remembering.
          </p>
          <div className="empty-actions">
            <Button href={`/clients/${clientId}/contacts/new`} variant="primary" size="sm">
              Add the first contact
            </Button>
          </div>
        </div>
      ) : (
        <OrgBranch clientId={clientId} contacts={contacts} parentId={null} depth={0} />
      )}
    </>
  );
}
