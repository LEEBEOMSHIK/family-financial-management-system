CREATE TABLE bank_account (
 id text PRIMARY KEY, family_id text NOT NULL, user_id text NOT NULL,
 bank_name text NOT NULL, account_holder text NOT NULL, label text NOT NULL,
 masked_number text NOT NULL, number_cipher bytea NOT NULL, created_at timestamptz NOT NULL,
 UNIQUE(family_id,user_id,id), UNIQUE(family_id,id),
 FOREIGN KEY(family_id,user_id) REFERENCES membership(family_id,user_id)
);
CREATE TABLE bank_account_default (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 family_id text NOT NULL, user_id text NOT NULL, account_id text NOT NULL, created_at timestamptz NOT NULL,
 FOREIGN KEY(family_id,user_id,account_id) REFERENCES bank_account(family_id,user_id,id)
);
CREATE TABLE evidence (
 id text PRIMARY KEY, family_id text NOT NULL, user_id text NOT NULL,
 media_type text NOT NULL, byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 6291456),
 sha256 text NOT NULL, original_cipher bytea NOT NULL, preview_cipher bytea NOT NULL, created_at timestamptz NOT NULL,
 UNIQUE(family_id,user_id,id), UNIQUE(family_id,id),
 FOREIGN KEY(family_id,user_id) REFERENCES membership(family_id,user_id)
);
ALTER TABLE expense_request ADD COLUMN request_type text NOT NULL DEFAULT 'legacy' CHECK(request_type IN ('legacy','advance','reimbursement'));
ALTER TABLE expense_request ADD COLUMN bank_account_id text;
ALTER TABLE expense_request ADD CONSTRAINT expense_bank_owner FOREIGN KEY(family_id,requester_id,bank_account_id) REFERENCES bank_account(family_id,user_id,id);
ALTER TABLE expense_request ADD CONSTRAINT expense_request_owner UNIQUE(family_id,requester_id,id);
ALTER TABLE expense_request ADD COLUMN initial_evidence_ids text[] NOT NULL DEFAULT '{}';
ALTER TABLE expense_decision ADD COLUMN evidence_ids text[] NOT NULL DEFAULT '{}';
CREATE TABLE expense_evidence (
 family_id text NOT NULL, user_id text NOT NULL, request_id text NOT NULL, evidence_id text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL,
 PRIMARY KEY(family_id,request_id,evidence_id),
 FOREIGN KEY(family_id,user_id,request_id) REFERENCES expense_request(family_id,requester_id,id),
 FOREIGN KEY(family_id,user_id,evidence_id) REFERENCES evidence(family_id,user_id,id)
);
CREATE TABLE financial_access (
 id text PRIMARY KEY, family_id text NOT NULL, actor_id text NOT NULL, account_id text NOT NULL,
 request_id text, occurred_at timestamptz NOT NULL,
 FOREIGN KEY(family_id,actor_id) REFERENCES membership(family_id,user_id),
 FOREIGN KEY(family_id,account_id) REFERENCES bank_account(family_id,id),
 FOREIGN KEY(family_id,request_id) REFERENCES expense_request(family_id,id)
);
CREATE TRIGGER immutable_bank_account BEFORE UPDATE OR DELETE OR TRUNCATE ON bank_account FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
CREATE TRIGGER immutable_bank_account_default BEFORE UPDATE OR DELETE OR TRUNCATE ON bank_account_default FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE OR TRUNCATE ON evidence FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
CREATE TRIGGER immutable_expense_evidence BEFORE UPDATE OR DELETE OR TRUNCATE ON expense_evidence FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
CREATE TRIGGER immutable_financial_access BEFORE UPDATE OR DELETE OR TRUNCATE ON financial_access FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
GRANT SELECT,INSERT ON bank_account,bank_account_default,evidence,expense_evidence,financial_access TO family_ledger_app;
GRANT USAGE ON SEQUENCE bank_account_default_sequence_seq TO family_ledger_app;
