import { getTaxPageData } from "@/lib/tax-data";
import type { TaxSettingsInput } from "@/lib/validations";
import { ReportsTabs } from "@/components/platform/ReportsTabs";
import { EstimateCard } from "@/components/platform/taxes/EstimateCard";
import { EstimatePaymentsTable } from "@/components/platform/taxes/EstimatePaymentsTable";
import { TaxSettingsForm } from "@/components/platform/taxes/TaxSettingsForm";
import { ComplianceList } from "@/components/platform/taxes/ComplianceList";

export const metadata = { title: "Taxes — Avani" };
export const dynamic = "force-dynamic";

export default async function TaxesPage() {
  const data = await getTaxPageData();

  // Form-shaped settings: nulls become "" / stay null per field so the
  // controlled inputs stay controlled (same pattern as /settings).
  const settingsInput: TaxSettingsInput = {
    state: data.settings.state,
    federalRateBps: data.settings.federalRateBps,
    stateRateBps: data.settings.stateRateBps,
    ownerSalaryAnnualCents: data.settings.ownerSalaryAnnualCents,
    withholdingYtdCents: data.settings.withholdingYtdCents,
    cpaFiles1120S: data.settings.cpaFiles1120S,
    payrollProvider: data.settings.payrollProvider ?? "",
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Taxes</h1>
          <p className="sub">
            Quarterly estimates on the K-1 profit, the compliance calendar, and
            the accountant package.
          </p>
        </div>
      </div>

      <ReportsTabs active="/reports/taxes" />

      <EstimateCard
        estimate={data.estimate}
        ytdNetProfitCents={data.ytdNetProfitCents}
        year={data.year}
      />

      <EstimatePaymentsTable
        payments={data.payments}
        year={data.year}
        todayIso={data.asOfIso}
      />

      <TaxSettingsForm settings={settingsInput} />

      <ComplianceList deadlines={data.deadlines} readiness={data.readiness} />
    </>
  );
}
