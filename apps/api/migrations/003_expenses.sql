CREATE TABLE expense_request (
    id text PRIMARY KEY,
    family_id text NOT NULL REFERENCES family(id),
    requester_id text NOT NULL,
    amount_krw bigint NOT NULL CHECK(amount_krw > 0),
    purpose text NOT NULL,
    payee_name text NOT NULL,
    requested_on date NOT NULL,
    created_at timestamptz NOT NULL,
    operation_id text NOT NULL,
    UNIQUE(family_id,id),
    UNIQUE(family_id,requester_id,operation_id),
    FOREIGN KEY(family_id,requester_id) REFERENCES membership(family_id,user_id)
);
CREATE TABLE expense_policy (
    version text PRIMARY KEY,
    family_id text NOT NULL REFERENCES family(id),
    single_approval boolean NOT NULL,
    self_approval boolean NOT NULL,
    effective_at timestamptz NOT NULL,
    source text NOT NULL,
    UNIQUE(family_id,version)
);
CREATE TABLE expense_decision (
    family_id text NOT NULL,
    request_id text NOT NULL,
    actor_id text NOT NULL,
    decision text NOT NULL CHECK(decision IN ('approved','rejected')),
    comment text NOT NULL,
    decided_at timestamptz NOT NULL,
    policy_version text NOT NULL,
    PRIMARY KEY(family_id,request_id),
    FOREIGN KEY(family_id,request_id) REFERENCES expense_request(family_id,id),
    FOREIGN KEY(family_id,actor_id) REFERENCES membership(family_id,user_id),
    FOREIGN KEY(family_id,policy_version) REFERENCES expense_policy(family_id,version)
);
CREATE INDEX expense_request_family_date ON expense_request(family_id,created_at DESC);
CREATE TRIGGER immutable_expense_request BEFORE UPDATE OR DELETE OR TRUNCATE ON expense_request
FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
CREATE TRIGGER immutable_expense_decision BEFORE UPDATE OR DELETE OR TRUNCATE ON expense_decision
FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
CREATE TRIGGER immutable_expense_policy BEFORE UPDATE OR DELETE OR TRUNCATE ON expense_policy
FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
GRANT SELECT,INSERT ON expense_request,expense_decision TO family_ledger_app;
GRANT SELECT ON expense_policy TO family_ledger_app;
