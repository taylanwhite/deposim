-- Add language preference column to users and clients tables
ALTER TABLE "users" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "clients" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
