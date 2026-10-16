-- CreateEnum
CREATE TYPE "Decision" AS ENUM ('APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "decision" "Decision";
