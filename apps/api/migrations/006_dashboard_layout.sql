CREATE TABLE dashboard_layout (
    family_id text NOT NULL REFERENCES family(id),
    user_id text NOT NULL REFERENCES account(id),
    revision integer NOT NULL CHECK (revision > 0),
    layout jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (family_id, user_id)
);
GRANT SELECT, INSERT, UPDATE ON dashboard_layout TO family_ledger_app;
