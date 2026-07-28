# Deploying CAL on the lab machine (institute LAN)

The lab PC stays on 24/7 running the booking portal. Students from any room on
campus reach it over Wi-Fi or LAN. No external internet exposure required.

---

## What you need from BITS IT

1. **A static IP** for the lab PC on the campus network
   *(or)* a friendly hostname like `cal-bphc.hyderabad.bits-pilani.ac.in`
2. **Port 80 (or 3000) open** between the lab subnet and the student Wi-Fi
   subnet — most BITS internal services already work this way, no extra ask needed.
3. **(Optional)** a TLS cert for the hostname if you want `https://`.

Email IT something like:

> *We are deploying a lab-internal booking portal on a PC in CAL room 2XX.
> Please assign a static IP / DNS alias `cal-lab.hyderabad.bits-pilani.ac.in`
> that resolves from the student Wi-Fi (RP-Hyderabad-Hostel-Wifi) so students
> can access the portal at `http://cal-lab.hyderabad.bits-pilani.ac.in:3000`.*

---

## On the lab PC (Windows)

### 1. Install Node 20+
<https://nodejs.org/en/download> → LTS installer.

### 2. Copy the project
```cmd
cd C:\
mkdir cal
cd cal
:: copy the project folder here, or clone it from your private git
```

### 3. Install deps + seed
```cmd
cd C:\cal
npm install --omit=dev
copy .env.example .env
notepad .env
```

Edit `.env`:
```env
NODE_ENV=production
PORT=3000
SESSION_SECRET=<paste a long random string here>
CSRF_SECRET=<another long random string>
PORTAL_URL=http://cal-lab.hyderabad.bits-pilani.ac.in:3000

ALLOWED_DOMAINS=hyderabad.bits-pilani.ac.in,pilani.bits-pilani.ac.in

GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_CALLBACK_URL=http://cal-lab.hyderabad.bits-pilani.ac.in:3000/auth/google/callback

SEED_ADMIN_EMAIL=<the lab assistant's institute email>
SEED_ADMIN_NAME=Lab Administrator

# SMTP — using BITS mail relay if you have one, or any Gmail App Password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=lab.cal.bphc@gmail.com
SMTP_PASS=<gmail app password>
MAIL_FROM_NAME=Central Analytical Laboratory
MAIL_FROM_ADDRESS=lab.cal.bphc@gmail.com
```

Then:
```cmd
npm run seed
npm start
```

You should see:
```
CAL portal running at http://localhost:3000
OAuth: Google configured
```

### 4. Open the firewall

Run **PowerShell as Administrator**:
```powershell
New-NetFirewallRule -DisplayName "CAL portal" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

### 5. Make it auto-start on reboot

Two options — **NSSM is the friendliest**:

#### Option A — NSSM (recommended)
1. Download NSSM: <https://nssm.cc/download> → unzip somewhere
2. Open Command Prompt **as Administrator**:
   ```cmd
   nssm install CAL
   ```
3. In the dialog:
   - **Path**: `C:\Program Files\nodejs\node.exe`
   - **Startup directory**: `C:\cal`
   - **Arguments**: `server.js`
   - **Service name**: `CAL`
4. Install → service appears in `services.msc`. Set startup type **Automatic**.

The portal is now a Windows service. It comes up on reboot, restarts on crash.

#### Option B — Task Scheduler
1. Open Task Scheduler → Create Task
2. **Trigger**: At system startup
3. **Action**: Start a program → `C:\Program Files\nodejs\node.exe`
   - **Arguments**: `server.js`
   - **Start in**: `C:\cal`
4. Check "Run whether user is logged on or not"

---

## Verify

From the lab PC:
- `http://localhost:3000/login` → login page

From a student device on BITS Wi-Fi:
- `http://cal-lab.hyderabad.bits-pilani.ac.in:3000/login`
- Sign in with Google
- The dev-mode magic login is **disabled** in production — only Google works.

---

## Lab-door display (optional)

On a small screen mounted outside the lab, open Chrome in fullscreen / kiosk
mode at `http://localhost:3000/kiosk` (no login needed). It shows today's
schedule for each instrument and refreshes every 60 s.

```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk http://localhost:3000/kiosk
```

Pin that command as a Windows startup shortcut for an always-on display.

---

## Backups

Everything lives in `C:\cal\data\cal.db` (SQLite). Snapshot this file daily —
copy it to an institute network share, OneDrive, or a USB drive. Restore by
stopping the service, replacing the file, restarting.

```cmd
:: simple daily backup — pin in Task Scheduler
copy C:\cal\data\cal.db \\share\backups\cal-%date:~10,4%%date:~4,2%%date:~7,2%.db
```

---

## Updating the code

```cmd
sc stop CAL
cd C:\cal
git pull        ::  or copy in the new files
npm install --omit=dev
sc start CAL
```

Schema migrations apply automatically on boot (see `src/db.js`).
