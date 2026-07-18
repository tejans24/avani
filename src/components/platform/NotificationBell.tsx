import Link from "next/link";
import { db } from "@/lib/db";

/** Unread-count pill linking to the activity feed. Server component. */
export async function NotificationBell() {
  let unread = 0;
  try {
    unread = await db.notification.count({ where: { readAt: null } });
  } catch {
    // DB unavailable (e.g. build-time render) — show a plain bell.
  }
  return (
    <Link
      href="/activity"
      aria-label={`Activity${unread > 0 ? `, ${unread} unread` : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        color: "rgba(239, 237, 226, 0.78)",
        textDecoration: "none",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-sm)",
      }}
    >
      <span aria-hidden="true">🔔</span>
      {unread > 0 && (
        <span
          data-testid="unread-count"
          style={{
            background: "var(--clay)",
            color: "#FBF6EF",
            borderRadius: "var(--radius-full)",
            fontSize: "var(--text-xs)",
            lineHeight: 1,
            padding: "3px 7px",
            fontWeight: 600,
          }}
        >
          {unread}
        </span>
      )}
    </Link>
  );
}
