# Central Analytical Laboratory — Booking Portal

A replacement for the BITS Hyderabad CAL portal
(`https://onlinecal.bits-hyderabad.ac.in/`). Students book instruments from
their rooms, technicians approve, faculty supervisors give final approval, and
the lab assistant manages instruments and users.

**Stack:** Node.js · Express · EJS · **Postgres (Supabase)** · Passport (Google
OAuth). Deployed free on **Render**.

> 🚀 **To put this live, follow [`LAUNCH.md`](LAUNCH.md).** That's the current,
> supported path (Supabase + Render). The older `DEPLOYMENT.md` (lab-PC + SQLite)
> is kept only as an on-prem fallback and no longer matches the code, which now
> uses Postgres.

---

## Quick start (local)

```bash
npm install
cp .env.example .env          # set DATABASE_URL (Supabase) + SESSION_SECRET
npm run seed                  # creates tables + demo users + instruments
npm start
```

Open `http://localhost:3000`.

- **With Google OAuth credentials** in `.env` → sign in with Google.
- **Without credentials (dev)** → a dev login box appears on `/login` letting
  you sign in with just an institute email (no password).

Requires a `DATABASE_URL` pointing at a Postgres database (Supabase free tier).
Tables are created automatically on first boot / `npm run seed`.

---

## Architecture

```
                ┌──────────────────────────────────────────┐
HTTP request →  │  server.js                               │
                │  helmet · morgan · session · passport    │
                │  csrf · rate-limit · static · views      │
                └─────────────────┬────────────────────────┘
                                  ▼
        ┌──────────────────────────────────────────────────┐
        │  src/routes/         (thin HTTP handlers)        │
        │   ├ auth.js          login / callback / signup   │
        │   ├ student.js       book, cancel, list          │
        │   ├ approvals.js     technician + faculty queues │
        │   └ admin.js         lab-assistant panel         │
        └──────────┬───────────────────────────────────────┘
                   ▼   validate input with zod schemas
        ┌──────────────────────────────────────────────────┐
        │  src/services/       (business rules)            │
        │   ├ authService      Google OAuth, dev login     │
        │   ├ bookingService   slot math, approval flow    │
        │   ├ instrumentService                            │
        │   └ userService                                  │
        └──────────┬───────────────────────────────────────┘
                   ▼
        ┌──────────────────────────────────────────────────┐
        │  src/repos/          (data access)               │
        │   ├ userRepo · instrumentRepo · bookingRepo      │
        └──────────┬───────────────────────────────────────┘
                   ▼
                ┌──────────────────────────────────────────┐
                │  SQLite (data/cal.db) via better-sqlite3 │
                │   users · instruments · bookings ·       │
                │   audit_log                              │
                └──────────────────────────────────────────┘

src/lib/email.js      ← Nodemailer wrapper (console-fallback in dev)
src/lib/helpers.js    ← date/role/email helpers
src/errors.js         ← AppError, ValidationError, ConflictError, ...
src/middleware/*      ← auth guards, security stack, error handler
src/validators/*      ← zod schemas + parseOrThrow
views/                ← EJS templates (Tailwind via CDN)
```

### Why this shape

- **Routes don't touch SQL.** They validate input with Zod, call a service,
  catch typed errors, render or redirect.
- **Services own business rules.** Conflict detection, slot generation,
  email sequencing, approval transitions — all live here. Easy to unit-test.
- **Repos own SQL.** Swappable for Postgres later by changing only this folder.
- **Errors are typed.** `ValidationError`, `ConflictError`, `ForbiddenError`,
  etc. The global error handler maps them to HTTP responses + user flash.

### Security stack

- `helmet` — secure default headers + CSP
- `csrf-csrf` — double-submit cookie CSRF protection on every POST
- `express-rate-limit` — global + extra-strict on login routes
- `passport` + `passport-google-oauth20` — Google OAuth with domain check
- `express-session` — signed cookie, HttpOnly + SameSite=Lax
- Centralized error handler, no stack traces leaked in production
- Institute-domain whitelist enforced at OAuth and form layer
- All form fields validated with Zod before reaching services

---

## Roles & how they're separated

| Role | Lands on | Sees | Can do |
|---|---|---|---|
| **Student** | `/` | Their own bookings, instrument list | Submit, cancel |
| **Technician** | `/technician` | Pending bookings for instruments **assigned to them** | Approve → faculty / Reject with reason |
| **Faculty** | `/faculty` | Pending bookings where they are listed as **supervisor** | Approve → student / Reject with reason |
| **Admin** (lab assistant) | `/admin` | Everything | CRUD instruments, manage users/roles/supervisors, override any approval |

Access control is enforced by [requireRole](src/middleware/auth.js) middleware
on every route. A technician cannot reach the faculty queue, and vice
versa. Admin is permitted everywhere.

---

## Booking lifecycle

```
Student submits
       │
       ▼
pending_technician  ──(reject)──▶ rejected ─→ email student with reason
       │
       │ approve (only the instrument's assigned technician — or admin)
       ▼
pending_faculty     ──(reject)──▶ rejected
       │
       │ approve (only the student's supervisor — or admin)
       ▼
approved            ←─ email student "Lab Booking Approved"
       │
       │ cancel (student) — only before completion
       ▼
cancelled
```

Email is fired at every transition with copy that matches the official CAL portal.

---

## Setting up Google OAuth

1. Go to <https://console.cloud.google.com/apis/credentials>.
2. Create / select a project.
3. **OAuth consent screen** → "Internal" if your org has Google Workspace
   (your `bits-pilani.ac.in` domain), otherwise "External". Add the
   institute domain(s) under *Authorized domains*.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
5. Add the authorized redirect URI:
   ```
   http://localhost:3000/auth/google/callback
   ```
   For the lab machine, also add:
   ```
   http://lab-pc.local:3000/auth/google/callback   (or whatever hostname)
   ```
6. Copy the **Client ID** and **Client Secret** into `.env`:
   ```env
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
   ```
7. Restart the server. The login page now shows the Google button.

The server **only accepts** Google accounts whose email is on a domain
listed in `ALLOWED_DOMAINS`. Personal Gmail accounts are rejected.

---

## Demo accounts (after `npm run seed`)

| Role | Email |
|---|---|
| Admin | `admin@hyderabad.bits-pilani.ac.in` |
| Faculty | `sangan@hyderabad.bits-pilani.ac.in` |
| Technician | `tech.gc@hyderabad.bits-pilani.ac.in` |
| Technician | `tech.cod@hyderabad.bits-pilani.ac.in` |
| Technician | `p20250086@hyderabad.bits-pilani.ac.in` |
| Student | `f20231386@hyderabad.bits-pilani.ac.in` |

With Google OAuth, only people with the real institute Google accounts
matching these emails can sign in. In dev mode you can sign in as any of
these by typing the email into the dev-login box.

---

## Deploying on the lab machine

1. Install Node 20+.
2. Copy the folder to the machine.
3. `npm install --omit=dev` (or `npm ci`).
4. Edit `.env`:
   - `NODE_ENV=production`
   - `SESSION_SECRET` and `CSRF_SECRET` (long random strings)
   - `PORTAL_URL=http://<hostname>:3000`
   - Google credentials (see above)
   - SMTP credentials (so notifications go out)
5. `npm start`. Use `pm2`, `nssm`, or Windows Task Scheduler to keep it
   alive after reboots.
6. Open the URL from any device on the institute network.

State lives entirely in `data/cal.db` — back that file up regularly.
