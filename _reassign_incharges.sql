-- ============================================================
-- Reallocate 'additional support equipment' from part-time
-- students to the 6 primary Equipment Incharges only.
-- Paste into Supabase -> SQL Editor -> Run
-- ============================================================

-- 1) The 8 part-timers are no longer incharges -- revert to student
UPDATE users SET role = 'student'
WHERE email IN (
  'p20230100@hyderabad.bits-pilani.ac.in',
  'p20240100@hyderabad.bits-pilani.ac.in',
  'p20260097@hyderabad.bits-pilani.ac.in',
  'p20230803@hyderabad.bits-pilani.ac.in',
  'p20220007@hyderabad.bits-pilani.ac.in',
  'p20230500@hyderabad.bits-pilani.ac.in',
  'p20240801@hyderabad.bits-pilani.ac.in',
  'p20260009@hyderabad.bits-pilani.ac.in'
) AND role = 'technician';

-- 2) Reassign their 26 instruments to the primary incharges (balanced)
UPDATE instruments AS i
SET technician_id = u.id
FROM (VALUES
  ('EBT-21', 'p20210100@hyderabad.bits-pilani.ac.in'),
  ('EBT-23', 'p20210100@hyderabad.bits-pilani.ac.in'),
  ('EBT-24', 'p20210100@hyderabad.bits-pilani.ac.in'),
  ('EBT-25', 'p20250085@hyderabad.bits-pilani.ac.in'),
  ('EBT-26', 'p20240003@hyderabad.bits-pilani.ac.in'),
  ('EBT-27', 'p20210100@hyderabad.bits-pilani.ac.in'),
  ('EBT-28', 'p20241200@hyderabad.bits-pilani.ac.in'),
  ('EBT-29', 'p20250085@hyderabad.bits-pilani.ac.in'),
  ('EBT-30', 'p20240003@hyderabad.bits-pilani.ac.in'),
  ('EBT-31', 'p20210100@hyderabad.bits-pilani.ac.in'),
  ('EBT-32', 'p20241200@hyderabad.bits-pilani.ac.in'),
  ('EBT-33', 'p20250085@hyderabad.bits-pilani.ac.in'),
  ('EBT-34', 'p20240003@hyderabad.bits-pilani.ac.in'),
  ('EBT-35', 'p20210100@hyderabad.bits-pilani.ac.in'),
  ('EBT-36', 'p20250086@hyderabad.bits-pilani.ac.in'),
  ('EBT-37', 'p20241200@hyderabad.bits-pilani.ac.in'),
  ('FSM-14', 'p20250085@hyderabad.bits-pilani.ac.in'),
  ('FSM-15', 'p20240003@hyderabad.bits-pilani.ac.in'),
  ('FSM-16', 'p20210100@hyderabad.bits-pilani.ac.in'),
  ('FSM-17', 'p20250086@hyderabad.bits-pilani.ac.in'),
  ('FSM-18', 'p20240076@hyderabad.bits-pilani.ac.in'),
  ('PUR-03', 'p20241200@hyderabad.bits-pilani.ac.in'),
  ('PUR-05', 'p20250085@hyderabad.bits-pilani.ac.in'),
  ('PUR-16', 'p20240003@hyderabad.bits-pilani.ac.in'),
  ('PUR-17', 'p20210100@hyderabad.bits-pilani.ac.in'),
  ('PUR-18', 'p20250086@hyderabad.bits-pilani.ac.in')
) AS m(code, email)
JOIN users u ON u.email = m.email
WHERE i.code = m.code;

-- 3) Sanity checks
SELECT code, name, technician_id FROM instruments WHERE active = 1 AND technician_id IS NULL;

SELECT u.name, u.email, COUNT(i.id) AS instrument_count
FROM users u LEFT JOIN instruments i ON i.technician_id = u.id AND i.active = 1
WHERE u.role = 'technician'
GROUP BY u.name, u.email
ORDER BY instrument_count DESC;