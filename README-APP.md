# DepoSim App (Express + React + Neon + Prisma on Vercel)

Full-stack app: **Express** API, **React** (Vite) frontend, **Neon** (serverless Postgres), **Prisma**, deployed on **Vercel**.

## Structure

- **`/api`** – Express app (Vercel serverless); handles `/api/*`.
- **`/client`** – React (Vite) frontend; builds to `client/dist`.
- **`/prisma`** – Prisma schema and migrations; DB is Neon Postgres.

## Setup

### 1. Neon database

1. Create a project at [neon.tech](https://neon.tech).
2. Copy the **pooled** connection string → `DATABASE_URL`.
3. Copy the **direct** connection string → `DIRECT_URL` (for migrations).

### 2. Environment variables

Create a `.env` in the repo root (and add the same in Vercel → Project → Settings → Environment Variables):

```env
DATABASE_URL="postgresql://...?sslmode=require"
DIRECT_URL="postgresql://...?sslmode=require"
```

### 3. Install and DB

```bash
npm install
cd client && npm install && cd ..
npx prisma migrate dev --name init
```

### 4. Run locally

- API (Express): `npm run dev:api` (port 3001).
- Frontend: `npm run dev:client` (port 5173; proxies `/api` to 3001).

Or both: `npm run dev`.

### 5. Deploy to Vercel

1. Push to GitHub and import the repo in [Vercel](https://vercel.com).
2. Add `DATABASE_URL` and `DIRECT_URL` in the project’s Environment Variables.
3. Build command: `npm run build` (default from `vercel.json`).
4. Deploy. The app is served from the root; `/api/*` goes to the Express serverless function.

## API

- `GET /api/health` – health check
- `GET /api/cases` – list cases
- `GET /api/cases/:id` – get one case
- `POST /api/cases` – create (body: `caseNumber`, `firstName`, `lastName`, `phone`, `description`, optional `email`)
- `PATCH /api/cases/:id` – update
- `DELETE /api/cases/:id` – delete

## Prisma

- Generate client: `npx prisma generate`
- Apply migrations (e.g. production): `npx prisma migrate deploy`
- Create migration: `npx prisma migrate dev --name your_name`
