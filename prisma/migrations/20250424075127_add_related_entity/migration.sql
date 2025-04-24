-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "related_entity" TEXT,
ALTER COLUMN "financial_aspect" DROP DEFAULT;
