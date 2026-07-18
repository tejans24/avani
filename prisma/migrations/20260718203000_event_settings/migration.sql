-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "lastTickAt" TIMESTAMP(3),
ADD COLUMN     "reactionSettings" JSONB NOT NULL DEFAULT '{}';
