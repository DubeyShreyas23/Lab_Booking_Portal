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

function formatDateLong(iso) {
  return dayjs(iso).format('DD MMMM YYYY');
}

function formatTime(iso) {
  return dayjs(iso).format('HH:mm:ss');
}

function durationLabel(startIso, endIso) {
  const mins = dayjs(endIso).diff(dayjs(startIso), 'minute');
  if (mins % 60 === 0) return `${mins / 60} hr`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h} hr ${m} min` : `${m} min`;
}

function decorateBooking(b) {
  return {
    ...b,
    dateLong: formatDateLong(b.starts_at),
    startTime: formatTime(b.starts_at),
    endTime: formatTime(b.ends_at),
    durationLabel: durationLabel(b.starts_at, b.ends_at),
  };
}

module.exports = {
  allowedDomains,
  isInstituteEmail,
  inferRoleFromEmail,
  formatDateLong,
  formatTime,
  durationLabel,
  decorateBooking,
  dayjs,
};
