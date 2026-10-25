CREATE TABLE expense_payment (
    family_id text NOT NULL,
    request_id text NOT NULL,
    actor_id text NOT NULL,
    paid_on date NOT NULL,
    recorded_at timestamptz NOT NULL,
    note text NOT NULL,
    operation_id uuid NOT NULL,
    PRIMARY KEY(family_id,request_id),
    UNIQUE(family_id,operation_id),
    FOREIGN KEY(family_id,request_id) REFERENCES expense_decision(family_id,request_id),
    FOREIGN KEY(family_id,actor_id) REFERENCES membership(family_id,user_id)
);
CREATE TABLE expense_approval_notice (
    family_id text NOT NULL,
    request_id text NOT NULL,
    created_at timestamptz NOT NULL,
    channel text NOT NULL CHECK(channel='kakao_alimtalk'),
    state text NOT NULL CHECK(state='configuration_required'),
    PRIMARY KEY(family_id,request_id),
    FOREIGN KEY(family_id,request_id) REFERENCES expense_decision(family_id,request_id)
);
CREATE TRIGGER immutable_expense_payment BEFORE UPDATE OR DELETE OR TRUNCATE ON expense_payment
FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
CREATE TRIGGER immutable_expense_approval_notice BEFORE UPDATE OR DELETE OR TRUNCATE ON expense_approval_notice
FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
GRANT SELECT,INSERT ON expense_payment,expense_approval_notice TO family_ledger_app;
