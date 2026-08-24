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
    // Without these, a blocked/slow connection to the SMTP host hangs forever
    // instead of failing with a clear error — that's what caused the page to
    // spin indefinitely on "Send test email".
    connectionTimeout: 10000, // time to establish the TCP connection
    greetingTimeout: 10000,   // time to receive the SMTP greeting
    socketTimeout: 15000,     // time allowed for the whole send
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
  if (!to) {
    console.warn(`[email] SKIPPED "${subject}" — no recipient (is an Equipment Incharge assigned?)`);
    return { skipped: true };
  }
  if (!tx) {
    console.warn(`[email] SMTP NOT CONFIGURED — would have sent "${subject}" to ${to}. Set SMTP_HOST/USER/PASS.`);
    return { mocked: true };
  }
  try {
    const info = await tx.sendMail(payload);
    console.log(`[email] SENT to ${to} — "${subject}" — id=${info.messageId || 'n/a'}`);
    return info;
  } catch (e) {
    console.error(`[email] FAILED to ${to} — "${subject}": ${e.message}`);
    throw e;
  }
}

const SIG = () =>
  `\nRegards,\nBEST Lab\nBITS Pilani Hyderabad Campus\n\n` +
  `Note: This is a system generated mail. Please do not reply to this message.\n` +
  `For more information, please contact ${process.env.LAB_CONTACT || 'Prof. Sankar Ganesh Palani'}`;

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

  async complaintRaisedMail(to, complaint) {
    return sendMail({
      to: to.email,
      subject: `New Complaint (#${complaint.id}) — ${complaint.priority.toUpperCase()} priority`,
      text:
        `Dear ${to.name},\n\n` +
        `Greetings from BEST Lab!\n\n` +
        `A new complaint has been raised by ${complaint.raiser_name}.\n\n` +
        `Subject: ${complaint.subject}\n` +
        (complaint.instrument_name ? `Instrument: ${complaint.instrument_name}\n` : '') +
        `Priority: ${complaint.priority}\n` +
        (complaint.description ? `Details: ${complaint.description}\n` : '') +
        `\nPlease sign-in to the portal to review and act on it.\n` +
        PORTAL() +
        SIG(),
    });
  },

  async complaintUpdatedMail(to, complaint) {
    return sendMail({
      to: to.email,
      subject: `Your Complaint (#${complaint.id}) is now ${complaint.status.replace('_', ' ')}`,
      text:
        `Dear ${to.name},\n\n` +
        `Greetings from BEST Lab!\n\n` +
        `The status of your complaint "${complaint.subject}" has been updated to: ${complaint.status.replace('_', ' ')}.\n` +
        (complaint.resolution ? `\nResolution: ${complaint.resolution}\n` : '') +
        `\nPlease sign-in to the portal to view details.\n` +
        PORTAL() +
        SIG(),
    });
  },
};
