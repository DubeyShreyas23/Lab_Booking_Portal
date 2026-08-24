# BEST Lab Booking Portal — Master Document

**For: the developer (present or future) who needs to understand this system completely.**
**Author: Shreyas Dubey (F20231386) · Built for the BEST Lab, BITS Pilani Hyderabad Campus**
**Live at: https://cal-portal.onrender.com**
**Repo: https://github.com/DubeyShreyas23/Lab_Booking_Portal**

This document exists so that anyone — including me, six months from now — can
pick this project up, understand every decision that was made, why it was
made that way, what's fragile, and what to do next. It is intentionally long.
Read the section you need; don't feel obligated to read all of it at once.

---

## 1. What this actually is

A booking system for lab instruments at the BEST Lab (BITS Environmental
Science & Technology Lab), replacing an informal WhatsApp/verbal coordination
process with a proper online workflow:

```
Student submits a booking request
        │
        ▼
Equipment Incharge approves or rejects   (1st-level, technical fitness check)
        │
        ▼
Faculty supervisor approves or rejects   (2nd-level, final sign-off)
        │
        ▼
Booking is confirmed — student notified by email
```

Every step sends an email automatically. Every instrument has exactly one
person responsible for it. There's also a complaints system, a PDF reporting
tool, an admin panel for managing the 73 real instruments across three labs
(PURSE, EBT, FSM), and a door-display "kiosk" view.

It replaced an earlier plan to fully rewrite this on Next.js + Supabase +
Vercel (following a senior's advice) — that plan is parked in a **separate,
unfinished** project at `../cal-portal`. This document is about the app that
is actually **live**, which kept the original Node/Express stack and simply
swapped its database from local SQLite to hosted Postgres so it could run in
the cloud fast. That pivot decision — "ship what works" over "rebuild it
properly" — is probably the single most consequential decision in this
project's history, and it was the right one under the time constraint.

---

## 2. Tech stack, and why each piece was chosen

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js ≥20 | Already the stack of the original app; no reason to change it. |
| Web framework | Express 4 | Minimal, well-understood, no framework magic to fight. |
| Templates | EJS | Server-rendered HTML, no client build step, no bundler — you can edit a `.ejs` file and refresh. Deliberately low-tech for maintainability by a non-specialist successor. |
| CSS | Tailwind via CDN `<script>` tag | Zero build step. Trade-off: ships the whole Tailwind JIT compiler to the browser on every page load (slower than a compiled stylesheet) — acceptable at this traffic scale, but the first thing to fix if performance ever becomes a complaint. |
| Database | PostgreSQL, hosted on **Supabase** (free tier) | Originally SQLite (a single file on disk). Moved to Postgres so the app could run on a stateless host (Render) without losing data between deploys/restarts. Supabase = free managed Postgres with a nice dashboard and SQL editor — used constantly throughout this project as the "break glass" tool for direct data fixes. |
| DB driver | `pg` (node-postgres), **raw SQL, no ORM** | Deliberate. An ORM would have added a learning curic curve and a layer of abstraction between "what I write" and "what SQL runs" — at this project's complexity, hand-written parameterized SQL is more debuggable, especially by someone who isn't a full-time backend developer. |
| Sessions | `express-session` + `connect-pg-simple` | Session store lives in Postgres too (table `user_sessions`, auto-created), so login state survives app restarts and works across Render's ephemeral filesystem. |
| Auth | Passport.js + `passport-google-oauth20` | Google OAuth was specifically requested (BITS institute emails are Google Workspace accounts). Restricted to `@hyderabad.bits-pilani.ac.in` / `@pilani.bits-pilani.ac.in` at the OAuth callback. |
| CSRF protection | `csrf-csrf` (double-submit cookie pattern) | See §9 for two nasty bugs this caused. |
| Security headers | `helmet` | Sets a Content-Security-Policy and other headers. Also caused a real bug (§9). |
| Rate limiting | `express-rate-limit` | Loosened significantly in non-production to avoid blocking normal development traffic. |
| Email — **actual sender** | **Brevo HTTP API** (via native `fetch`, no SDK) | See §8 — this is the single biggest "war story" of the whole build. SMTP does not work on Render's free tier. |
| Email — fallback | `nodemailer` (SMTP) | Kept as a fallback path for any future host that doesn't block SMTP (e.g. if this ever moves off Render). Not used in production today. |
| PDF generation | `pdfkit` | For the usage reports admins can download. |
| Validation | `zod` | Input validation on booking/instrument/user forms. |
| Dates | `dayjs` | Lightweight, mutation-free date math for the booking-slot grid logic. |
| Logging | `morgan` | Access logs; visible in Render's log viewer, which was the *only* debugging tool available for a lot of this project (see §12). |
| Hosting | **Render** (free web service tier) | Free, git-push-to-deploy, but has real limitations (§12). |
| Source control | GitHub, personal account `DubeyShreyas23` | **Not yet a lab-owned account** — flagged as a handover risk, see §13. |

Full dependency list is in `package.json`. There is intentionally **no
frontend framework, no bundler, no TypeScript, no build step of any kind.**
`git push` → Render runs `npm install` → `node server.js`. That's the entire
deploy pipeline. This was a deliberate simplicity choice given the developer
(a student, solo, alongside coursework and an internship) needed to move
fast and hand this off to non-specialist successors eventually.

---

## 3. Architecture

Four layers, each with one job:

```
views/*.ejs          ← what the browser sees (server-rendered HTML)
        │
src/routes/*.js      ← HTTP layer: parse request, call a service, render/redirect
        │
src/services/*.js    ← business logic: booking rules, approval chain, email triggers
        │
src/repos/*.js        ← data access: the ONLY files that contain raw SQL
        │
src/db.js            ← the Postgres connection pool + schema + query helpers
```

**The rule that was followed throughout:** routes never touch SQL directly,
and only repos touch SQL. This made it possible to convert the entire data
layer from synchronous SQLite calls to async Postgres calls (§6) as a single
mechanical pass across ~15 files without having to reason about business
logic at the same time.

`server.js` is the composition root: it builds the Express app, wires up all
middleware in a specific order (this order matters — see §9), mounts every
route module, and has the startup sequence (`db.init()` → `appConfig.refresh()`
→ optional first-admin seed → `app.listen()`).

### File-by-file map (33 JS files, ~2,750 lines)

```
server.js                        Composition root / startup

src/db.js                        pg Pool, schema DDL, async query helpers (all/get/run/tx)
src/errors.js                    Typed error classes (ValidationError, ConflictError, etc.)

src/lib/
  email.js                       sendMail() dispatcher + every email template (see §8)
  helpers.js                     Domain checks, role→label mapping, date formatting
  appConfig.js                   Cached, DB-backed "site name" (used in nav/footer/emails)

src/middleware/
  auth.js                        requireAuth / requireRole guards
  security.js                    helmet CSP, csrf-csrf, rate limiters
  errorHandler.js                Central error → flash-message-and-redirect mapping

src/services/                    Business logic — the "why", never raw SQL
  authService.js                 Passport Google strategy + dev-login fallback
  bookingService.js              Booking-slot grid, conflict detection, approval chain
  instrumentService.js           Thin wrapper around instrumentRepo with validation
  userService.js                 Thin wrapper around userRepo with validation
  complaintService.js            Complaint lifecycle + notification triggers
  pdfService.js                  Renders the usage-report PDF via pdfkit

src/repos/                       Data access — the ONLY files with raw SQL
  userRepo.js  instrumentRepo.js  bookingRepo.js  holidayRepo.js
  reportRepo.js  complaintRepo.js  settingsRepo.js

src/routes/                      HTTP layer
  auth.js                        /login, Google OAuth callback, dev-login, logout
  student.js                     Booking flow + "My bookings" (open to ALL roles, see §7)
  approvals.js                   /technician and /faculty approval queues
  bookings.js                    Booking detail page (GET /bookings/:id)
  admin.js                       Everything under /admin/* — the biggest file by far
  reports.js                     Usage report page + PDF download
  complaints.js                  Raise/list/detail/update complaints
  kiosk.js                       Public, unauthenticated /kiosk display
  pages.js                       Public /contact page

src/validators/
  schemas.js                     zod schemas for form inputs
  parse.js                       parseOrThrow() helper

src/seed.js                      Demo-data seeder (superseded by real data, see §11)
src/import-equipment.js          One-time import of the real 73-instrument spreadsheet
src/data-equipment.json          The parsed spreadsheet data that import-equipment.js reads
```

`views/` mirrors `routes/` — `views/admin/*.ejs` for admin.js, `views/student/*.ejs`
for student.js, and so on, plus `views/partials/` for the shared head/nav/foot/flash.

---

## 4. Database schema — every table, and an honest note on two that are unused

All tables are created idempotently in `src/db.js`'s `init()` function
(`CREATE TABLE IF NOT EXISTS`), plus a small set of `ALTER TABLE ... ADD
COLUMN IF NOT EXISTS` calls for columns added after the initial launch. This
means **there is no formal migration system** — schema changes are additive
SQL statements appended to `init()`, which runs on every server boot. This
works fine for a project this size but would not scale to a team; a future
maintainer doing anything structurally bigger (renaming a column, changing a
type) should introduce a real migration tool (e.g. `node-pg-migrate`) rather
than keep hand-appending `ALTER TABLE` calls.

| Table | Purpose | Status |
|---|---|---|
| `users` | Every person: student / technician (labeled "Equipment Incharge" in the UI, see §7) / faculty / admin. `supervisor_id` self-references for the (now largely unused, see §7) per-student default supervisor. | **Active, core** |
| `instruments` | The 73 real instruments. `lab` (PURSE/EBT/FSM), `code` (auto-generated PUR-XX/EBT-XX/FSM-XX), `booking_mode` (hourly/daily), `status` (working/repair/retired), `technician_id` = the Equipment Incharge. | **Active, core** |
| `bookings` | One row per booking request, `status` walks through the approval chain. `starts_at`/`ends_at` are stored as **TEXT ISO strings**, not native `timestamptz` (see note below). | **Active, core** |
| `booking_events` | Append-only audit trail per booking (submitted → technician_approved → faculty_approved, etc.) — powers the timeline UI on the booking detail page. | **Active** |
| `audit_log` | An older, simpler audit table (booking_id, actor_id, action, note). Predates `booking_events` and was kept rather than removed. | **Active but partially redundant with `booking_events`** — a future cleanup could consolidate these into one table. |
| `holidays` | Lab-closed dates, optionally scoped to one instrument. Blocks new bookings on those dates. | **Active** |
| `system_settings` | Key/value config: `lab_name`, `contact_person`, `default_supervisor_id`. Read through `src/lib/appConfig.js` (cached in memory, refreshed on save). | **Active** |
| `complaints` / `complaint_events` | The complaints module — raise, assign, resolve, with its own audit trail. | **Active** |
| `user_sessions` | Auto-created by `connect-pg-simple`. Not in `db.js`'s schema block. | **Active** |
| `notifications` | *Intended* to log every email sent (to/subject/body/status), for dispute resolution. **The table exists but nothing in the codebase writes to it** — `src/lib/email.js` logs to `console.log`/`console.error` instead (visible in Render's log viewer), never inserts a row here. | **Dead schema — real gap, see §13** |
| `instrument_files` | *Intended* for SOP/manual/safety-doc links per instrument. **Nothing reads or writes this table anywhere in the code.** | **Dead schema — unused, low priority** |

**Why timestamps are TEXT, not `timestamptz`:** the original SQLite version
stored ISO datetime strings because SQLite has no native date type. When the
data layer was converted to Postgres, this was **kept as TEXT** rather than
migrated to `timestamptz`, specifically so that every place in the code that
does `booking.starts_at.slice(0, 10)` or `.replace('T', ' ')` on a string
kept working unchanged. This was the pragmatic choice under time pressure —
it avoided touching ~20 call sites — but it means the database **cannot use
native Postgres date/time functions or indexes properly**; comparisons like
"is this booking in the future" are done with `starts_at::timestamptz > now()`
casts at each call site instead of relying on the column's real type. A
future refactor should migrate these columns to `timestamptz` and update the
~20 call sites that manipulate them as strings — annoying, but mechanical.

---

## 5. Authentication & the role model

### How login works

1. User clicks "Continue with Google" → Google OAuth flow → callback hits
   `src/services/authService.js`'s Passport strategy.
2. The strategy checks the returned email against `isInstituteEmail()`
   (`src/lib/helpers.js`) — domain must be in `ALLOWED_DOMAINS` env var
   (currently `hyderabad.bits-pilani.ac.in,pilani.bits-pilani.ac.in`).
   Anyone outside those domains is rejected at the callback, before a
   session is ever created.
3. If this is the person's first login, a `users` row is auto-created with
   `role = 'student'`. **Nobody can self-promote to technician/faculty/admin**
   — that only happens via the admin Users page, or via a direct SQL
   `UPDATE` in Supabase (used repeatedly during this project's bootstrapping,
   see §11).

### Dev-mode login (local development only)

When `GOOGLE_CLIENT_ID` is unset **and** `NODE_ENV !== 'production'`, the
login page shows an extra "sign in with just an email, no OAuth" box
(`authService.isDevMagicAllowed()`). This exists purely so the app is
testable on a laptop without needing real Google OAuth credentials
configured locally. It is hard-disabled in production by the `NODE_ENV`
check — verify this env var is actually set to `production` on Render if
you ever worry about this being reachable live.

### The role model, and the dual-role problem

Four roles, one column (`users.role`, a Postgres `CHECK` constraint):
`student | technician | faculty | admin`.

**A person can only hold one role at a time.** This became a real problem:
the lab's Equipment Incharges are PhD students who *also* need to book other
instruments for their own research — i.e. they need to be both a booker
(historically gated to `role === 'student'`) and an approver
(`role === 'technician'`) simultaneously.

**The fix (see `src/routes/student.js`):** booking access was decoupled from
role entirely. **Any authenticated user, regardless of role, can book an
instrument.** Role now only *adds* capabilities (approval queues, the admin
panel) on top of a baseline that everyone has; it never *removes* the
ability to use the lab as yourself. Concretely:
- `router.post('/book/:id', ...)` and `/bookings/:id/cancel` have no
  `requireRole()` guard anymore — just `requireAuth`.
- A new route, `GET /my-bookings`, lets non-student roles see their own
  bookings without disturbing the `/` auto-redirect that sends
  technician/faculty/admin to their primary dashboard on login.
- The nav bar shows "My bookings" / "Book equipment" links to every role.

This is the right long-term model for a real research lab where almost
everyone wears more than one hat. If this project grows, the next natural
step is a proper many-to-many `user_roles` table instead of a single enum
column — noted in §13 as a "if this grows" item, not an urgent one.

**Self-approval is allowed, on purpose.** An Equipment Incharge who books
their own assigned instrument can approve their own request. This was a
conscious decision (option discussed and chosen explicitly), not an
oversight — they already have physical control of the instrument, so
requiring someone else to rubber-stamp it added friction with no real safety
benefit.

**Role display labels vs. stored values:** the UI shows "Equipment Incharge"
everywhere a `technician` role would otherwise show. This is a pure display
mapping — `src/lib/helpers.js`'s `roleLabel()` function, exposed to every
EJS view as `res.locals.roleLabel`. **The stored database value is still
literally `'technician'`** — nothing downstream (routes, SQL, the `CHECK`
constraint) needed to change. This is a good pattern to keep in mind: when a
naming request is purely cosmetic, solve it at the display layer, not by
touching the data model.

---

## 6. The SQLite → Postgres conversion (a case study in doing a risky migration safely)

The app was originally built against `better-sqlite3` — a **synchronous**,
single-file, zero-config database. It had to move to Postgres to run on a
stateless host. This was not a small change: every repo function, every
service function that called a repo, and every route that called a service
had to change from synchronous to `async/await`, and every piece of SQL had
to be translated from SQLite dialect to Postgres dialect.

**Translation table used throughout:**

| SQLite | Postgres |
|---|---|
| `db.prepare(sql).get(...)` | `await db.get(sql, params)` |
| `db.prepare(sql).all(...)` | `await db.all(sql, params)` |
| `db.prepare(sql).run(...)` | `await db.run(sql, params)` |
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` |
| `info.lastInsertRowid` | `INSERT ... RETURNING id`, read `row.id` |
| Named params `@x` | Positional params `$1, $2, ...` |
| `date(x)` | `substr(x, 1, 10)` (since dates are stored as TEXT, see §4) |
| `datetime('now')` comparison | `x::timestamptz > now()` |
| `INSERT OR IGNORE` | `INSERT ... ON CONFLICT DO NOTHING` |
| `COUNT(*)` | `COUNT(*)::int` (Postgres returns `bigint` otherwise, which breaks naive JS arithmetic) |
| `db.transaction(fn)()` (sync) | `await db.tx(async (client) => { ... })` — see `src/db.js` |

**Why this was safe to do as a mechanical pass:** because the architecture
(§3) meant SQL only lived in `src/repos/*.js`. Converting the data layer
never required touching business logic in `src/services/*.js` — only adding
`await` in front of repo calls and making the enclosing functions `async`.

**A real risk accepted here, worth knowing about:** this conversion could
not be tested by the AI assistant that helped build it — the development
sandbox's Windows Application Control policy blocked the native
`better-sqlite3` binary, and later, even after moving to the pure-JS `pg`
driver, there was **no `DATABASE_URL` configured in that sandbox**, so it
could never open a real connection to Supabase. Every database-touching
change from that point forward was verified only by: (a) `node --check` for
syntax, (b) `require()`-ing every changed module to confirm the dependency
graph loads without throwing, and (c) the human developer running `npm start`
locally against the real Supabase database and reporting back what broke.
This worked, but it is **not the same guarantee as an automated test suite**
— there is currently no automated test coverage at all (see §13).

---

## 7. The booking engine — how slot conflicts are actually prevented

Two booking modes, chosen per-instrument (`instruments.booking_mode`):

### Hourly mode (`src/services/bookingService.js` → `buildDayGrid`)

Renders a day as a grid of fixed-width cells (default 30 min,
`slot_step_minutes`). For each cell, the server computes:
- `taken` — does an existing booking overlap this cell?
- `past` — is this cell before "now" (IST, see §12 for why this matters)?
- `blocked` — taken OR past OR the whole day is a holiday for this instrument
- `selectable` — **can a booking of the required duration actually START
  here** — i.e. are the next N cells (however many the instrument's
  `experiment_minutes + maintenance_minutes` needs) all unblocked?

**This two-pass computation was a deliberate fix for a real bug.** The
original version only marked individual cells as taken/free; a student could
click a cell that *looked* free but where the multi-cell run required for
that instrument would overlap a later booking, or run past closing time, or
start in the past — and the server would then reject the submission with a
confusing error. Computing `selectable` server-side, and having the
front-end JS only allow clicks on cells the server has already validated as
genuinely bookable, eliminated that entire class of bug.

### Daily mode (`createDailyBooking`)

For multi-day equipment (30-day bioreactor runs, etc.) — student picks a
**start date**, the end date is `start + instrument.duration_days` computed
client-side for display and re-validated server-side. Existing overlapping
bookings for that instrument are listed on the page so the student can see
what to avoid before picking a date.

### Conflict prevention under concurrency

Both booking paths (`createBooking` and `createDailyBooking`) wrap their
conflict check + insert in a **database transaction**
(`await db.tx(async (client) => { ... })`), using the *same* Postgres client
for both the `SELECT ... FOR conflict` check and the `INSERT`. This closes
the race window where two students could submit overlapping bookings at the
same instant, both pass the "is it free?" check, and both get inserted. The
transaction additionally checks whether *the same student* already has an
overlapping booking on that instrument, with a distinct, friendlier error
message than the generic "someone else took it" case.

---

## 8. The email pipeline — the biggest debugging saga of this project

This deserves its own section because it took real effort to diagnose and
is exactly the kind of thing a future maintainer needs to understand *why*,
not just *what*.

### What happened

1. Initial implementation: `nodemailer` over SMTP, pointed at Brevo's
   `smtp-relay.brevo.com:587`, with real credentials configured.
2. Locally, this worked (or would have — never actually got network-tested
   locally either, since local dev used the same host-blocking pattern via
   a residential/office network in some tests). On **Render**, clicking
   "Send test email" caused the page to hang — **not error, just hang** —
   for 5+ minutes.
3. First fix: added `connectionTimeout` / `greetingTimeout` / `socketTimeout`
   to the nodemailer transport config (they were previously unset, so a
   silently-dropped connection just waited on Node's default, extremely long,
   TCP timeout). This turned the hang into a clear `Connection timeout`
   error within ~10 seconds — a real improvement even though it didn't fix
   the underlying problem, because it made the failure *diagnosable*.
4. With a clear error in hand, the diagnosis became obvious: **Render's free
   tier blocks outbound SMTP ports (587/465/25) entirely**, as an anti-abuse
   measure common across free-tier hosts (spammers love free compute + open
   SMTP relays). No SMTP configuration change on any port would ever have
   fixed this — it's a network-level block on the platform, not a
   credentials or configuration problem.
5. **Real fix:** switched the primary send path to **Brevo's HTTP API**
   (`POST https://api.brevo.com/v3/smtp/email`), called with the native
   `fetch()` available in Node ≥18 (no new dependency needed). HTTP over
   port 443 is never blocked by these platforms. `BREVO_API_KEY` (a
   *different* credential from the SMTP username/password) is the only new
   env var required. SMTP is kept as a **fallback path** — if
   `BREVO_API_KEY` isn't set, it falls through to the old nodemailer/SMTP
   code, which would still work on a host that doesn't block SMTP.

See `src/lib/email.js` — `sendViaBrevoApi()` is the primary path, the
original `getTransporter()`/nodemailer code is the fallback, and `sendMail()`
tries the API first, then SMTP, then finally a `console.warn`-only "mocked"
path if neither is configured (used for local dev without any email
credentials at all).

### The lesson for whoever touches this next

**If email stops working after a host migration, check this first.** Many
free/cheap hosting platforms (Render, Heroku's old free tier, Railway on
some plans) block outbound SMTP by default. The fix is never "try a
different port" — it's "use the provider's HTTP API instead of SMTP." Brevo,
SendGrid, Mailgun, Postmark, and most others all offer one.

### Observability that was added specifically to make this debuggable by a non-developer

- Every send attempt logs a clear line to the console (visible in Render's
  Logs tab): `[email] SENT (Brevo API) to X — "subject" — id=...`,
  `[email] FAILED (...) to X — "subject": <reason>`, or
  `[email] SKIPPED "subject" — no recipient`.
- An **admin-only "Send test email" button** (Settings page,
  `POST /admin/test-email`) that reports back the *exact* outcome in plain
  language: sent successfully, SMTP not configured, or the raw provider
  error — without needing to read server logs at all. This was built
  deliberately so the lab's non-developer admin (the user of this system)
  could self-diagnose delivery problems going forward, rather than needing
  to come back to a developer every time.
- A second admin tool, **"Announce" / broadcast**
  (`GET/POST /admin/broadcast`), reuses the exact same `sendMail()` function
  to send one message to every real lab member (student/technician/faculty,
  admin excluded) — doubling as a full-scale test of the pipeline across
  every real recipient at once, with per-recipient sent/failed results shown
  after sending.

---

## 9. Security stack, and two real bugs it caused

- **Helmet** sets a Content-Security-Policy. **A real bug**: Helmet's default
  CSP sets `script-src-attr: 'none'`, which silently blocks inline event
  handlers (`onchange="..."`, `onsubmit="..."`) — which this app's views use
  for the date picker, the inventory status dropdown, and confirm dialogs.
  Symptom: **changing the booking date picker did nothing** — no error, the
  page just didn't respond, because the browser was silently discarding the
  inline handler per the CSP. Fixed by adding `scriptSrcAttr: ["'unsafe-inline'"]`
  to the Helmet config in `src/middleware/security.js`. **Lesson:** a
  silently-blocked inline handler is one of the hardest classes of bug to
  spot, because there's no console error in most browsers for CSP
  `script-src-attr` violations by default — check the CSP config first if a
  UI control that clearly has an `onclick`/`onchange` attribute "does
  nothing" with no visible error.

- **CSRF (`csrf-csrf`, double-submit cookie pattern)** caused a real
  "Session expired" bug. Root cause: the CSRF middleware was configured with
  `overwrite: true`, meaning **every single page render minted a brand-new
  CSRF cookie**, including incidental requests like the browser's automatic
  `/favicon.ico` fetch. If that favicon request landed *after* a form was
  already rendered on screen but *before* the user submitted it, the token
  baked into the form no longer matched the (now-rotated) cookie, and
  submission failed with a confusing "session expired" message. Fixed by
  setting `overwrite: false` (reuse the existing valid token across
  incidental requests) with `validateOnReuse: false` (mint a fresh token
  only when the session's identity actually changes, e.g. right after
  login). See `src/middleware/security.js`, `exposeCsrf()`.

- **A related naming gotcha:** `csrf-csrf` v3's actual option name is
  `getTokenFromRequest` — using the more intuitive-sounding
  `getCsrfTokenFromRequest` (extra "Csrf") **fails silently**, falling back
  to reading only an `x-csrf-token` header, which plain HTML forms never
  send. If CSRF checks ever start failing en masse after a `csrf-csrf`
  version bump, check the option names against that release's actual API
  first.

- **Rate limiting** (`express-rate-limit`) is deliberately loosened outside
  production (`isProd` check in `security.js`) — the login limiter alone was
  hit repeatedly during development/testing and had to be raised from 30 to
  1000 requests per 10-minute window in non-prod to stop blocking normal
  iterative testing.

- **Secrets hygiene, honestly stated:** during this project's build, both the
  Supabase database password and a Brevo API key were pasted directly into
  the chat conversation with the AI assistant that helped build this system,
  in order to get them configured in Render (the AI does not have direct
  access to Render or Supabase dashboards and cannot enter secrets into
  third-party UIs on the user's behalf — the user had to do this themselves,
  and pasted the values into chat as part of that process). **Both were
  flagged for rotation** at the time. **Anyone auditing this project should
  confirm the Supabase DB password and the Brevo API key currently in use
  are NOT the ones that were ever pasted into any chat/AI conversation
  transcript**, and rotate them if there's any doubt.

---

## 10. Admin tooling — built to make the non-developer admin self-sufficient

Everything under `/admin/*` (`src/routes/admin.js`, by far the largest
route file). A recurring design principle throughout this section: **when
something needed a one-off data fix, build a reusable admin UI control for
it, don't just run a one-time script** — because the person operating this
system day-to-day is not a developer and needs to be able to fix things
themselves later.

| Feature | Route | What it's for |
|---|---|---|
| Dashboard | `/admin` | Counts (instruments, users, pending approvals) + recent activity |
| Equipment Inventory | `/admin/inventory` | Total/Working/Repair/Booked-now/Available counts, lab filter, inline auto-saving status dropdown **and** inline auto-saving Equipment Incharge assignment dropdown per instrument |
| Instruments CRUD | `/admin/instruments` | Add/edit an instrument's full detail (durations, hours, incharge) |
| Users | `/admin/users` | Change anyone's role, supervisor, department; **per-user delete** button (see below); pre-register a user by email before they've ever logged in |
| Holidays | `/admin/holidays` | Lab-closed dates, whole-lab or per-instrument, blocks new bookings |
| Settings | `/admin/settings` | Editable site name (cached, see `appConfig.js`), default faculty supervisor, contact person shown in email footers, **"Send test email"** diagnostic tool |
| Reports | `/reports` | Filterable usage table + downloadable PDF (via `pdfService.js`), auto-scoped so a technician only sees their own instruments' data |
| Broadcast / "Announce" | `/admin/broadcast` | Send one email to every real lab member, with the full recipient list shown before sending — see §8 |
| Clean up demo data | button on Dashboard | One click to deactivate the 5 original placeholder instruments and remove demo user accounts — safely skips anything actually referenced by real bookings |

**Per-user delete, and why it needed a transaction:** deleting a user who
had ever been referenced as a booking's `supervisor_id`, an instrument's
`technician_id`, or an event's `actor_id` would fail on a foreign-key
constraint. The delete route (`POST /admin/users/:id/delete`) wraps the
whole operation in `db.tx()`: it first nulls out every *optional* reference
to that user (instrument technician, instrument creator, booking supervisor,
booking technician, event actor, notification recipient, complaint
assignee), then deletes the row. It deliberately does **not** null out a
user's *own* bookings (`bookings.student_id`, `NOT NULL`) or *own* raised
complaints (`complaints.raised_by`, `NOT NULL`) — if someone has real
history as a booker, the delete correctly fails and the admin is told to
change their role instead of destroying data. This was exactly the mechanism
needed to cleanly remove a leftover demo faculty account
(`rganesan@...`, "Dr Ramakrishnan Ganesan") that had been referenced as a
supervisor on test bookings.

---

## 11. How the real equipment and incharge data got into the system

This was one of the more interesting pieces of the whole build — reconciling
messy, human-authored spreadsheets against each other programmatically.

**Sources:**
1. `BEST Lab List of Equipments.xlsx` — 73 individual instrument rows
   (3 sheets: PURSE Lab, EBT Lab, FSM Lab), with make, parameters, analysis
   duration, Major/Minor classification.
2. `BEST Lab List of Incharges.xlsx` — 32 **grouped** rows (e.g. "10 Litre
   Anaerobic Bioreactor (6 No.)" as one row), each tagged with an incharge's
   **first name only** ("Dimple", "Bala", "Pallavi", "Ngaka", "Ravindra",
   "Sandhya").
3. A screenshot of a Google Groups email thread, whose recipient list was
   the only place full names were paired with actual institute email
   addresses.

**Pipeline built:**
1. `src/data-equipment.json` — the 73-row equipment list, hand-transcribed
   from the spreadsheet into structured JSON (lab, name, duration→mode/value,
   category).
2. `src/import-equipment.js` — reads that JSON, auto-generates a stable code
   per instrument (`PUR-01`, `PUR-02`, ... `EBT-01`, ... `FSM-01`, ...,
   numbered in spreadsheet row order within each lab), and **upserts** into
   `instruments` (safe to re-run — matches by `code`). Also deactivates the
   5 original placeholder/demo instruments (`GC`, `COD`, `HPLC`, `FTIR`,
   `UV`) in the same run.
3. A one-off Python script (not committed — generated, run, and deleted
   during the session) cross-referenced the 32 grouped incharge-sheet rows
   against the 73 individual DB rows — expanding "(6 No.)"-style groups to
   all matching individual instrument codes — and matched first names to
   full email addresses from the screenshot. Two genuine ambiguities were
   resolved by human judgment and explicitly flagged to the user for
   sign-off rather than silently guessed:
   - The spreadsheet listed "Microscope" as being in PURSE Lab; the actual
     imported record has it in FSM Lab. Assigned by instrument identity
     (the one Magnus-brand microscope), trusting the database location over
     the sheet.
   - "Weighing Balance (Large Scale)" vs. plain "Weighing Balance" in EBT
     Lab was ambiguous against 3 actual DB rows (1 platform + 2 tabletop
     models); resolved with a reasonable assumption, flagged for review.
4. The 26 remaining instruments not mentioned in the incharges sheet
   (support equipment — fridges, pumps, power supplies) were round-robin
   distributed across additional students from the screenshot, balanced so
   no one got more than 4.
5. **This was later revised** — those additional students turned out to be
   part-time and shouldn't have been incharges at all. A second script
   reassigned all 26 leftover instruments across only the 6 primary
   incharges (greedy-balanced against their *existing* load, landing at
   13/12/12/12/12/12), and reverted the 8 part-timers' role back to
   `student`.
6. Every one of these bulk data operations was delivered as a **SQL script
   for the user to run themselves in the Supabase SQL Editor** — never
   executed directly by the AI assistant, because the assistant had no
   `DATABASE_URL` configured in its sandbox and could not reach the live
   database at all (see §6). Every script ended with a `SELECT` sanity-check
   query so the human running it could confirm the result before trusting it.

**Takeaway for future data-import work:** when reconciling multiple
human-authored spreadsheets with inconsistent naming/grouping, don't try to
do it by eye — parse everything into structured data, write the matching
logic in code (even a disposable script), and *always* print a verification
tally (counts per person, total instruments accounted for) before generating
the SQL that actually changes anything.

---

## 12. Deployment & infrastructure

```
GitHub (DubeyShreyas23/Lab_Booking_Portal, main branch)
        │  git push
        ▼
Render (free web service)  ──────────────► Supabase (free Postgres)
  - npm install && node server.js               - all application data
  - env vars hold all secrets                    - session store table
  - auto-redeploys on every push                 - accessed only via DATABASE_URL
        │
        ▼
Brevo (email API) — outbound notifications only
```

**Known Render free-tier limitations, both encountered and worth planning
around:**
- **Outbound SMTP is blocked.** Covered exhaustively in §8. Use HTTP APIs
  for any third-party integration that might otherwise assume SMTP/raw TCP.
- **The service sleeps after ~15 minutes of no traffic**, and the first
  request after that takes a few seconds to "wake" the container. This is
  cosmetic (a slow first load), not a data-loss risk — the database is
  always live and separate from the web process. If this becomes annoying
  enough to matter, Render's paid tier removes it; a free workaround is an
  external uptime-pinger hitting `/healthz` every ~10 minutes (not currently
  set up).
- **The server's system clock is UTC**, not IST. This caused a real bug:
  before it was fixed, the kiosk clock, the booking day-grid's "is this slot
  in the past" logic, and "what is today's date" were all computed 5.5 hours
  wrong on the live server (though correct on the developer's local IST
  machine, which is why it wasn't caught until after deploy). Fixed with a
  single line at the very top of `server.js`, before any other code runs:
  `process.env.TZ = process.env.TZ || 'Asia/Kolkata';`. Belt-and-suspenders:
  also set `TZ=Asia/Kolkata` as a Render environment variable directly.

**Environment variables required in production** (set in Render → your
service → Environment):

```
DATABASE_URL              Supabase Postgres connection string (session pooler, port 5432)
SESSION_SECRET            Long random string
CSRF_SECRET                Long random string
PORTAL_URL                 https://cal-portal.onrender.com
ALLOWED_DOMAINS             hyderabad.bits-pilani.ac.in,pilani.bits-pilani.ac.in
GOOGLE_CLIENT_ID            From Google Cloud Console OAuth client
GOOGLE_CLIENT_SECRET
GOOGLE_CALLBACK_URL          {PORTAL_URL}/auth/google/callback
BREVO_API_KEY                Brevo → SMTP & API → API Keys (NOT the SMTP key)
MAIL_FROM_NAME               BEST Lab
MAIL_FROM_ADDRESS            The Brevo-verified sender address
SEED_ADMIN_EMAIL             First admin, auto-promoted on boot if no admin exists yet
NODE_ENV                     production  (also gates the dev-login fallback OFF, see §5)
TZ                           Asia/Kolkata
```

`SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` are supported as a fallback (§8) but
not required if `BREVO_API_KEY` is set.

---

## 13. Known risks, technical debt, and things a future maintainer should know

Ranked roughly by how much they matter:

1. **All infrastructure accounts (GitHub, Supabase, Render) are under the
   original developer's personal accounts**, not a lab-owned identity. This
   was explicitly flagged early in the project (following advice from the
   developer's senior, who'd been burned by exactly this on a prior
   project) but **not yet acted on**. If the developer graduates or loses
   access before this is migrated, whoever inherits this project cannot get
   in. **Action needed:** create a lab-owned email, transfer the GitHub
   repo/org, transfer the Supabase project, transfer the Render service —
   all support ownership transfer without breaking the live URL.
2. **No automated tests.** Every change during this build was verified by
   (a) syntax checks, (b) manually loading the module graph, and (c) a human
   clicking through the live app. This is fragile — a future change could
   silently break something with no safety net. At minimum, the booking
   conflict-detection logic (§7) and the approval-chain state transitions
   (§7/§10) would benefit most from unit tests, since they're the parts
   with real correctness requirements (double-bookings, wrong-person
   approvals).
3. **`notifications` and `instrument_files` tables exist in the schema but
   are completely unused** (§4). Either wire them up (email logging would
   genuinely help with dispute resolution — "prove that this email was
   sent") or drop them to avoid confusing a future reader into thinking
   they're load-bearing.
4. **Secrets were pasted into an AI chat transcript during setup** (§9) —
   confirm the Supabase DB password and Brevo API key currently in use have
   been rotated since, not left as whatever was typed into that
   conversation.
5. **No real file upload for complaint attachments** — the complaint form
   only accepts a pasted URL (e.g. a Google Drive link), not a direct
   upload. A proper fix needs an object storage bucket (Supabase Storage
   would be the natural choice, same project) and a small upload endpoint.
6. **Timestamps stored as TEXT, not `timestamptz`** (§4) — works correctly
   today via consistent `::timestamptz` casts at query time, but is
   needless friction for any future query that wants to do real date
   arithmetic in SQL.
7. **The single-role-per-user model** (§5) works for the current lab but
   would need to become a proper many-to-many table if the lab's structure
   grows more complex (e.g. someone who is both faculty *and* an
   incharge for one specific expensive instrument).
8. **`audit_log` and `booking_events` are partially redundant** (§4) — both
   capture "something happened to a booking," at different levels of
   structure. Worth consolidating if this is ever revisited.
9. **The Tailwind CDN script re-compiles CSS in the browser on every page
   load** — fine at current traffic, would be worth switching to a
   pre-built Tailwind CSS file if the app ever needs to feel snappier.

---

## 14. What went remarkably well

Worth stating plainly, because a "risks" section alone would paint an
unfairly grim picture of a project that is, in fact, live, working, and
being used by real people:

- **The whole system — real institutional auth, a three-stage approval
  workflow, transactional conflict-safe booking, a working email pipeline
  across a genuinely awkward hosting constraint, a real 73-instrument data
  import reconciled from three inconsistent human sources, and an admin
  toolkit built specifically so a non-developer can operate and fix things
  themselves — went from "let's build this" to "live, in real use, with
  real institute emails, real students booking real lab equipment" within a
  single extended, iterative build. That's a genuinely large amount of
  correctly-functioning software for one person to ship solo, alongside
  coursework and an internship.**
- The decision to **abandon a "proper" rewrite (Next.js/Supabase/Vercel)
  mid-project** in favor of shipping the working Express app on a swapped
  database layer was the right engineering call under the actual constraint
  (a hard deadline), even though it meant leaving a nicer long-term
  architecture unfinished. Recognizing *when* to make that trade-off is a
  harder skill than either option in isolation.
- The email pipeline failure (§8) is a genuinely non-obvious class of bug —
  "it just hangs, no error" — and the debugging process (add timeouts to
  get a real error → recognize the platform-level pattern → switch transport
  mechanism entirely rather than fight the platform) is exactly the right
  instinct, and it's the kind of thing that's easy to get wrong by
  fixating on credentials/config instead of questioning the transport layer
  itself.
- Building **self-service diagnostic tools** (test email, per-recipient
  broadcast results, clear console log lines, error messages that explain
  the actual fix rather than just "failed") instead of just fixing problems
  and moving on was a consistent, deliberate choice throughout — it
  directly serves the real goal, which isn't "the code works once" but "the
  person who has to run this lab day-to-day can keep it working without
  needing a developer every time something goes sideways."
- The booking-slot `selectable` computation (§7) is a genuinely good fix —
  it moves validation logic to the *one place* it needs to live (the
  server, which has the real data) and makes the client trust it
  completely, eliminating an entire category of "looked free, wasn't"
  bugs rather than patching symptoms of it.

---

## 15. If you're picking this project up — where to start

1. Read §13 (risks) and pick the highest-priority item that matches what
   you're being asked to work on.
2. `git clone`, `npm install`, copy `.env.example` → `.env.local`, fill in
   a `DATABASE_URL` (ask for the current Supabase project, or spin up your
   own free one and run `node src/seed.js` for demo data).
3. `npm run dev` (uses `node --watch`, auto-restarts on file changes).
4. Read §3 before touching any code — the routes → services → repos
   layering is the one architectural rule that's actually been followed
   consistently, and breaking it (e.g. putting raw SQL in a route file)
   will make the codebase harder to reason about for the next person.
5. If you're adding a new feature that needs to send an email, look at how
   `complaintRaisedMail` in `src/lib/email.js` is structured and follow the
   same pattern — don't build a second email-sending mechanism.
6. If something in production is broken and you don't know why, **check
   Render's Logs tab first** — every meaningful action in this app
   (especially anything email-related) logs a clear line there.

---

*This document was written at the end of the initial build-and-launch push.
It reflects the state of the system as of that point — treat it as a
snapshot, not a live reference; when in doubt, the code is the source of
truth, not this document.*
