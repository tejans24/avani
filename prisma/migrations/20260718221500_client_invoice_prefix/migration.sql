-- Per-client invoice numbering: INV-{PREFIX}-{0001}
ALTER TABLE "Client" ADD COLUMN "invoicePrefix" TEXT,
                     ADD COLUMN "nextInvoiceNumber" INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX "Client_invoicePrefix_key" ON "Client"("invoicePrefix");
