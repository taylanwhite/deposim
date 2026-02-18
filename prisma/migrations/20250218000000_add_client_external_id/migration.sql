-- AlterTable
ALTER TABLE "clients" ADD COLUMN "external_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "clients_external_id_key" ON "clients"("external_id");
