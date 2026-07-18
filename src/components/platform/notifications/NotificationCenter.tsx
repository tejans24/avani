"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/actions/notifications";

export type NotificationItem = {
  id: string;
  tier: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  ageLabel: string;
};

const TIER_CHIP: Record<string, { label: string; bg: string; fg: string }> = {
  info: { label: "Update", bg: "var(--sage-tint)", fg: "var(--forest)" },
  action: { label: "Needs you", bg: "var(--clay-tint)", fg: "var(--clay-600)" },
  urgent: { label: "Urgent", bg: "#F2DCD7", fg: "var(--critical)" },
};

/**
 * Instagram-style notification center: bell opens a panel of the latest
 * notifications with unread dots and tier chips; clicking an item marks it
 * read and deep-links to the screen where the one-tap action lives.
 */
export function NotificationCenter({
  items,
  unread,
}: {
  items: NotificationItem[];
  unread: number;
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function openItem(item: NotificationItem) {
    setOpen(false);
    startTransition(async () => {
      if (!item.read) await markNotificationRead(item.id);
      if (item.href) router.push(item.href);
      router.refresh();
    });
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        data-testid="notification-bell"
        onClick={() => setOpen(!open)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "rgba(239, 237, 226, 0.78)",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-sm)",
          padding: 0,
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 16 }}>
          🔔
        </span>
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
      </button>

      {open && (
        <div
          data-testid="notification-panel"
          style={{
            position: "fixed",
            left: 16,
            bottom: 64,
            width: 360,
            maxWidth: "calc(100vw - 32px)",
            maxHeight: "70vh",
            overflowY: "auto",
            background: "var(--color-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-lg, 0 12px 32px rgba(33,31,26,0.18))",
            zIndex: 50,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontWeight: 600,
                fontSize: "var(--text-sm)",
                color: "var(--text-primary)",
              }}
            >
              Notifications
            </span>
            {unread > 0 && (
              <button
                onClick={() =>
                  startTransition(async () => {
                    await markAllNotificationsRead();
                    router.refresh();
                  })
                }
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-accent)",
                  fontFamily: "var(--font-sans)",
                  fontSize: "var(--text-xs)",
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p
              style={{
                padding: "24px 16px",
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-sm)",
                color: "var(--text-muted)",
                textAlign: "center",
              }}
            >
              All quiet — nothing needs you.
            </p>
          ) : (
            items.map((item) => {
              const chip = TIER_CHIP[item.tier] ?? TIER_CHIP.info;
              return (
                <button
                  key={item.id}
                  onClick={() => openItem(item)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: item.read ? "transparent" : "var(--cream)",
                    border: "none",
                    borderBottom: "1px solid var(--border-subtle)",
                    cursor: "pointer",
                    padding: "12px 16px",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    {!item.read && (
                      <span
                        aria-hidden="true"
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: "var(--clay)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span
                      style={{
                        background: chip.bg,
                        color: chip.fg,
                        borderRadius: "var(--radius-full)",
                        fontSize: 10,
                        fontFamily: "var(--font-sans)",
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        padding: "2px 8px",
                      }}
                    >
                      {chip.label}
                    </span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontFamily: "var(--font-sans)",
                        fontSize: "var(--text-xs)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {item.ageLabel}
                    </span>
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontFamily: "var(--font-sans)",
                      fontSize: "var(--text-sm)",
                      color: "var(--text-primary)",
                      lineHeight: 1.4,
                    }}
                  >
                    {item.title}
                  </span>
                  {item.body && (
                    <span
                      style={{
                        display: "block",
                        marginTop: 2,
                        fontFamily: "var(--font-sans)",
                        fontSize: "var(--text-xs)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {item.body}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
