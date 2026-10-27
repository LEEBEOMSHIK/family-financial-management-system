CREATE TABLE dues_fee_replacement (
 family_id text NOT NULL, previous_id text NOT NULL, replacement_id text NOT NULL,
 created_at timestamptz NOT NULL,
 PRIMARY KEY(family_id,previous_id), UNIQUE(family_id,replacement_id),
 CHECK(previous_id<>replacement_id),
 FOREIGN KEY(family_id,previous_id) REFERENCES dues_event(family_id,id),
 FOREIGN KEY(family_id,replacement_id) REFERENCES dues_event(family_id,id)
);
CREATE TRIGGER immutable_dues_fee_replacement BEFORE UPDATE OR DELETE OR TRUNCATE ON dues_fee_replacement FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
GRANT SELECT,INSERT ON dues_fee_replacement TO family_ledger_app;
