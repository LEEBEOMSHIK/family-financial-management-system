CREATE TABLE participant_profile_event (
 family_id text NOT NULL, participant_id text NOT NULL, version integer NOT NULL CHECK(version>0),
 display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 1 AND 60),
 birthday jsonb, actor_id text NOT NULL, operation_id text NOT NULL, payload jsonb NOT NULL,
 created_at timestamptz NOT NULL,
 PRIMARY KEY(family_id,participant_id,version), UNIQUE(family_id,actor_id,operation_id),
 FOREIGN KEY(family_id,participant_id) REFERENCES family_participant(family_id,id),
 FOREIGN KEY(family_id,actor_id) REFERENCES membership(family_id,user_id)
);
CREATE TRIGGER immutable_participant_profile BEFORE UPDATE OR DELETE OR TRUNCATE ON participant_profile_event FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
GRANT SELECT,INSERT ON participant_profile_event TO family_ledger_app;
