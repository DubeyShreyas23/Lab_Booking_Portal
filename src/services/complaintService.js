const complaintRepo = require('../repos/complaintRepo');
const instrumentRepo = require('../repos/instrumentRepo');
const userRepo = require('../repos/userRepo');
const settingsRepo = require('../repos/settingsRepo');
const mail = require('../lib/email');
const { dayjs } = require('../lib/helpers');
const { ValidationError, NotFoundError, ForbiddenError } = require('../errors');

const PRIORITIES = ['low', 'medium', 'high'];
const STATUSES = ['open', 'assigned', 'in_progress', 'resolved', 'closed'];

async function raise({ user, data }) {
  const subject = String(data.subject || '').trim();
  if (!subject) throw new ValidationError('Please enter a subject for your complaint.');
  const priority = PRIORITIES.includes(data.priority) ? data.priority : 'medium';
  const instrumentId = data.instrument_id ? Number(data.instrument_id) : null;

  const complaint = await complaintRepo.create({
    raisedBy: user.id,
    instrumentId,
    category: String(data.category || '').trim() || null,
    subject,
    description: String(data.description || '').trim() || null,
    priority,
    attachmentUrl: String(data.attachment_url || '').trim() || null,
  });
  await complaintRepo.addEvent({ complaintId: complaint.id, actorId: user.id, eventType: 'raised' });

  // Notify the default supervisor and the instrument's technician.
  const recipients = [];
  const supId = await settingsRepo.get('default_supervisor_id');
  if (supId) { const s = await userRepo.findById(Number(supId)); if (s) recipients.push(s); }
  if (instrumentId) {
    const inst = await instrumentRepo.findById(instrumentId);
    if (inst && inst.technician_id) { const t = await userRepo.findById(inst.technician_id); if (t) recipients.push(t); }
  }
  for (const r of recipients) mail.complaintRaisedMail(r, complaint).catch((e) => console.error('mail fail', e));

  return complaint;
}

async function updateByStaff({ actor, id, body }) {
  const c = await complaintRepo.findById(id);
  if (!c) throw new NotFoundError('Complaint');
  if (!['technician', 'faculty', 'admin'].includes(actor.role)) throw new ForbiddenError('Staff only.');

  const patch = {};
  if (body.status && STATUSES.includes(body.status)) patch.status = body.status;
  if (body.priority && PRIORITIES.includes(body.priority)) patch.priority = body.priority;
  if ('assigned_to' in body) patch.assigned_to = body.assigned_to ? Number(body.assigned_to) : null;
  if (typeof body.resolution === 'string' && body.resolution.trim()) patch.resolution = body.resolution.trim();
  if (patch.status === 'resolved' && !c.resolved_at) patch.resolved_at = dayjs().toISOString();

  const updated = await complaintRepo.update(id, patch);
  await complaintRepo.addEvent({
    complaintId: id, actorId: actor.id, eventType: 'updated',
    detail: [patch.status && `status→${patch.status}`, patch.priority && `priority→${patch.priority}`, patch.resolution && 'resolution added']
      .filter(Boolean).join(', ') || null,
  });

  // Tell the complainant when status changed.
  if (patch.status && patch.status !== c.status) {
    const raiser = await userRepo.findById(c.raised_by);
    if (raiser) mail.complaintUpdatedMail(raiser, updated).catch((e) => console.error('mail fail', e));
  }
  return updated;
}

module.exports = { raise, updateByStaff, PRIORITIES, STATUSES };
