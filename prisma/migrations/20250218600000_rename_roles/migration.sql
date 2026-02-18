-- Rename roles: admin → attorney, attorney → member (order matters to avoid collision)
UPDATE users SET role = CASE
  WHEN role = 'attorney' THEN 'member'
  WHEN role = 'admin' THEN 'attorney'
  ELSE role
END
WHERE role IN ('admin', 'attorney');

UPDATE invites SET role = CASE
  WHEN role = 'attorney' THEN 'member'
  WHEN role = 'admin' THEN 'attorney'
  ELSE role
END
WHERE role IN ('admin', 'attorney');
