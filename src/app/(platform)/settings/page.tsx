import { db } from "@/lib/db";
import type { SettingsInput } from "@/lib/validations";
import { SettingsForm } from "@/components/platform/SettingsForm";
import { ReactionSettingsCard } from "@/components/platform/ReactionSettingsCard";

export const metadata = { title: "Settings — Avani" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await db.companySettings.findUniqueOrThrow({ where: { id: 1 } });

  // Plain SettingsInput-shaped object: no Date fields, nulls become "" so the
  // client form's controlled inputs stay controlled.
  const initial: SettingsInput = {
    companyName: settings.companyName,
    addressLine1: settings.addressLine1,
    addressLine2: settings.addressLine2 ?? "",
    city: settings.city,
    state: settings.state,
    postalCode: settings.postalCode,
    country: settings.country,
    email: settings.email,
    phone: settings.phone ?? "",
    payViaLabel: settings.payViaLabel,
    paymentInstructions: settings.paymentInstructions,
    defaultTerms: settings.defaultTerms ?? "",
    defaultNetBusinessDays: settings.defaultNetBusinessDays,
    defaultTaxRateBps: settings.defaultTaxRateBps,
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="sub">Company details, payment instructions, and invoicing defaults.</p>
        </div>
      </div>
      <SettingsForm settings={initial} />
      <ReactionSettingsCard
        initial={(settings.reactionSettings as Record<string, boolean>) ?? {}}
      />
    </>
  );
}
