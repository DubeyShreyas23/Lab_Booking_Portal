# BEST Lab Portal — Real-World Testing Checklist

Tick each box on the **live site** (https://cal-portal.onrender.com). Best done
with the local dev-login (so you can switch roles fast) OR with a few real
accounts. Report the step number of anything that misbehaves.

Tip: keep the **Render → Logs** tab open in another window — every email logs a
line there (`[email] SENT ...`), so you can watch the pipeline as you go.

---

## A. Login & access control
- [ ] A1. Sign in with an institute Google account → lands on the right page for your role
- [ ] A2. Try signing in with a non-institute email (e.g. a personal @gmail) → **rejected** with "Only institute email addresses are allowed"
- [ ] A3. Sign out → returns to login page; the back button doesn't get you back in
- [ ] A4. As a **student**, manually type `/admin` in the URL → **blocked** (Forbidden)
- [ ] A5. As a **student**, manually type `/technician` → **blocked**

## B. Student — booking (hourly instrument)
- [ ] B1. Instruments list loads; you can see labs and details
- [ ] B2. Open an hourly instrument → date picker shows; **change the date** → the slot grid reloads for that day
- [ ] B3. Hover a free slot → the whole run duration previews in green
- [ ] B4. Booked slots show red with initials; past/too-late slots are greyed and not clickable
- [ ] B5. Click a free slot → it turns solid green, Submit button enables
- [ ] B6. Submit → redirected to My bookings, status **pending technician**, success message shows
- [ ] B7. Check **Render logs** → `[email] SENT ... "Pending Lab Booking Request"` to the instrument's incharge
- [ ] B8. Try to book the **same slot again** → blocked with a clear "already booked / you already have..." message

## C. Student — booking (multi-day instrument)
- [ ] C1. Open a daily instrument (e.g. a bioreactor) → shows a **date-range** picker, not the hourly grid
- [ ] C2. Pick a start date → end date auto-fills (start + duration, inclusive)
- [ ] C3. Existing booked date-ranges are listed
- [ ] C4. Submit → appears in My bookings; the email date reads like **"26 August 2026 (09:00 AM) - 31 August 2026 (09:00 PM)"** with **Duration: N days**

## D. Approval chain — the core workflow
- [ ] D1. Sign in as the **Equipment Incharge** of the booked instrument → the request is in their **Queue**
- [ ] D2. Click **Approve** → status moves to pending faculty; Render log shows email to the professor
- [ ] D3. Sign in as **Prof. Sankar Ganesh** → request is in **Approvals**
- [ ] D4. Click **Approve** → status **approved**; Render log shows "Lab Booking Approved" to the student
- [ ] D5. Student checks inbox → all the expected emails actually arrived (not just logged)

## E. Rejection (the bug we just fixed — test carefully)
- [ ] E1. Make a fresh booking, sign in as its incharge
- [ ] E2. Click **Reject…** → the reason box **expands right there** (not clipped/hidden)
- [ ] E3. Try clicking Confirm with an empty reason → browser blocks it (reason required)
- [ ] E4. Type a reason → **Confirm rejection** → status becomes **rejected**, student emailed with the reason
- [ ] E5. Open the rejected booking → the reason is visible on its detail page
- [ ] E6. Repeat E1–E4 but reject at the **faculty** stage → also works

## F. Cancellation (the await bug we just fixed)
- [ ] F1. As a student, cancel a pending booking → confirm dialog appears
- [ ] F2. After confirming, **reload the page** → it stays **cancelled** (doesn't pop back to pending)
- [ ] F3. Cancel an already-approved booking → also works

## G. Dual-role (PhD incharges)
- [ ] G1. Sign in as an Equipment Incharge → you see **both** a Queue tab AND can book/see "My bookings"
- [ ] G2. As an incharge, book a *different* instrument for your own research → works normally
- [ ] G3. As an incharge, book *your own* instrument → it appears in your own queue; you can approve it (self-approval is allowed by design)

## H. Complaints
- [ ] H1. Student → Complaints → Raise a complaint (subject, instrument, priority, description) → submit
- [ ] H2. Render log shows emails to the supervisor + that instrument's incharge
- [ ] H3. Staff → Complaints → open it → change status (open→in progress→resolved), set priority, assign, add resolution → save
- [ ] H4. Student gets an email on the status change; the complaint reflects the update

## I. Admin — instruments & inventory
- [ ] I1. Inventory page → counts look right (Total/Working/Repair/Booked now/Available)
- [ ] I2. Filter by lab (PURSE / EBT / FSM) → list filters
- [ ] I3. Change an instrument's **status** dropdown (working→repair) → saves, page reflects it after reload
- [ ] I4. Change an instrument's **Equipment Incharge** dropdown → saves after reload
- [ ] I5. Add a new instrument via Instruments → appears in the list
- [ ] I6. Edit an existing instrument → changes stick

## J. Admin — users
- [ ] J1. Change a user's **role** → **reload** → it sticks (this was a bug, now fixed)
- [ ] J2. Delete a user with no bookings → removed
- [ ] J3. Try to delete yourself → blocked; try to delete the default supervisor → blocked
- [ ] J4. Try to delete a user who has real bookings → blocked with "has bookings" message

## K. Admin — settings, holidays, reports
- [ ] K1. Settings → change the **website name** → save → nav/footer/tab title update
- [ ] K2. Settings → **Send test email** → arrives; result message shows success
- [ ] K3. Settings → set default supervisor + contact person → saves
- [ ] K4. Holidays → add a closed date → then as a student, that date is blocked for booking
- [ ] K5. Reports → filter by date/instrument/status → table updates
- [ ] K6. Reports → **Download PDF** → opens a clean, formatted PDF

## L. Broadcast / announcement
- [ ] L1. Admin → Announce → recipient list shows the right people (no admins, no part-timers)
- [ ] L2. Send → per-recipient "sent/failed" results show; a test recipient actually receives it

## M. Public pages & polish
- [ ] M1. `/kiosk` (no login) → shows today's bookings, clock shows correct **IST** time
- [ ] M2. `/contact` (no login) → both contact cards show correct details
- [ ] M3. Footer credit + LinkedIn link work on every page
- [ ] M4. **Nav bar doesn't overflow** the screen on your laptop and on mobile
- [ ] M5. Timezone: a slot you book for "9:00 AM" shows as 9:00 AM everywhere (not shifted)

## N. Edge cases
- [ ] N1. Book right up to closing time (e.g. last valid COD slot) → allowed; one slot later → not offered
- [ ] N2. Two people booking the same slot at once → only one succeeds, the other gets a clear message
- [ ] N3. Refresh a page mid-session → no "Session expired" error (CSRF stays valid)
- [ ] N4. Leave the site idle ~20 min then return → first load is slow (~30s, Render waking) but works; data intact

---

**If anything fails:** note the step number + exactly what you saw (and the
Render log line if it's email-related), and it can be fixed quickly.
