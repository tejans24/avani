import { Badge } from "@/ds/components/core/Badge";
import type { DisplayStatus } from "@/lib/invoice-status";

const TONE: Record<DisplayStatus, string> = {
  DRAFT: "neutral",
  SENT: "brand",
  PAID: "positive",
  OVERDUE: "critical",
  VOID: "caution",
};

const LABEL: Record<DisplayStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PAID: "Paid",
  OVERDUE: "Overdue",
  VOID: "Void",
};

export function StatusBadge({ status }: { status: DisplayStatus }) {
  return <Badge tone={TONE[status]}>{LABEL[status]}</Badge>;
}
