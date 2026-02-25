-- Enforce unique case number per organization
CREATE UNIQUE INDEX "cases_organization_id_case_number_key" ON "cases"("organization_id", "case_number");

-- Enforce unique client (first name + last name + phone) per organization
CREATE UNIQUE INDEX "clients_organization_id_first_name_last_name_phone_key" ON "clients"("organization_id", "first_name", "last_name", "phone");
