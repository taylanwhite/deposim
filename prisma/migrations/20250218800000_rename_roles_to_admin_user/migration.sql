-- Rename roles: attorney → admin, member → user (order matters to avoid collision)
UPDATE users SET role = CASE
  WHEN role = 'attorney' THEN 'admin'
  WHEN role = 'member' THEN 'user'
  ELSE role
END
WHERE role IN ('attorney', 'member');

UPDATE invites SET role = CASE
  WHEN role = 'attorney' THEN 'admin'
  WHEN role = 'member' THEN 'user'
  ELSE role
END
WHERE role IN ('attorney', 'member');
