import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { AccountInput } from "@/lib/validations";
import { AccountForm } from "@/components/platform/accounts/AccountForm";

export const metadata = { title: "Edit account — Avani" };
export const dynamic = "force-dynamic";

export default async function EditAccountPage({ params }: { params: { id: string } }) {
  const account = await db.financialAccount.findUnique({ where: { id: params.id } });
  if (!account) notFound();

  const input: AccountInput = {
    name: account.name,
    kind: account.kind,
    institution: account.institution,
    mask: account.mask ?? "",
    amountsAreCharges: account.amountsAreCharges,
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Edit account</h1>
          <p className="sub">{account.name}</p>
        </div>
      </div>

      <AccountForm account={input} accountId={account.id} archived={account.archived} />
    </>
  );
}
