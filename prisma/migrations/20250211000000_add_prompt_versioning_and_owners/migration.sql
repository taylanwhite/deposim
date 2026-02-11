-- AlterTable: add version tracking and owner relations to prompts
ALTER TABLE "prompts" ADD COLUMN "parent_id" TEXT;
ALTER TABLE "prompts" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "prompts" ADD COLUMN "company_id" TEXT;
ALTER TABLE "prompts" ADD COLUMN "client_id" TEXT;
ALTER TABLE "prompts" ADD COLUMN "case_id" TEXT;

-- Foreign keys
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "prompts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
