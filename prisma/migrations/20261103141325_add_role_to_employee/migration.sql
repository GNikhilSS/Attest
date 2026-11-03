-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'ADMIN', 'SUPER_ADMIN');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'EMPLOYEE';
