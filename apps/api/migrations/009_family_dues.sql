CREATE TABLE dues_event (
 sequence bigserial PRIMARY KEY,
 id text NOT NULL UNIQUE, family_id text NOT NULL, actor_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('fee','deadline','payment','reversal','reminder')),
 month date NOT NULL CHECK(EXTRACT(DAY FROM month)=1), member_id text,
 amount_krw bigint CHECK(amount_krw>0), due_day integer CHECK(due_day BETWEEN 1 AND 31),
 transaction_id text, payment_id text, operation_id text NOT NULL,
 payload jsonb NOT NULL, created_at timestamptz NOT NULL,
 UNIQUE(family_id,id), UNIQUE(family_id,actor_id,operation_id),
 FOREIGN KEY(family_id,actor_id) REFERENCES membership(family_id,user_id),
 FOREIGN KEY(family_id,member_id) REFERENCES membership(family_id,user_id),
 FOREIGN KEY(family_id,transaction_id) REFERENCES imported_bank_transaction(family_id,id),
 FOREIGN KEY(family_id,payment_id) REFERENCES dues_event(family_id,id),
 CHECK((kind='fee' AND member_id IS NOT NULL AND amount_krw IS NOT NULL AND due_day IS NULL AND transaction_id IS NULL AND payment_id IS NULL)
 OR (kind='deadline' AND member_id IS NULL AND amount_krw IS NULL AND due_day IS NOT NULL AND transaction_id IS NULL AND payment_id IS NULL)
 OR (kind='payment' AND member_id IS NOT NULL AND amount_krw IS NOT NULL AND transaction_id IS NOT NULL AND due_day IS NULL AND payment_id IS NULL)
 OR (kind='reversal' AND payment_id IS NOT NULL AND member_id IS NOT NULL AND amount_krw IS NULL AND due_day IS NULL AND transaction_id IS NULL)
 OR (kind='reminder' AND member_id IS NOT NULL AND amount_krw IS NOT NULL AND due_day IS NULL AND transaction_id IS NULL AND payment_id IS NULL))
);
CREATE INDEX dues_family_month ON dues_event(family_id,month,sequence);
CREATE UNIQUE INDEX dues_one_reversal ON dues_event(family_id,payment_id) WHERE kind='reversal';
CREATE TRIGGER immutable_dues_event BEFORE UPDATE OR DELETE OR TRUNCATE ON dues_event FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
GRANT SELECT,INSERT ON dues_event TO family_ledger_app;
GRANT USAGE,SELECT ON SEQUENCE dues_event_sequence_seq TO family_ledger_app;
