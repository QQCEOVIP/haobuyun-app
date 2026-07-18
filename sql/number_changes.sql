-- Number Changes Notification
-- 号码变更通知功能

CREATE TABLE IF NOT EXISTS number_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  old_phone TEXT NOT NULL,
  new_phone TEXT NOT NULL,
  publisher_id UUID NOT NULL REFERENCES auth.users(id),
  display_name TEXT NOT NULL,
  name_hash TEXT NOT NULL,
  remark TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),
  CONSTRAINT unique_old_phone_active UNIQUE (old_phone) WHERE status = 'active'
);

CREATE INDEX IF NOT EXISTS idx_number_changes_old_phone ON number_changes(old_phone) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_number_changes_publisher ON number_changes(publisher_id);
CREATE INDEX IF NOT EXISTS idx_number_changes_expires ON number_changes(expires_at) WHERE status = 'active';
