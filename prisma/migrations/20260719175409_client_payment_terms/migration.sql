-- Per-client payment terms (Net X business/calendar days) with company default mode
CREATE TYPE "NetDaysMode" AS ENUM ('BUSINESS', 'CALENDAR');
ALTER TABLE "CompanySettings" ADD COLUMN "defaultNetDaysMode" "NetDaysMode" NOT NULL DEFAULT 'BUSINESS';
ALTER TABLE "Client" ADD COLUMN "netDays" INTEGER,
                     ADD COLUMN "netDaysMode" "NetDaysMode";
