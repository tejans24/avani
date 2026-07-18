import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type SmsResult = { ok: true } | { ok: false; error: string };

/**
 * SMS_MODE=twilio — real delivery via Twilio REST API.
 * SMS_MODE=fake   — writes the message to .fake-sms/ (dev + Playwright).
 * SMS is the break-glass notification tier only (see notify.ts).
 */
export async function sendSms(body: string): Promise<SmsResult> {
  if (process.env.SMS_MODE === "fake") {
    try {
      const dir = join(process.cwd(), ".fake-sms");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, `${Date.now()}.json`),
        JSON.stringify({ sentAt: new Date().toISOString(), to: process.env.OWNER_PHONE ?? "", body }, null, 2)
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Fake SMS write failed" };
    }
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const to = process.env.OWNER_PHONE;
  if (!sid || !token || !from || !to) {
    return { ok: false, error: "Twilio is not configured (SID/token/from/OWNER_PHONE)." };
  }
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Twilio ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "SMS send failed" };
  }
}
