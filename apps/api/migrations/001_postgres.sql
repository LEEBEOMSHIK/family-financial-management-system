CREATE TABLE family (
    id text PRIMARY KEY,
    role_version bigint NOT NULL DEFAULT 0 CHECK (role_version >= 0)
);
CREATE TABLE membership (
    family_id text NOT NULL REFERENCES family(id),
    user_id text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    PRIMARY KEY (family_id, user_id)
);
CREATE TABLE role_assignment (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    family_id text NOT NULL,
    user_id text NOT NULL,
    role text NOT NULL CHECK (role IN ('member','treasurer','super_admin')),
    valid_from timestamptz NOT NULL,
    valid_to timestamptz,
    CHECK (valid_to IS NULL OR valid_from < valid_to),
    UNIQUE (family_id, id),
    FOREIGN KEY (family_id,user_id) REFERENCES membership(family_id,user_id)
);
CREATE TABLE role_assignment_end (
    assignment_id bigint PRIMARY KEY,
    family_id text NOT NULL,
    ended_at timestamptz NOT NULL,
    FOREIGN KEY (family_id,assignment_id) REFERENCES role_assignment(family_id,id)
);
CREATE TABLE role_event (
    family_id text NOT NULL,
    version bigint NOT NULL CHECK (version > 0),
    user_id text NOT NULL,
    before_role text NOT NULL CHECK (before_role IN ('member','treasurer','super_admin')),
    after_role text NOT NULL CHECK (after_role IN ('member','treasurer','super_admin')),
    actor_id text NOT NULL,
    occurred_at text NOT NULL,
    reason text NOT NULL,
    PRIMARY KEY (family_id,version),
    FOREIGN KEY (family_id,user_id) REFERENCES membership(family_id,user_id),
    FOREIGN KEY (family_id,actor_id) REFERENCES membership(family_id,user_id)
);
CREATE TABLE ledger_transaction (
    family_id text NOT NULL REFERENCES family(id),
    id text NOT NULL,
    occurred_on date NOT NULL,
    description text NOT NULL,
    amount_krw bigint NOT NULL,
    category text NOT NULL,
    reconciliation_status text NOT NULL CHECK (reconciliation_status IN ('pending','reconciled')),
    synthetic boolean NOT NULL,
    PRIMARY KEY (family_id,id)
);
CREATE TABLE seed_import (
    marker text PRIMARY KEY,
    source_sha256 text,
    imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION reject_fact_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Immutable fact: append a correction instead';
END;
$$;
CREATE TRIGGER immutable_roles BEFORE UPDATE OR DELETE ON role_assignment
FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
CREATE TRIGGER immutable_role_ends BEFORE UPDATE OR DELETE ON role_assignment_end
FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
CREATE TRIGGER immutable_role_events BEFORE UPDATE OR DELETE ON role_event
FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
CREATE TRIGGER immutable_transactions BEFORE UPDATE OR DELETE ON ledger_transaction
FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
CREATE TRIGGER immutable_seed BEFORE UPDATE OR DELETE ON seed_import
FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
GRANT SELECT ON family,membership,role_assignment,role_assignment_end,role_event,ledger_transaction TO family_ledger_app;
GRANT UPDATE (role_version) ON family TO family_ledger_app;
GRANT INSERT ON role_assignment,role_assignment_end,role_event TO family_ledger_app;
GRANT USAGE,SELECT ON SEQUENCE role_assignment_id_seq TO family_ledger_app;
