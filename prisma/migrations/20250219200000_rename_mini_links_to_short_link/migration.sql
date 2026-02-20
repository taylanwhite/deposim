-- RenameTable
ALTER TABLE "mini_links" RENAME TO "short_link";

-- RenameIndex
ALTER INDEX "mini_links_slug_key" RENAME TO "short_link_slug_key";

-- RenamePrimaryKey
ALTER INDEX "mini_links_pkey" RENAME TO "short_link_pkey";

-- RenameForeignKey
ALTER TABLE "short_link" RENAME CONSTRAINT "mini_links_organization_id_fkey" TO "short_link_organization_id_fkey";
