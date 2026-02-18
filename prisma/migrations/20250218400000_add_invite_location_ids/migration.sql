-- AlterTable
ALTER TABLE "invites" ADD COLUMN "location_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
