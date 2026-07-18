-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('BANK', 'CREDIT_CARD');

-- CreateEnum
CREATE TYPE "AccountSource" AS ENUM ('MERCURY_API', 'CSV');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('UNREVIEWED', 'REVIEWED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER', 'OWNER');

-- CreateEnum
CREATE TYPE "RuleField" AS ENUM ('DESCRIPTION', 'MERCHANT');

-- CreateEnum
CREATE TYPE "RuleMatchType" AS ENUM ('SUBSTRING', 'REGEX');

-- CreateEnum
CREATE TYPE "TaxJurisdiction" AS ENUM ('FEDERAL', 'STATE');

-- CreateEnum
CREATE TYPE "TaxLine" AS ENUM ('GROSS_RECEIPTS', 'OFFICER_COMPENSATION', 'SALARIES_WAGES', 'REPAIRS_MAINTENANCE', 'RENTS', 'TAXES_LICENSES', 'INTEREST', 'DEPRECIATION', 'ADVERTISING', 'EMPLOYEE_BENEFITS', 'OTHER_DEDUCTIONS', 'NONE');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "billingCadenceDays" INTEGER,
ADD COLUMN     "overdueRemindersEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "institution" TEXT NOT NULL,
    "mask" TEXT,
    "source" "AccountSource" NOT NULL,
    "mercuryAccountId" TEXT,
    "amountsAreCharges" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "postedAt" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "merchant" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "categoryId" TEXT,
    "matchedInvoiceId" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    "taxLine" "TaxLine" NOT NULL,
    "deductiblePct" INTEGER NOT NULL DEFAULT 100,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "system" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryRule" (
    "id" TEXT NOT NULL,
    "field" "RuleField" NOT NULL DEFAULT 'DESCRIPTION',
    "matchType" "RuleMatchType" NOT NULL DEFAULT 'SUBSTRING',
    "pattern" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "state" TEXT NOT NULL DEFAULT '',
    "federalRateBps" INTEGER NOT NULL DEFAULT 2400,
    "stateRateBps" INTEGER NOT NULL DEFAULT 0,
    "ownerSalaryAnnualCents" INTEGER NOT NULL DEFAULT 0,
    "withholdingYtdCents" INTEGER NOT NULL DEFAULT 0,
    "cpaFiles1120S" BOOLEAN,
    "payrollProvider" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuarterlyEstimatePayment" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "jurisdiction" "TaxJurisdiction" NOT NULL,
    "paidDate" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuarterlyEstimatePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceDeadline" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "leadDays" INTEGER NOT NULL DEFAULT 30,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "ComplianceDeadline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DomainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandlerRun" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "handler" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandlerRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_mercuryAccountId_key" ON "FinancialAccount"("mercuryAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_matchedInvoiceId_key" ON "Transaction"("matchedInvoiceId");

-- CreateIndex
CREATE INDEX "Transaction_postedAt_idx" ON "Transaction"("postedAt");

-- CreateIndex
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_accountId_dedupeKey_key" ON "Transaction"("accountId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE INDEX "QuarterlyEstimatePayment_year_idx" ON "QuarterlyEstimatePayment"("year");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceDeadline_key_key" ON "ComplianceDeadline"("key");

-- CreateIndex
CREATE INDEX "ComplianceDeadline_dueDate_idx" ON "ComplianceDeadline"("dueDate");

-- CreateIndex
CREATE INDEX "DomainEvent_processedAt_idx" ON "DomainEvent"("processedAt");

-- CreateIndex
CREATE INDEX "DomainEvent_type_createdAt_idx" ON "DomainEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "DomainEvent_entityType_entityId_idx" ON "DomainEvent"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "HandlerRun_eventId_handler_key" ON "HandlerRun"("eventId", "handler");

-- CreateIndex
CREATE INDEX "Notification_readAt_createdAt_idx" ON "Notification"("readAt", "createdAt");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_matchedInvoiceId_fkey" FOREIGN KEY ("matchedInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryRule" ADD CONSTRAINT "CategoryRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandlerRun" ADD CONSTRAINT "HandlerRun_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "DomainEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
