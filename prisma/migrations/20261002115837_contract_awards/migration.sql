-- Federal contract awards (USAspending): agencies to watch and the awards
-- found, linked to job-finder companies. Internal only.

-- CreateTable
CREATE TABLE "AwardQuery" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "agencyTier" TEXT NOT NULL,
    "agencyName" TEXT NOT NULL,
    "toptierName" TEXT,
    "group" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AwardQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractAward" (
    "id" TEXT NOT NULL,
    "awardKey" TEXT NOT NULL,
    "piid" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "normalizedRecipient" TEXT NOT NULL,
    "companyId" TEXT,
    "queryId" TEXT,
    "agency" TEXT NOT NULL,
    "subAgency" TEXT,
    "description" TEXT,
    "amountCents" BIGINT,
    "startDate" DATE,
    "endDate" DATE,
    "naics" TEXT,
    "placeState" TEXT,
    "url" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AwardQuery_agencyTier_agencyName_key" ON "AwardQuery"("agencyTier", "agencyName");

-- CreateIndex
CREATE UNIQUE INDEX "ContractAward_awardKey_key" ON "ContractAward"("awardKey");

-- CreateIndex
CREATE INDEX "ContractAward_normalizedRecipient_idx" ON "ContractAward"("normalizedRecipient");

-- CreateIndex
CREATE INDEX "ContractAward_companyId_endDate_idx" ON "ContractAward"("companyId", "endDate");

-- AddForeignKey
ALTER TABLE "ContractAward" ADD CONSTRAINT "ContractAward_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "JobCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAward" ADD CONSTRAINT "ContractAward_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "AwardQuery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
