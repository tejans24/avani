import { db } from "@/lib/db";
import {
  NotificationCenter,
  type NotificationItem,
} from "./notifications/NotificationCenter";

function ageLabel(from: Date, now: Date): string {
  const mins = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Server wrapper: loads the latest notifications for the client panel. */
export async function NotificationBell() {
  let items: NotificationItem[] = [];
  let unread = 0;
  try {
    const now = new Date();
    const [rows, unreadCount] = await Promise.all([
      db.notification.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
      db.notification.count({ where: { readAt: null } }),
    ]);
    unread = unreadCount;
    items = rows.map((n) => ({
      id: n.id,
      tier: n.tier,
      title: n.title,
      body: n.body,
      href: n.href,
      read: n.readAt !== null,
      ageLabel: ageLabel(n.createdAt, now),
    }));
  } catch {
    // DB unavailable (e.g. build-time render) — render an empty bell.
  }
  return <NotificationCenter items={items} unread={unread} />;
}
