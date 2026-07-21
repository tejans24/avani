-- Link the two legs of a confirmed account-to-account transfer so neither
-- double-counts in P&L / taxes.
ALTER TABLE "Transaction" ADD COLUMN "transferGroupId" TEXT;
CREATE INDEX "Transaction_transferGroupId_idx" ON "Transaction"("transferGroupId");
