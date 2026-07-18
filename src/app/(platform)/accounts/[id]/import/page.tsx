import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { CsvImportWizard } from "@/components/platform/import/CsvImportWizard";

export const metadata = { title: "Import CSV — Avani" };
export const dynamic = "force-dynamic";

export default async function ImportCsvPage({ params }: { params: { id: string } }) {
  const account = await db.financialAccount.findUnique({ where: { id: params.id } });
  if (!account) notFound();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Import CSV</h1>
          <p className="sub">
            {account.name} — {account.institution}
            {account.mask ? ` •••• ${account.mask}` : ""}
          </p>
        </div>
      </div>

      <CsvImportWizard
        account={{
          id: account.id,
          name: account.name,
          amountsAreCharges: account.amountsAreCharges,
        }}
      />
    </>
  );
}
