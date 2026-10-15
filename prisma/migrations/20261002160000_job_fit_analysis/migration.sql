-- AlterTable
ALTER TABLE "JobPosting" ADD COLUMN     "fitAnalysis" JSONB,
ADD COLUMN     "fitAnalyzedAt" TIMESTAMP(3);
