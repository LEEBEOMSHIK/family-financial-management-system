CREATE TABLE bank_statement_sync (
 id text PRIMARY KEY, family_id text NOT NULL, document_id text NOT NULL,
 parser_version integer NOT NULL, account_cipher bytea,
 status text NOT NULL CHECK(status IN ('synced','needs_review')),
 period_start date, period_end date, requested_at timestamptz,
 transaction_start timestamptz, transaction_end timestamptz,
 added integer NOT NULL CHECK(added>=0), duplicates integer NOT NULL CHECK(duplicates>=0),
 error text, completed_at timestamptz NOT NULL,
 UNIQUE(family_id,id), UNIQUE(family_id,document_id,parser_version),
 FOREIGN KEY(family_id,document_id) REFERENCES managed_document(family_id,id)
);
CREATE TABLE imported_bank_transaction (
 id text PRIMARY KEY, family_id text NOT NULL,
 occurred_at timestamptz NOT NULL, amount_krw bigint NOT NULL, balance_after_krw bigint NOT NULL,
 bank_type text NOT NULL, description text NOT NULL, memo text NOT NULL,
 document_id text NOT NULL, source_row integer NOT NULL, source_order integer NOT NULL,
 UNIQUE(family_id,id), UNIQUE(family_id,occurred_at,amount_krw,balance_after_krw),
 FOREIGN KEY(family_id,document_id) REFERENCES managed_document(family_id,id)
);
CREATE TABLE bank_statement_row (
 family_id text NOT NULL, sync_id text NOT NULL, source_row integer NOT NULL, transaction_id text NOT NULL,
 PRIMARY KEY(family_id,sync_id,source_row),
 FOREIGN KEY(family_id,sync_id) REFERENCES bank_statement_sync(family_id,id),
 FOREIGN KEY(family_id,transaction_id) REFERENCES imported_bank_transaction(family_id,id)
);
CREATE INDEX imported_bank_listing ON imported_bank_transaction(family_id,occurred_at DESC);
CREATE TRIGGER immutable_bank_statement_sync BEFORE UPDATE OR DELETE OR TRUNCATE ON bank_statement_sync FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
CREATE TRIGGER immutable_imported_bank_transaction BEFORE UPDATE OR DELETE OR TRUNCATE ON imported_bank_transaction FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
CREATE TRIGGER immutable_bank_statement_row BEFORE UPDATE OR DELETE OR TRUNCATE ON bank_statement_row FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
GRANT SELECT,INSERT ON bank_statement_sync,imported_bank_transaction,bank_statement_row TO family_ledger_app;
