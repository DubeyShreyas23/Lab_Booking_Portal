const dayjs = require('dayjs');

const allowedDomains = () =>
  (process.env.ALLOWED_DOMAINS ||
    'hyderabad.bits-pilani.ac.in,pilani.bits-pilani.ac.in,goa.bits-pilani.ac.in')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

function isInstituteEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const m = email.trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+$/.test(m)) return false;
  const domain = m.split('@')[1];
  return allowedDomains().includes(domain);
}

function inferRoleFromEmail(email) {
  const local = email.split('@')[0].toLowerCase();
  // f20231386 = student, p20250086 = phd student, others (alphabetic) usually faculty/staff
  if (/^[fhabd]\d{6,}$/.test(local)) return 'student';
  if (/^p\d{6,}$/.test(local)) return 'student'; // phd scholars book like students
  return null; // let admin assign
}

// Display label for a role. Internal value stays 'technician'; users see
// "Equipment Incharge". Keeps routes/data unchanged.
function roleLabel(role) {
  return {
    student: 'Student',
    technician: 'Equipment Incharge',
    faculty: 'Faculty',
    admin: 'Admin',
  }[role] || role;
}

function formatDateLong(iso) {
  return dayjs(iso).format('DD MMMM YYYY');
}

function formatTime(iso) {
  return dayjs(iso).format('HH:mm:ss');
}

// "26 August 2026 (09:00 AM)"
function formatDateTimePretty(iso) {
  return dayjs(iso).format('DD MMMM YYYY (hh:mm A)');
}

// Human-readable slot. Multi-day bookings (or any span crossing midnight) show
// both dates; same-day bookings show the date once with a time range.
//   daily:      "26 August 2026 (09:00 AM) - 31 August 2026 (09:00 PM)"
//   same day:   "26 August 2026, 09:00 AM - 01:00 PM"
function slotLabel(startIso, endIso, mode) {
  const s = dayjs(startIso);
  const e = dayjs(endIso);
  if (mode === 'daily' || !s.isSame(e, 'day')) {
    return `${formatDateTimePretty(startIso)} - ${formatDateTimePretty(endIso)}`;
  }
  return `${s.format('DD MMMM YYYY')}, ${s.format('hh:mm A')} - ${e.format('hh:mm A')}`;
}

function durationLabel(startIso, endIso, mode) {
  // Daily bookings are counted in whole calendar days, inclusive of the last
  // day (e.g. 26th 9AM -> 31st 9PM = 6 days), so we count day boundaries
  // rather than the raw hour difference.
  if (mode === 'daily') {
    const days = dayjs(endIso).startOf('day').diff(dayjs(startIso).startOf('day'), 'day') + 1;
    return `${days} day${days > 1 ? 's' : ''}`;
  }
  const mins = dayjs(endIso).diff(dayjs(startIso), 'minute');
  if (mins >= 1440 && mins % 1440 === 0) {
    const d = mins / 1440;
    return `${d} day${d > 1 ? 's' : ''}`;
  }
  if (mins % 60 === 0) return `${mins / 60} hr`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h} hr ${m} min` : `${m} min`;
}

function decorateBooking(b) {
  const mode = b.booking_mode;
  return {
    ...b,
    dateLong: formatDateLong(b.starts_at),
    startTime: formatTime(b.starts_at),
    endTime: formatTime(b.ends_at),
    startPretty: formatDateTimePretty(b.starts_at),
    endPretty: formatDateTimePretty(b.ends_at),
    slotLabel: slotLabel(b.starts_at, b.ends_at, mode),
    durationLabel: durationLabel(b.starts_at, b.ends_at, mode),
  };
}

module.exports = {
  allowedDomains,
  isInstituteEmail,
  inferRoleFromEmail,
  roleLabel,
  formatDateLong,
  formatTime,
  formatDateTimePretty,
  slotLabel,
  durationLabel,
  decorateBooking,
  dayjs,
};
