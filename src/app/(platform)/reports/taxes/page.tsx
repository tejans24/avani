import { ReportsTabs } from "@/components/platform/ReportsTabs";

export const metadata = { title: "Taxes — Avani" };

export default function TaxesPage() {
  return (
    <>
      <div className="page-head">
        <h1>Taxes</h1>
      </div>
      <ReportsTabs active="/reports/taxes" />
      <div className="empty-state">Coming soon.</div>
    </>
  );
}
