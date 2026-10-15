import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { evaluatePosting, type EvaluateEvent } from "@/lib/jobs/evaluate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// An evaluation takes a minute or two.
export const maxDuration = 300;


/**
 * Evaluate one job and stream progress as it happens: Claude's reasoning
 * summary, then how much of the report is written. The job page shows it as
 * a live log instead of a silent "Evaluating…".
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: EvaluateEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      let lastChars = 0;
      try {
        send({ type: "started" });
        const analysis = await evaluatePosting(params.id, (p) => {
          if (p.type === "thinking") send(p);
          // Writing progress every ~500 characters is plenty.
          else if (p.chars - lastChars >= 500) {
            lastChars = p.chars;
            send(p);
          }
        });
        revalidatePath("/jobs");
        revalidatePath(`/jobs/${params.id}`);
        send({ type: "done", analysis });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "The evaluation failed." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
