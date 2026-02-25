-- Enforce unique client email per organization
CREATE UNIQUE INDEX "clients_organization_id_email_key" ON "clients"("organization_id", "email");
