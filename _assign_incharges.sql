-- ============================================================
-- Assign Equipment Incharges to all 73 instruments
-- Paste this whole script into Supabase -> SQL Editor -> Run
-- ============================================================

-- 1) Create/promote all 14 people to Equipment Incharge (role='technician')
INSERT INTO users (email, name, role) VALUES
  ('p20250085@hyderabad.bits-pilani.ac.in', 'Dimple K', 'technician'),
  ('p20250086@hyderabad.bits-pilani.ac.in', 'Balamanikandan R', 'technician'),
  ('p20240003@hyderabad.bits-pilani.ac.in', 'Vadla Pallavi', 'technician'),
  ('p20241200@hyderabad.bits-pilani.ac.in', 'Keitumetse Ngaka', 'technician'),
  ('p20240076@hyderabad.bits-pilani.ac.in', 'Ravindra Dnyanaba Kulal', 'technician'),
  ('p20210100@hyderabad.bits-pilani.ac.in', 'Sandhya Kumari Gupta', 'technician'),
  ('p20230100@hyderabad.bits-pilani.ac.in', 'Loganathan A', 'technician'),
  ('p20240100@hyderabad.bits-pilani.ac.in', 'Marina Nandyal Hepsiba', 'technician'),
  ('p20260097@hyderabad.bits-pilani.ac.in', 'Godi Joanna Sharmily', 'technician'),
  ('p20230803@hyderabad.bits-pilani.ac.in', 'Pavithra Pari', 'technician'),
  ('p20220007@hyderabad.bits-pilani.ac.in', 'Hemapriya S', 'technician'),
  ('p20230500@hyderabad.bits-pilani.ac.in', 'Syamala Diwakaruni', 'technician'),
  ('p20240801@hyderabad.bits-pilani.ac.in', 'Gantala Sarva Sai Nikhilesh', 'technician'),
  ('p20260009@hyderabad.bits-pilani.ac.in', 'Priyadarshni Sahu', 'technician')
ON CONFLICT (email) DO UPDATE SET role = 'technician', name = EXCLUDED.name;

-- 2) Assign each instrument to its incharge, by instrument code
UPDATE instruments AS i
SET technician_id = u.id
FROM (VALUES
  ('EBT-01', 'p20240003@hyderabad.bits-pilani.ac.in'),
  ('EBT-02', 'p20250085@hyderabad.bits-pilani.ac.in'),
  ('EBT-03', 'p20250085@hyderabad.bits-pilani.ac.in'),
  ('EBT-04', 'p20241200@hyderabad.bits-pilani.ac.in'),
  ('EBT-05', 'p20241200@hyderabad.bits-pilani.ac.in'),
  ('EBT-06', 'p20250086@hyderabad.bits-pilani.ac.in'),
  ('EBT-07', 'p20250086@hyderabad.bits-pilani.ac.in'),
  ('EBT-08', 'p20250086@hyderabad.bits-pilani.ac.in'),
  ('EBT-09', 'p20250086@hyderabad.bits-pilani.ac.in'),
  ('EBT-10', 'p20250086@hyderabad.bits-pilani.ac.in'),
  ('EBT-11', 'p20250086@hyderabad.bits-pilani.ac.in'),
  ('EBT-12', 'p20250086@hyderabad.bits-pilani.ac.in'),
  ('EBT-13', 'p20240076@hyderabad.bits-pilani.ac.in'),
  ('EBT-14', 'p20240076@hyderabad.bits-pilani.ac.in'),
  ('EBT-15', 'p20240003@hyderabad.bits-pilani.ac.in'),
  ('EBT-16', 'p20240003@hyderabad.bits-pilani.ac.in'),
  ('EBT-17', 'p20240003@hyderabad.bits-pilani.ac.in'),
  ('EBT-18', 'p20241200@hyderabad.bits-pilani.ac.in'),
  ('EBT-19', 'p20241200@hyderabad.bits-pilani.ac.in'),
  ('EBT-20', 'p20250085@hyderabad.bits-pilani.ac.in'),
  ('EBT-21', 'p20230500@hyderabad.bits-pilani.ac.in'),
  ('EBT-22', 'p20250086@hyderabad.bits-pilani.ac.in'),
  ('EBT-23', 'p20240801@hyderabad.bits-pilani.ac.in'),
  ('EBT-24', 'p20260009@hyderabad.bits-pilani.ac.in'),
  ('EBT-25', 'p20230100@hyderabad.bits-pilani.ac.in'),
  ('EBT-26', 'p20240100@hyderabad.bits-pilani.ac.in'),
  ('EBT-27', 'p20260097@hyderabad.bits-pilani.ac.in'),
  ('EBT-28', 'p20230803@hyderabad.bits-pilani.ac.in'),
  ('EBT-29', 'p20220007@hyderabad.bits-pilani.ac.in'),
  ('EBT-30', 'p20230500@hyderabad.bits-pilani.ac.in'),
  ('EBT-31', 'p20240801@hyderabad.bits-pilani.ac.in'),
  ('EBT-32', 'p20260009@hyderabad.bits-pilani.ac.in'),
  ('EBT-33', 'p20230100@hyderabad.bits-pilani.ac.in'),
  ('EBT-34', 'p20240100@hyderabad.bits-pilani.ac.in'),
  ('EBT-35', 'p20260097@hyderabad.bits-pilani.ac.in'),
  ('EBT-36', 'p20230803@hyderabad.bits-pilani.ac.in'),
  ('EBT-37', 'p20220007@hyderabad.bits-pilani.ac.in'),
  ('FSM-01', 'p20241200@hyderabad.bits-pilani.ac.in'),
  ('FSM-02', 'p20241200@hyderabad.bits-pilani.ac.in'),
  ('FSM-03', 'p20210100@hyderabad.bits-pilani.ac.in'),
  ('FSM-04', 'p20210100@hyderabad.bits-pilani.ac.in'),
  ('FSM-05', 'p20210100@hyderabad.bits-pilani.ac.in'),
  ('FSM-06', 'p20210100@hyderabad.bits-pilani.ac.in'),
  ('FSM-07', 'p20240076@hyderabad.bits-pilani.ac.in'),
  ('FSM-08', 'p20240076@hyderabad.bits-pilani.ac.in'),
  ('FSM-09', 'p20250085@hyderabad.bits-pilani.ac.in'),
  ('FSM-10', 'p20240003@hyderabad.bits-pilani.ac.in'),
  ('FSM-11', 'p20240076@hyderabad.bits-pilani.ac.in'),
  ('FSM-12', 'p20240076@hyderabad.bits-pilani.ac.in'),
  ('FSM-13', 'p20241200@hyderabad.bits-pilani.ac.in'),
  ('FSM-14', 'p20230500@hyderabad.bits-pilani.ac.in'),
  ('FSM-15', 'p20240801@hyderabad.bits-pilani.ac.in'),
  ('FSM-16', 'p20260009@hyderabad.bits-pilani.ac.in'),
  ('FSM-17', 'p20230100@hyderabad.bits-pilani.ac.in'),
  ('FSM-18', 'p20240100@hyderabad.bits-pilani.ac.in'),
  ('PUR-01', 'p20250085@hyderabad.bits-pilani.ac.in'),
  ('PUR-02', 'p20250086@hyderabad.bits-pilani.ac.in'),
  ('PUR-03', 'p20230100@hyderabad.bits-pilani.ac.in'),
  ('PUR-04', 'p20250086@hyderabad.bits-pilani.ac.in'),
  ('PUR-05', 'p20240100@hyderabad.bits-pilani.ac.in'),
  ('PUR-06', 'p20240003@hyderabad.bits-pilani.ac.in'),
  ('PUR-07', 'p20240076@hyderabad.bits-pilani.ac.in'),
  ('PUR-08', 'p20240076@hyderabad.bits-pilani.ac.in'),
  ('PUR-09', 'p20240076@hyderabad.bits-pilani.ac.in'),
  ('PUR-10', 'p20240076@hyderabad.bits-pilani.ac.in'),
  ('PUR-11', 'p20250085@hyderabad.bits-pilani.ac.in'),
  ('PUR-12', 'p20240003@hyderabad.bits-pilani.ac.in'),
  ('PUR-13', 'p20241200@hyderabad.bits-pilani.ac.in'),
  ('PUR-14', 'p20240076@hyderabad.bits-pilani.ac.in'),
  ('PUR-15', 'p20250085@hyderabad.bits-pilani.ac.in'),
  ('PUR-16', 'p20260097@hyderabad.bits-pilani.ac.in'),
  ('PUR-17', 'p20230803@hyderabad.bits-pilani.ac.in'),
  ('PUR-18', 'p20220007@hyderabad.bits-pilani.ac.in')
) AS m(code, email)
JOIN users u ON u.email = m.email
WHERE i.code = m.code;

-- 3) Sanity check: every active instrument should now have an incharge
SELECT code, name, technician_id FROM instruments WHERE active = 1 AND technician_id IS NULL;