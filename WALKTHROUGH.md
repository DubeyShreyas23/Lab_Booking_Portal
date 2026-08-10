# BEST Lab Portal — Full Walkthrough (every role, every feature)

Live site: **https://cal-portal.onrender.com**

This guide covers what each kind of user sees and does. Use it to demo the portal
to the professor and to hand over to juniors.

---

## 1. The four roles

Everyone signs in the **same way** (institute Google account). What they can do is
decided by their **role**, which the admin sets in *Users*.

| Role | Who | Lands on | Can do |
|---|---|---|---|
| **Student** | any institute account (default) | `/` My Bookings | Book instruments, track status, cancel, raise complaints |
| **Technician** | assigned by admin | `/technician` Queue | 1st-level approve/reject for **their** instruments, handle complaints, reports |
| **Faculty / Professor** | assigned by admin | `/faculty` Approvals | Final approve/reject for their students **+ full admin powers** |
| **Admin / Lab Assistant** | assigned by admin | `/admin` Dashboard | Everything — instruments, inventory, users, holidays, settings, reports, complaints |

**How role is decided at sign-in:** the app looks up the email in *Users*. Existing
users get their set role; brand-new sign-ins become **student** by default. An admin
promotes staff afterwards.

---

## 2. One-time setup (admin)

After deploy, the admin should:

1. **Run the equipment import** (loads the 73 real instruments):
   `node src/import-equipment.js`
2. **Users** → set the real people's roles: mark the technician(s) as *technician*,
   the professor as *faculty*.
3. **Instruments** → assign a **technician** to each instrument (so booking requests
   for it e-mail the right person).
4. **Settings** → choose the **default supervisor** (Prof. Sankar Ganesh Palani) and
   the contact person shown on emails.
5. (Optional) **Holidays** → add any lab-closed dates.

---

## 3. STUDENT walkthrough

**Login:** Google → lands on **My Bookings** (`/`).

### Book a short (hourly) instrument
1. **Instruments** → browse the list (name, lab, what it analyses, run time).
2. Click an instrument → the **booking page**:
   - Pick a **date**.
   - The **timeline grid** (9am–9pm) shows free cells white, booked cells red with
     the booker's initials, past/too-late cells greyed out.
   - **Hover** a free cell → the full run duration previews in green.
   - **Click** to select → the supervisor (fixed default) and sample count show.
   - Add purpose → **Submit**.
3. Booking appears in *My Bookings* as **pending technician**.

### Book a multi-day instrument (bioreactors, digesters, incubators)
1. Click the instrument → a **date-range** page appears instead of the timeline
   (because its run is measured in days).
2. Pick a **start date** → the **end date** auto-fills (start + run length, e.g. 30 days).
3. Existing booked date-ranges are listed so you avoid clashes.
4. Add purpose → **Submit**.

### Track & cancel
- *My Bookings* shows every request with a status badge
  (pending technician → pending faculty → approved / rejected / cancelled).
- Click a booking → full **timeline** of who acted and when.
- **Cancel** any pending/approved booking.

### Raise a complaint
- **Complaints → + Raise complaint** → subject, instrument (optional), priority
  (low/med/high), description, optional attachment link → **Submit**.
- The supervisor and the instrument's technician are e-mailed.
- Track it under **Complaints**; you get an email when its status changes.

---

## 4. TECHNICIAN walkthrough

**Login:** Google → lands on **Queue** (`/technician`).

### Approve / reject bookings (1st level)
1. **Queue** shows pending requests **only for instruments assigned to this technician**.
2. Each row: student, instrument, date/time, duration, purpose, "details" link.
3. **Approve** → the booking moves to the professor and the professor is e-mailed.
4. **Reject…** → enter a reason → the student is e-mailed the rejection.

### Complaints
- **Complaints** → see all complaints, open one, set **status**
  (open → assigned → in progress → resolved), **priority**, **assign** to a technician,
  add a **resolution** note. The complainant is e-mailed on status change.

### Reports
- **Reports** → usage table filtered to their instruments; download a **PDF**.

---

## 5. FACULTY / PROFESSOR walkthrough

**Login:** Google → lands on **Approvals** (`/faculty`). Faculty also has **full admin powers**.

### Final approval (2nd level)
1. **Approvals** shows bookings that passed the technician and name this professor as supervisor.
2. **Approve** → booking becomes **approved**; the student is e-mailed "Lab Booking Approved".
3. **Reject…** → reason → student e-mailed.

### Everything the admin can do
The professor also has the admin menu — Dashboard, Inventory, Instruments, Users,
Holidays, Settings, Reports, Complaints (see next section).

---

## 6. ADMIN / LAB ASSISTANT walkthrough

**Login:** Google → lands on **Dashboard** (`/admin`).

### Dashboard
Counts: active instruments, users, pending approvals, upcoming approved bookings, plus recent activity.

### Equipment Inventory (`/admin/inventory`)
- **Counts:** Total / Working / Repair / **Booked now** / Available.
- **Filter** by lab (PURSE / EBT / FSM).
- Per-instrument dropdown to mark **working / repair / retired** (repair rows highlight).

### Instruments (`/admin/instruments`)
- Add / edit an instrument: code, name, description, location, **experiment minutes**,
  **maintenance buffer**, lab hours, assigned **technician**, active flag.
- (The 73 real instruments come in via the import; edit any as needed.)

### Users (`/admin/users`)
- See everyone; change **role** (student/technician/faculty/admin), set **supervisor**,
  department, phone. This is where you promote the technician and professor.
- Pre-register a user by email (optional) — or they self-register on first Google login.

### Holidays (`/admin/holidays`)
- Add lab-closed dates (whole lab or a single instrument). Bookings are blocked on those dates.

### Settings (`/admin/settings`)
- **Default supervisor** — the one faculty all bookings route to.
- **Contact person** — shown at the bottom of notification emails.

### Reports (`/reports`)
- Filter bookings by date range / instrument / status; download a formatted **PDF** with the BEST Lab header.

### Complaints (`/complaints`)
- Full queue of all complaints, filter by status, open and resolve any.

---

## 7. The core workflows (end to end)

### Booking approval chain
```
Student submits
   → email to the instrument's TECHNICIAN  ("Pending Lab Booking Request")
Technician approves
   → email to the PROFESSOR                 ("Waiting for Faculty Approval")
Professor approves
   → email to the STUDENT                   ("Lab Booking Approved")
(Reject at either step → email to the student with the reason)
```

### Complaint lifecycle
```
Student raises  → email to supervisor + technician
open → assigned → in progress → resolved (→ closed)
Each status change → email to the student who raised it
```

---

## 8. Public — lab-door kiosk (`/kiosk`)
No login. A dark, auto-refreshing screen showing **today's bookings per instrument** —
meant for a display mounted outside the lab.

---

## 9. How YOU (developer) can test every role

In production only Google works and you can only be yourself. To exercise **all roles**,
run it locally where a **dev-login** box lets you become anyone:

```bash
npm start           # locally, with NODE_ENV=development and no Google keys in .env
```
Open `http://localhost:3000/login` → dev-login box → sign in as:

| Role | Email |
|---|---|
| Student | `p20250086@hyderabad.bits-pilani.ac.in` |
| Technician | `tech.cod@hyderabad.bits-pilani.ac.in` |
| Professor | `sangan@hyderabad.bits-pilani.ac.in` |
| Admin | `admin@hyderabad.bits-pilani.ac.in` |

**Full demo run:** book as student → approve as technician → approve as professor →
see "approved" + emails in the terminal. Then raise a complaint as student → resolve as technician.
