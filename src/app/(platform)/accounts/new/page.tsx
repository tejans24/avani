import { AccountForm } from "@/components/platform/accounts/AccountForm";

export const metadata = { title: "New account — Avani" };

export default function NewAccountPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>New account</h1>
          <p className="sub">Add a bank or card account to import transactions into.</p>
        </div>
      </div>

      <AccountForm account={null} />
    </>
  );
}
