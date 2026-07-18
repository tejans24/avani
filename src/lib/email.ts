import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resend } from "resend";

export type EmailMessage = {
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
};

export type SendResult = { ok: true } | { ok: false; error: string };

/**
 * EMAIL_MODE=resend — real delivery via Resend.
 * EMAIL_MODE=fake   — writes the message to .fake-emails/ (local dev without
 *                     keys, and the Playwright suite asserts on this output).
 */
export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  if (process.env.EMAIL_MODE === "fake") {
    return sendFake(msg);
  }
  return sendResend(msg);
}

function sendFake(msg: EmailMessage): SendResult {
  try {
    const dir = join(process.cwd(), ".fake-emails");
    mkdirSync(dir, { recursive: true });
    const stamp = Date.now();
    const record = {
      sentAt: new Date().toISOString(),
      to: msg.to,
      cc: msg.cc ?? [],
      subject: msg.subject,
      html: msg.html,
      attachments: (msg.attachments ?? []).map((a) => ({
        filename: a.filename,
        bytes: a.content.length,
      })),
    };
    writeFileSync(join(dir, `${stamp}.json`), JSON.stringify(record, null, 2));
    for (const a of msg.attachments ?? []) {
      writeFileSync(join(dir, `${stamp}-${a.filename}`), a.content);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fake email write failed" };
  }
}

async function sendResend(msg: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || apiKey.includes("placeholder")) {
    return { ok: false, error: "RESEND_API_KEY is not configured." };
  }
  if (!from) {
    return { ok: false, error: "EMAIL_FROM is not configured." };
  }
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: msg.to,
      cc: msg.cc?.length ? msg.cc : undefined,
      subject: msg.subject,
      html: msg.html,
      attachments: msg.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Email send failed" };
  }
}
