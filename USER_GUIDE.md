# BEST Lab Booking Portal — User Guide

**Everything the portal can do, in plain language.**
Portal: **https://cal-portal.onrender.com**
Questions? See the **Contact** page in the portal, or scroll to the bottom of
this guide.

---

## What is this?

A website where you book lab instruments online instead of coordinating over
WhatsApp or asking around who's using what. You pick an instrument and a
time, the right people approve it, and you get an email at every step so you
always know where your request stands.

---

## Who uses it

Everyone signs in the exact same way — with your institute Google account —
but what you can *do* depends on your role:

| Role | What they do |
|---|---|
| **Student** (default for everyone) | Books instruments, tracks their own bookings, raises complaints |
| **Equipment Incharge** | Everything a student can do, **plus** approves or rejects booking requests for the instrument(s) they're responsible for |
| **Faculty** | Everything above, **plus** gives the final sign-off on every booking, and can manage the whole system (instruments, users, reports) |
| **Admin** | Full control — manages instruments, users, holidays, and settings |

**Important: these aren't exclusive.** If you're an Equipment Incharge,
you're *also* still a full user who can book other instruments for your own
work — you're not locked out of booking just because you also approve
requests. Same goes for faculty. Everyone can always book.

---

## Getting started

1. Go to **https://cal-portal.onrender.com**
2. Click **Sign in** → **Continue with Google**
3. Log in with your institute email (`@hyderabad.bits-pilani.ac.in`)
4. That's it — you're in. First-time sign-ins land you as a regular user;
   if you're supposed to have Equipment Incharge or Faculty access, ask the
   admin to set your role.

---

## Booking an instrument

### For short experiments (an hour or a few hours)

1. Click **Instruments** (or **Book equipment**) in the top menu
2. Pick an instrument from the list — you can see which lab it's in
   (PURSE, EBT, or FSM) and roughly how long a run takes
3. On the instrument's page, pick a **date**
4. You'll see a grid of time slots for that day:
   - **White** = free
   - **Red, with initials** = already booked by someone
   - **Grey** = too late in the day, or in the past
5. **Hover over any free slot** — it'll shade green to show you the *entire*
   block of time your run would actually take (including the instrument's
   required cleanup/maintenance time, automatically added)
6. Click to select it, add a short note about what you're using it for, and
   hit **Submit**

### For long experiments (bioreactor runs, digesters — several days)

Some instruments are booked by date range instead of by the hour (you'll see
this automatically on the instrument's page — no hourly grid, just a
calendar). Pick your **start date**, and the end date fills in automatically
based on how long that instrument's run takes. You'll also see any dates
that are already booked, so you can avoid clashing with someone else.

---

## Tracking your bookings

Click **My bookings** any time. You'll see every request you've made and
its current status:

| Status | What it means |
|---|---|
| **Pending technician** | Waiting for the Equipment Incharge to approve |
| **Pending faculty** | Incharge approved it — now waiting on the faculty supervisor |
| **Approved** | ✅ You're all set — the instrument is yours for that slot |
| **Rejected** | Someone said no — click into the booking to see why |
| **Cancelled** | You cancelled it |

Click any booking to see its full timeline — every step, who acted, and when.

### Cancelling

Open the booking from **My bookings** and click **Cancel**. You can cancel
anything that's still pending or already approved.

---

## Understanding the approval chain

Every booking goes through exactly two approvals before it's confirmed:

```
You submit  →  Equipment Incharge approves  →  Faculty approves  →  Confirmed
                        │                              │
                        └── can reject, with reason ───┘
```

You get an **email at every step** — when you submit, and again the moment
either person approves or rejects it (with their reason, if rejected). You
never have to keep checking the site to know what's happening.

---

## If you're an Equipment Incharge

You'll see an extra tab in the menu: **Queue**. That's where booking
requests for the instrument(s) you're responsible for show up. For each one,
you can:
- **Approve** — sends it on to the faculty supervisor for final sign-off
- **Reject** — type a short reason; the student is emailed immediately

You still have your own **My bookings** and can book other instruments
yourself exactly like anyone else — being an incharge doesn't change that.

---

## Raising a complaint

Something wrong with an instrument, or an issue with a booking? Click
**Complaints → Raise a complaint**:
1. Give it a short subject and pick which instrument it's about (optional)
2. Set a priority (low / medium / high)
3. Describe the issue
4. Optionally paste a link to a photo or document (e.g. a Google Drive link)
5. Submit — it goes straight to the instrument's incharge and the faculty
   supervisor automatically

Track it under **Complaints** any time; you'll get an email whenever its
status changes (assigned, in progress, resolved).

---

## For faculty and admins — managing the lab

If you have faculty or admin access, you get a full management panel:

- **Dashboard** — quick overview: how many instruments, users, pending
  approvals, upcoming bookings
- **Inventory** — every instrument with live counts (Total / Working /
  Repair / Booked right now / Available), filterable by lab. You can mark
  an instrument as under repair, and assign or reassign its Equipment
  Incharge right from this page — no need to dig into a separate edit form
- **Instruments** — add a brand-new instrument or edit any detail (how
  long a run takes, lab hours, location, incharge)
- **Users** — change anyone's role, assign a supervisor, or remove a user
  entirely if needed
- **Holidays** — mark dates the lab is closed (for the whole lab or just
  one instrument) — bookings are automatically blocked on those dates
- **Reports** — filter past bookings by date, instrument, or status, and
  download a clean PDF summary
- **Settings** — change the site name, set who the default faculty
  supervisor is, and update the contact name shown at the bottom of every
  email. There's also a **"Send test email"** button here — use it any time
  you want to confirm emails are actually going out
- **Announce** — send a one-off announcement email to everyone in the
  system at once (handy for exactly this kind of "we're live!" message).
  It shows you the full recipient list before you send anything, and tells
  you exactly who it succeeded or failed for afterward

---

## The lab-door display (kiosk)

There's a public, no-login screen at `/kiosk` meant to be shown on a display
outside the lab — it lists what's booked on each instrument today, and
refreshes itself automatically every minute.

---

## Getting help

- **Technical / website issues** (something's broken, a bug, an idea for a
  new feature): see the **Contact** page in the portal, or reach out to
  Shreyas Dubey directly at `f20231386@hyderabad.bits-pilani.ac.in`
- **Lab / research questions**: Prof. Sankar Ganesh Palani — details also
  on the **Contact** page

---

## Quick FAQ

**Why can't I pick a certain time slot even though it looks free?**
The grid only lets you click a slot if the *entire* run — including the
instrument's required cleanup time afterward — fits before the lab closes
and doesn't overlap another booking. If a slot looks free but won't click,
it's usually because the full run wouldn't fit starting there.

**I'm both a student and an Equipment Incharge — which menu do I use?**
Both, at the same time. Your **Queue** tab is for approving others' requests;
**My bookings** / **Book equipment** is for your own. They're completely
separate and both always available to you.

**My booking was rejected — can I try again?**
Yes — check the rejection reason on the booking's detail page, then just
submit a new request.

**I didn't get an email.**
Check your spam folder first. If it's still missing, let Shreyas know via
the Contact page — there's a way to check server-side whether the email
was actually sent.
