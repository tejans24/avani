import type { Metadata } from "next";
import "@/ds/styles.css";
import "./site.css";
import { AuthProvider } from "@/components/platform/AuthProvider";

export const metadata: Metadata = {
  title: "Avani — Thoughtful systems. Real efficiency. Responsible AI.",
  description:
    "We help growing businesses and public-sector teams run leaner and build better with AI — done thoughtfully, not hastily.",
  icons: {
    icon: { url: "/brand/mark-sun.svg", type: "image/svg+xml" },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </AuthProvider>
  );
}
