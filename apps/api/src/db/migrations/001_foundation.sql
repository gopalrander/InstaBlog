CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  home_latitude double precision,
  home_longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_normalized CHECK (email = lower(email)),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_home_location_complete CHECK (
    (home_latitude IS NULL AND home_longitude IS NULL) OR
    (home_latitude IS NOT NULL AND home_longitude IS NOT NULL)
  )
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE provider_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_user_id text,
  encrypted_access_token text NOT NULL,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'revoked', 'error')),
  discovery_cursor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz,
  CONSTRAINT provider_connections_user_id_id_unique UNIQUE (user_id, id),
  CONSTRAINT provider_connections_identity_unique
    UNIQUE NULLS NOT DISTINCT (user_id, provider, provider_user_id)
);
CREATE INDEX provider_connections_user_id_idx ON provider_connections(user_id);

CREATE TABLE album_builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  requested_timezone text NOT NULL,
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'discovering', 'processing', 'organizing', 'verifying', 'ready', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_date <= end_date),
  CONSTRAINT album_builds_user_id_id_unique UNIQUE (user_id, id)
);
CREATE INDEX album_builds_user_id_idx ON album_builds(user_id);

CREATE TABLE album_build_provider_status (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  album_build_id uuid NOT NULL,
  provider_connection_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'complete', 'partial', 'user_action_required', 'failed')),
  discovered_count integer NOT NULL DEFAULT 0 CHECK (discovered_count >= 0),
  next_cursor text,
  warning text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (album_build_id, provider_connection_id),
  FOREIGN KEY (user_id, album_build_id)
    REFERENCES album_builds(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, provider_connection_id)
    REFERENCES provider_connections(user_id, id) ON DELETE CASCADE
);

CREATE TABLE provider_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_connection_id uuid NOT NULL,
  provider_asset_id text NOT NULL,
  media_kind text NOT NULL CHECK (media_kind IN ('image', 'video', 'other')),
  captured_at_utc timestamptz,
  captured_at_local timestamp,
  captured_offset_minutes smallint CHECK (captured_offset_minutes BETWEEN -840 AND 840),
  captured_time_source text NOT NULL DEFAULT 'unknown'
    CHECK (captured_time_source IN ('exif', 'provider', 'file_mtime', 'unknown')),
  width integer CHECK (width > 0),
  height integer CHECK (height > 0),
  mime_type text,
  filename text,
  provider_content_hash text,
  provider_etag text,
  provider_metadata jsonb NOT NULL DEFAULT '{}',
  perceptual_hash text,
  quality_score real CHECK (quality_score BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider_connection_id, provider_asset_id),
  CONSTRAINT provider_assets_user_id_id_unique UNIQUE (user_id, id),
  FOREIGN KEY (user_id, provider_connection_id)
    REFERENCES provider_connections(user_id, id) ON DELETE CASCADE
);
CREATE INDEX provider_assets_user_connection_idx ON provider_assets(user_id, provider_connection_id);
CREATE INDEX provider_assets_capture_local_idx ON provider_assets(user_id, captured_at_local);
CREATE INDEX provider_assets_content_hash_idx ON provider_assets(user_id, provider_content_hash)
  WHERE provider_content_hash IS NOT NULL;

CREATE TABLE asset_embeddings (
  provider_asset_id uuid NOT NULL REFERENCES provider_assets(id) ON DELETE CASCADE,
  model_id text NOT NULL,
  dimensions integer NOT NULL CHECK (dimensions > 0),
  embedding vector NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_asset_id, model_id)
);

CREATE TABLE media_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  album_build_id uuid NOT NULL,
  provider_asset_id uuid NOT NULL,
  role text CHECK (role IN ('hero', 'recommended', 'secondary', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (album_build_id, provider_asset_id),
  FOREIGN KEY (user_id, album_build_id)
    REFERENCES album_builds(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, provider_asset_id)
    REFERENCES provider_assets(user_id, id) ON DELETE CASCADE
);
CREATE INDEX media_references_build_id_idx ON media_references(album_build_id);

CREATE TABLE agent_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_build_id uuid NOT NULL REFERENCES album_builds(id) ON DELETE CASCADE,
  task_type text NOT NULL CHECK (task_type IN (
    'discover_media', 'understand_media', 'reconstruct_journey',
    'curate_photos', 'design_album', 'verify_album'
  )),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'dead')),
  payload_json jsonb NOT NULL DEFAULT '{}',
  input_version text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  lease_expires_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (album_build_id, task_type, input_version)
);
CREATE INDEX agent_jobs_claim_idx ON agent_jobs(status, available_at, lease_expires_at);

CREATE TABLE agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_build_id uuid NOT NULL REFERENCES album_builds(id) ON DELETE CASCADE,
  agent_job_id uuid NOT NULL REFERENCES agent_jobs(id) ON DELETE CASCADE,
  agent_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  input_version text NOT NULL,
  output_json jsonb,
  confidence real CHECK (confidence BETWEEN 0 AND 1),
  error text,
  cost_metadata jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_runs_build_id_idx ON agent_runs(album_build_id);
