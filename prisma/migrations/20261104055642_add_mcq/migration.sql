-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'MCQ';

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "mcqData" JSONB;
