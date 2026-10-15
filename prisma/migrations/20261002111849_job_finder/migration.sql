-- Job finder: boards, companies, postings (+ aliases, dismissals), activity,
-- master and tailored résumés. Internal only; nothing here is ever submitted.

-- CreateEnum
CREATE TYPE "JobSource" AS ENUM ('GREENHOUSE', 'LEVER', 'ASHBY', 'SMARTRECRUITERS', 'WORKDAY', 'USAJOBS', 'CLIMATEBASE', 'TECH_JOBS_FOR_GOOD', 'MANUAL');

-- CreateEnum
CREATE TYPE "JobLane" AS ENUM ('GOV_CONTRACTOR', 'COMMERCIAL_PLATFORM', 'HEALTH_SYSTEM', 'CLIMATE_CONSERVATION', 'INTERNAL_TOOLS', 'UNCLASSIFIED');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('REMOTE', 'OCCASIONAL_HYBRID', 'HYBRID', 'ONSITE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('NEW', 'SHORTLISTED', 'APPLIED', 'INTERVIEWING', 'OFFER', 'CLOSED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "JobActivityKind" AS ENUM ('STATUS_CHANGE', 'INTERVIEW', 'RECRUITER_CONTACT', 'FOLLOW_UP', 'NOTE');

-- CreateTable
CREATE TABLE "JobBoard" (
    "id" TEXT NOT NULL,
    "source" "JobSource" NOT NULL,
    "slug" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "host" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCompany" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "lane" "JobLane",
    "isStaffingAgency" BOOLEAN NOT NULL DEFAULT false,
    "questions" JSONB NOT NULL DEFAULT '{}',
    "benefits" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPosting" (
    "id" TEXT NOT NULL,
    "source" "JobSource" NOT NULL,
    "sourceJobId" TEXT NOT NULL,
    "boardId" TEXT,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "workMode" "WorkMode" NOT NULL DEFAULT 'UNKNOWN',
    "url" TEXT NOT NULL,
    "descriptionText" TEXT NOT NULL,
    "compMinCents" INTEGER,
    "compMaxCents" INTEGER,
    "postedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "dedupeKey" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "lane" "JobLane" NOT NULL DEFAULT 'UNCLASSIFIED',
    "laneOverride" "JobLane",
    "filterFailures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "score" INTEGER,
    "scoreBreakdown" JSONB NOT NULL DEFAULT '[]',
    "scoreFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scoringVersion" INTEGER,
    "scoredAt" TIMESTAMP(3),
    "benefits" JSONB NOT NULL DEFAULT '[]',
    "status" "JobStatus" NOT NULL DEFAULT 'NEW',
    "statusChangedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "appliedResumeId" TEXT,
    "nextActionNote" TEXT,
    "nextActionDue" DATE,
    "notes" TEXT,
    "tailoringNotes" TEXT,
    "capturedVia" TEXT,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPostingAlias" (
    "id" TEXT NOT NULL,
    "postingId" TEXT NOT NULL,
    "source" "JobSource" NOT NULL,
    "sourceJobId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobPostingAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobDismissal" (
    "id" TEXT NOT NULL,
    "source" "JobSource" NOT NULL,
    "sourceJobId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobActivity" (
    "id" TEXT NOT NULL,
    "postingId" TEXT NOT NULL,
    "kind" "JobActivityKind" NOT NULL,
    "fromStatus" "JobStatus",
    "toStatus" "JobStatus",
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeMaster" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TailoredResume" (
    "id" TEXT NOT NULL,
    "postingId" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "decisions" JSONB NOT NULL DEFAULT '{}',
    "coverNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TailoredResume_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobBoard_source_slug_key" ON "JobBoard"("source", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "JobCompany_normalizedName_key" ON "JobCompany"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "JobPosting_dedupeKey_key" ON "JobPosting"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "JobPosting_appliedResumeId_key" ON "JobPosting"("appliedResumeId");

-- CreateIndex
CREATE INDEX "JobPosting_status_score_idx" ON "JobPosting"("status", "score");

-- CreateIndex
CREATE INDEX "JobPosting_companyId_idx" ON "JobPosting"("companyId");

-- CreateIndex
CREATE INDEX "JobPosting_nextActionDue_idx" ON "JobPosting"("nextActionDue");

-- CreateIndex
CREATE UNIQUE INDEX "JobPosting_source_sourceJobId_key" ON "JobPosting"("source", "sourceJobId");

-- CreateIndex
CREATE INDEX "JobPostingAlias_postingId_idx" ON "JobPostingAlias"("postingId");

-- CreateIndex
CREATE UNIQUE INDEX "JobPostingAlias_source_sourceJobId_key" ON "JobPostingAlias"("source", "sourceJobId");

-- CreateIndex
CREATE INDEX "JobDismissal_dedupeKey_idx" ON "JobDismissal"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "JobDismissal_source_sourceJobId_key" ON "JobDismissal"("source", "sourceJobId");

-- CreateIndex
CREATE INDEX "JobActivity_postingId_occurredAt_idx" ON "JobActivity"("postingId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeMaster_version_key" ON "ResumeMaster"("version");

-- CreateIndex
CREATE UNIQUE INDEX "TailoredResume_postingId_version_key" ON "TailoredResume"("postingId", "version");

-- AddForeignKey
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "JobBoard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "JobCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_appliedResumeId_fkey" FOREIGN KEY ("appliedResumeId") REFERENCES "TailoredResume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPostingAlias" ADD CONSTRAINT "JobPostingAlias_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobActivity" ADD CONSTRAINT "JobActivity_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TailoredResume" ADD CONSTRAINT "TailoredResume_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TailoredResume" ADD CONSTRAINT "TailoredResume_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "ResumeMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
