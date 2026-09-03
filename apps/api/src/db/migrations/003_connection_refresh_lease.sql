ALTER TABLE provider_connections
  ADD COLUMN refresh_lease_id uuid,
  ADD COLUMN refresh_lease_expires_at timestamptz;

CREATE INDEX provider_connections_refresh_lease_idx
  ON provider_connections(refresh_lease_expires_at)
  WHERE refresh_lease_id IS NOT NULL;

