-- CRM / BD layer: client stage + next-action + deal fields, contacts, interactions.
-- All internal-only; never serialized to the client-facing invoice share page.

-- CreateEnum
CREATE TYPE "ClientStage" AS ENUM ('LEAD', 'PROSPECT', 'ACTIVE', 'PAST');
CREATE TYPE "ContactRole" AS ENUM ('DECISION_MAKER', 'CHAMPION', 'INFLUENCER', 'BLOCKER', 'USER', 'OTHER');
CREATE TYPE "InteractionType" AS ENUM ('EMAIL', 'CALL', 'MEETING', 'NOTE');
CREATE TYPE "InteractionDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');

-- AlterTable: Client CRM / BD fields (existing rows default to ACTIVE)
ALTER TABLE "Client"
  ADD COLUMN "stage" "ClientStage" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "nextActionNote" TEXT,
  ADD COLUMN "nextActionDueDate" DATE,
  ADD COLUMN "dealValueCents" INTEGER,
  ADD COLUMN "expectedCloseDate" DATE;

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "role" "ContactRole",
    "reportsToId" TEXT,
    "notes" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT,
    "type" "InteractionType" NOT NULL,
    "direction" "InteractionDirection" NOT NULL DEFAULT 'OUTBOUND',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_clientId_idx" ON "Contact"("clientId");
CREATE INDEX "Contact_reportsToId_idx" ON "Contact"("reportsToId");
CREATE INDEX "Interaction_clientId_occurredAt_idx" ON "Interaction"("clientId", "occurredAt");
CREATE INDEX "Interaction_contactId_idx" ON "Interaction"("contactId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_reportsToId_fkey" FOREIGN KEY ("reportsToId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
