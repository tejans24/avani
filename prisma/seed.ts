import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { CATEGORY_SEEDS, complianceSeedsForYear } from "./seed-categories";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  await db.companySettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      companyName: "Avani Consulting LLC",
      addressLine1: "123 Main St",
      addressLine2: "Suite 100",
      city: "San Francisco",
      state: "CA",
      postalCode: "94105",
      country: "USA",
      email: "invoices@avani.example",
      phone: "(555) 555-0100",
      payViaLabel: "Manual transfer (ACH/Wire)",
      paymentInstructions:
        "Bank: Mercury Business\nRouting number: 000000000\nAccount number: 0000000000\nAccount name: Avani Consulting LLC",
      defaultTerms: "Net 15 business days.",
      defaultNetBusinessDays: 15,
      defaultTaxRateBps: 0,
    },
  });

  const existing = await db.client.findFirst({ where: { name: "Sample Client Co" } });
  if (!existing) {
    await db.client.create({
      data: {
        name: "Sample Client Co",
        contactName: "Pat Doe",
        billingEmail: "billing@sampleclient.example",
        ccEmails: ["accounting@sampleclient.example"],
        addressLine1: "456 Market St",
        city: "New York",
        state: "NY",
        postalCode: "10001",
        country: "USA",
      },
    });
  }

  for (const [i, c] of CATEGORY_SEEDS.entries()) {
    await db.category.upsert({
      where: { name: c.name },
      update: {},
      create: {
        name: c.name,
        kind: c.kind,
        taxLine: c.taxLine,
        deductiblePct: c.deductiblePct ?? 100,
        sortOrder: i,
        system: true,
      },
    });
  }

  await db.taxSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  const year = new Date().getUTCFullYear();
  for (const d of [...complianceSeedsForYear(year), ...complianceSeedsForYear(year + 1)]) {
    await db.complianceDeadline.upsert({
      where: { key: d.key },
      update: {},
      create: {
        key: d.key,
        title: d.title,
        dueDate: new Date(d.dueDate + "T00:00:00Z"),
        leadDays: d.leadDays,
        notes: d.notes,
      },
    });
  }

  console.log("Seed complete.");
}

main().finally(() => db.$disconnect());
