const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
}

function fromHeader() {
  const name = process.env.MAIL_FROM_NAME || 'BEST Lab';
  const addr = process.env.MAIL_FROM_ADDRESS || 'cal-online@hyderabad.bits-pilani.ac.in';
  return `${name} <${addr}>`;
}

async function sendMail({ to, subject, text }) {
  const tx = getTransporter();
  const payload = { from: fromHeader(), to, subject, text };
  if (!tx) {
    console.log('\n────── EMAIL (no SMTP configured) ──────');
    console.log('To:     ', to);
    console.log('Subject:', subject);
    console.log(text);
    console.log('───────────────────────────────────────\n');
    return { mocked: true };
  }
  return tx.sendMail(payload);
}

const SIG = () =>
  `\nRegards,\nBEST Lab\nBITS Pilani Hyderabad Campus\n\n` +
  `Note: This is a system generated mail. Please do not reply to this message.\n` +
  `For more information, please contact ${process.env.LAB_CONTACT || 'Prof. P. Sankar Ganesh'}`;

const PORTAL = () => `\nPortal Link: ${process.env.PORTAL_URL || 'http://localhost:' + (process.env.PORTAL_PORT || process.env.PORT || 3000)}\n`;

const fmt = (b) =>
  `${b.instrument_name} and Time Slot: ${b.dateLong} - ${b.startTime} to ${b.endTime} (Duration: ${b.durationLabel})`;

module.exports = {
  sendMail,

  async otpMail(to, code) {
    return sendMail({
      to,
      subject: 'Your BEST Lab portal login code',
      text:
        `Greetings from BEST Lab!\n\n` +
        `Your one-time login code is: ${code}\n\n` +
        `This code expires in 10 minutes. If you did not request it, you can ignore this email.\n` +
        SIG(),
    });
  },

  async pendingTechnicianMail(toTechnician, booking) {
    return sendMail({
      to: toTechnician.email,
      subject: 'Pending Lab Booking Request',
      text:
        `Dear ${toTechnician.name},\n\n` +
        `Greetings from BEST Lab!\n\n` +
        `This is to inform you that we have received a booking request for Machine: ${fmt(booking)}. ` +
        `The application has been submitted by ${booking.student_name} and is awaiting your approval. ` +
        `Once you approve, it will be forwarded to the faculty supervisor.\n\n` +
        `Please follow your dashboard to view the status of the application.\n` +
        PORTAL() +
        SIG(),
    });
  },

  async pendingFacultyMail(toFaculty, booking) {
    return sendMail({
      to: toFaculty.email,
      subject: 'Waiting for Faculty Approval',
      text:
        `Dear ${toFaculty.name},\n\n` +
        `Greetings from BEST Lab!\n\n` +
        `We have a booking awaiting your approval from ${booking.student_name} for Machine: ${fmt(booking)}. ` +
        `Please sign-in to the portal to view application details.\n` +
        PORTAL() +
        SIG(),
    });
  },

  async approvedMail(toStudent, booking) {
    return sendMail({
      to: toStudent.email,
      subject: 'Lab Booking Approved',
      text:
        `Dear ${toStudent.name},\n\n` +
        `Greetings from BEST Lab!\n\n` +
        `Congratulations! Your booking has been approved for Machine: ${fmt(booking)}! ` +
        `Please sign-in to see your booking details.\n` +
        PORTAL() +
        SIG(),
    });
  },

  async rejectedMail(toStudent, booking, reason) {
    return sendMail({
      to: toStudent.email,
      subject: 'Lab Booking Rejected',
      text:
        `Dear ${toStudent.name},\n\n` +
        `Greetings from BEST Lab!\n\n` +
        `We regret to inform you that your booking for Machine: ${fmt(booking)} has been rejected.` +
        (reason ? `\n\nReason: ${reason}` : '') +
        `\n\nPlease sign-in to the portal to submit a new request if needed.\n` +
        PORTAL() +
        SIG(),
    });
  },
};
