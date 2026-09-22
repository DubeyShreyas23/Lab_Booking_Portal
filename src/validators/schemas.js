const { z } = require('zod');
const { allowedDomains } = require('../lib/helpers');

const instituteEmail = z.string().trim().toLowerCase()
  .email('Please enter a valid email address')
  .refine((e) => allowedDomains().includes(e.split('@')[1]),
    (e) => ({ message: `Must be an institute email (${allowedDomains().join(', ')})` }));

const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date/time');

const phone = z.string().trim().min(10).max(20).regex(/^[0-9 +\-()]+$/, 'Invalid phone format');

const role = z.enum(['student','technician','faculty','admin']);

const profileCompletion = z.object({
  name: z.string().trim().min(2, 'Name required').max(120),
  phone,
  department: z.string().trim().max(120).optional().or(z.literal('')),
});

const createBooking = z.object({
  starts_at: isoDateTime,
  // supervisor is now a fixed lab-configured default, not student-chosen
  purpose: z.string().trim().max(500).optional().or(z.literal('')),
  sample_count: z.coerce.number().int().min(1).max(100).optional().default(1),
});

const upsertInstrument = z.object({
  id: z.coerce.number().int().positive().optional(),
  code: z.string().trim().toUpperCase().min(1).max(20),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  location: z.string().trim().max(120).optional().or(z.literal('')),
  experiment_minutes: z.coerce.number().int().min(15).max(24 * 60),
  maintenance_minutes: z.coerce.number().int().min(0).max(12 * 60),
  open_hour: z.coerce.number().int().min(0).max(23),
  close_hour: z.coerce.number().int().min(1).max(24),
  technician_id: z.coerce.number().int().positive().optional().nullable(),
  active: z.union([z.literal('1'), z.literal('on'), z.literal('true'), z.boolean()]).optional(),
  multi_user: z.union([z.literal('1'), z.literal('on'), z.literal('true'), z.boolean()]).optional(),
}).refine((v) => v.close_hour > v.open_hour, { message: 'Close hour must be after open hour', path: ['close_hour'] });

const createUser = z.object({
  email: instituteEmail,
  name: z.string().trim().min(2).max(120),
  role,
});

const updateUser = z.object({
  role,
  supervisor_id: z.coerce.number().int().positive().optional().or(z.literal('')),
  department: z.string().trim().max(120).optional().or(z.literal('')),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
});

const rejection = z.object({
  reason: z.string().trim().min(3, 'Please give a reason').max(500),
});

module.exports = {
  instituteEmail,
  profileCompletion,
  createBooking,
  upsertInstrument,
  createUser,
  updateUser,
  rejection,
};
