import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

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

  console.log("Seed complete.");
}

main().finally(() => db.$disconnect());
