CREATE TABLE provider_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  state_hash text NOT NULL UNIQUE,
  code_verifier text NOT NULL,
  redirect_path text NOT NULL DEFAULT '/connections',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX provider_oauth_states_expiry_idx ON provider_oauth_states(expires_at);

