-- CreateTable
CREATE TABLE "deposition_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "organization_id" TEXT,
    "stages" JSONB NOT NULL DEFAULT '[]',
    "personas" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposition_templates_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "deposition_templates" ADD CONSTRAINT "deposition_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
