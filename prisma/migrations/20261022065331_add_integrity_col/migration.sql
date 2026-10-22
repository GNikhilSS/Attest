-- CreateEnum
CREATE TYPE "GradingStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "gradingStatus" "GradingStatus",
ADD COLUMN     "testResults" JSONB;

-- CreateTable
CREATE TABLE "GradingReport" (
    "id" SERIAL NOT NULL,
    "attemptId" INTEGER NOT NULL,
    "status" "GradingStatus" NOT NULL DEFAULT 'PENDING',
    "totalTestCases" INTEGER NOT NULL DEFAULT 0,
    "passedTestCases" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER,
    "integritySummary" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GradingReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GradingReport_attemptId_key" ON "GradingReport"("attemptId");

-- AddForeignKey
ALTER TABLE "GradingReport" ADD CONSTRAINT "GradingReport_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
