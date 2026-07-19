-- Client-facing invoice link token
ALTER TABLE "Invoice" ADD COLUMN "shareToken" TEXT;
CREATE UNIQUE INDEX "Invoice_shareToken_key" ON "Invoice"("shareToken");
