# Deploy DepoSim to Vercel

## 1. Push to GitHub

Make sure your code is in a GitHub repository:

```bash
git add .
git commit -m "Add Express + React + Prisma + Neon app"
git push origin main
```

(Use your branch name if it’s not `main`.)

---

## 2. Import project in Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (e.g. with GitHub).
2. Click **Add New…** → **Project**.
3. **Import** the `deposim` (or your repo) repository.
4. Leave **Root Directory** as `.` (repo root).
5. Vercel will read `vercel.json`:
   - **Build Command:** `npm run build`
   - **Output Directory:** `client/dist`
   - **Install Command:** `npm install && cd client && npm install`

Do **not** click Deploy yet.

---

## 3. Add environment variables

In the same import screen (or later: Project → **Settings** → **Environment Variables**):

| Name           | Value                    | Environments      |
|----------------|--------------------------|-------------------|
| `DATABASE_URL` | Your Neon **pooled** URL | Production, Preview |
| `DIRECT_URL`   | Your Neon **direct** URL | Production, Preview |

Use the same URLs from your local `.env`. Paste the full string (e.g. `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`).

Then click **Deploy**.

---

## 4. After deploy

- Your app will be at: `https://your-project.vercel.app`
- API: `https://your-project.vercel.app/api/health` and `https://your-project.vercel.app/api/cases`
- The React app is served from `/`; `/api/*` is handled by the Express serverless function.

---

## 5. Optional: run migrations from your machine

Migrations are not run automatically on Vercel. To apply new migrations to the same Neon DB:

```bash
# .env already has DATABASE_URL and DIRECT_URL
npx prisma migrate deploy
```

This updates the database; the next Vercel deploy will use the new schema.
