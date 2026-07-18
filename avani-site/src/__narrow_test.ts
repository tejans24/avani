import { type ActionResult } from "@/actions/invoices";
declare const r: ActionResult;
if (r.ok === false) { const y: string = r.error; void y; } else { void r.id; }
