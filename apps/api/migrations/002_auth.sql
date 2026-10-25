CREATE TABLE IF NOT EXISTS account (
    id text PRIMARY KEY,
    username text UNIQUE NOT NULL,
    display_name text NOT NULL,
    password_hash text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_session (
    token_hash text PRIMARY KEY,
    user_id text NOT NULL REFERENCES account(id),
    family_id text NOT NULL,
    csrf_token text NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    FOREIGN KEY (family_id,user_id) REFERENCES membership(family_id,user_id)
);
CREATE TABLE IF NOT EXISTS invitation (
    token_hash text PRIMARY KEY,
    family_id text NOT NULL,
    actor_id text NOT NULL REFERENCES account(id),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL,
    used_at timestamptz,
    used_by text REFERENCES account(id),
    FOREIGN KEY (family_id) REFERENCES family(id),
    FOREIGN KEY (family_id,actor_id) REFERENCES membership(family_id,user_id)
);
CREATE TABLE IF NOT EXISTS auth_throttle (
    key_hash text PRIMARY KEY,
    attempts integer NOT NULL,
    window_start timestamptz NOT NULL
);
GRANT SELECT,INSERT,UPDATE ON account,auth_session,invitation,auth_throttle TO family_ledger_app;
GRANT INSERT ON membership TO family_ledger_app;
