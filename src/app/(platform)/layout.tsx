import "./platform.css";
import { AppShell } from "@/components/platform/AppShell";

export const metadata = { title: "Avani Platform" };

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
