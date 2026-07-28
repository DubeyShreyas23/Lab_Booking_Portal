# 🚀 Launch guide — CAL Portal (free: Supabase + Render)

This is the app you already have, now storing data in **Supabase Postgres** and
deployed free on **Render**. No lab PC needed, reachable from anywhere.

> Which folder? **This one** (`CAL Lab`) is what we're launching. The `cal-portal`
> folder (Next.js) is a future rewrite — ignore it for now.

Do the accounts under a **lab-owned email** (see
[`../cal-portal/docs/ACCOUNTS_SETUP.md`](../cal-portal/docs/ACCOUNTS_SETUP.md) —
the GitHub/Supabase/Google/Vercel steps apply here too, except we deploy on
Render instead of Vercel).

---

## Step 1 — Supabase project (just the database)

1. <https://supabase.com> → sign in with the **lab GitHub** → **New project**
   `cal-portal`, region **South Asia (Mumbai)**, save the DB password.
2. When ready: **Project Settings → Database → Connection string → URI**, pick
   the **Session pooler** (port 5432). Copy it — this is your `DATABASE_URL`.

You do **not** need to run any SQL by hand — this app creates its own tables
automatically on first boot.

---

## Step 2 — Test locally first (catch issues before deploy)

In this folder:

```bash
npm install
cp .env.example .env
```

Edit `.env` and set just this to start:

```env
DATABASE_URL=postgresql://postgres.xxxx:PASSWORD@aws-0-...pooler.supabase.com:5432/postgres
SESSION_SECRET=any-long-random-string
NODE_ENV=development
```

Then:

```bash
npm run seed
npm start
```

Open <http://localhost:3000>. Because `NODE_ENV=development` and Google isn't set
yet, the **dev login box** appears — sign in as
`f20231386@hyderabad.bits-pilani.ac.in` (student) or
`sangan@hyderabad.bits-pilani.ac.in` (faculty) and click through:
book → approve as technician → approve as faculty.

**If anything errors, copy the terminal output to me and I'll fix it.** This is
the one debug cycle I mentioned.

You can also watch the data appear live in Supabase → **Table editor**.

---

## Step 3 — Google sign-in (for real students)

Follow ACCOUNTS_SETUP Step 3 to get a Google **Client ID + secret**. The
authorized redirect URI is your site URL + `/auth/google/callback`:

- local: `http://localhost:3000/auth/google/callback`
- production: `https://<your-app>.onrender.com/auth/google/callback`

Add both. Put the client id/secret in `.env` (local) and Render (production).

---

## Step 4 — Push to the lab GitHub

I'll give you exact commands once you send the repo URL. It'll be roughly:

```bash
git init
git add .
git commit -m "CAL portal on Supabase Postgres"
git branch -M main
git remote add origin https://github.com/<lab-org>/cal-portal.git
git push -u origin main
```

---

## Step 5 — Deploy on Render (free)

1. <https://render.com> → sign in with the **lab GitHub**.
2. **New → Blueprint** → pick the repo. Render reads [`render.yaml`](render.yaml)
   and creates the service.
3. Fill the env vars it asks for (the `sync:false` ones):
   - `DATABASE_URL` — the Supabase session-pooler URI
   - `PORTAL_URL` — your Render URL, e.g. `https://cal-portal.onrender.com`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_CALLBACK_URL` — `https://cal-portal.onrender.com/auth/google/callback`
   - `SEED_ADMIN_EMAIL` — the lab assistant's institute email
   - SMTP\_\* if you have a mailbox for notifications (optional)
4. Deploy. Tables auto-create on boot. Every `git push` now redeploys.

> Free Render web services sleep after ~15 min idle and wake on the next
> request (a few seconds' delay). Fine for a lab tool. Your **data is safe** in
> Supabase regardless — only the web process sleeps, not the database.

---

## Done

Students open the Render URL from any device, sign in with their institute
Google account, and book. Staff approve from their dashboards. You hand over by
handing over one lab email.

Send me: **(a)** any local error output from Step 2, and **(b)** the GitHub repo
URL. I'll get you through both.
