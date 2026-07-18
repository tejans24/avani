import { ClientForm } from "@/components/platform/clients/ClientForm";

export const metadata = { title: "New client — Avani" };

export default function NewClientPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>New client</h1>
          <p className="sub">Add a client to start invoicing them.</p>
        </div>
      </div>

      <ClientForm client={null} />
    </>
  );
}
