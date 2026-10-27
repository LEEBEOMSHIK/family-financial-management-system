CREATE TABLE family_participant (
 family_id text NOT NULL REFERENCES family(id), id text NOT NULL,
 display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 1 AND 60),
 created_at timestamptz NOT NULL, created_by text, operation_id text,
 PRIMARY KEY(family_id,id), UNIQUE(family_id,created_by,operation_id),
 FOREIGN KEY(family_id,created_by) REFERENCES membership(family_id,user_id)
);
INSERT INTO family_participant(family_id,id,display_name,created_at)
 SELECT m.family_id,a.id,a.display_name,now() FROM membership m JOIN account a ON a.id=m.user_id;
CREATE FUNCTION register_account_participant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO family_participant(family_id,id,display_name,created_at)
 SELECT NEW.family_id,a.id,a.display_name,now() FROM account a WHERE a.id=NEW.user_id
 ON CONFLICT(family_id,id) DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER account_participant AFTER INSERT ON membership FOR EACH ROW EXECUTE FUNCTION register_account_participant();
ALTER TABLE dues_event DROP CONSTRAINT dues_event_family_id_member_id_fkey;
ALTER TABLE dues_event ADD CONSTRAINT dues_participant_fk FOREIGN KEY(family_id,member_id) REFERENCES family_participant(family_id,id);
CREATE TABLE participant_invitation (
 token_hash text PRIMARY KEY REFERENCES invitation(token_hash),
 family_id text NOT NULL, participant_id text NOT NULL,
 FOREIGN KEY(family_id,participant_id) REFERENCES family_participant(family_id,id)
);
CREATE TRIGGER immutable_family_participant BEFORE UPDATE OR DELETE OR TRUNCATE ON family_participant FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
CREATE TRIGGER immutable_participant_invitation BEFORE UPDATE OR DELETE OR TRUNCATE ON participant_invitation FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
GRANT SELECT,INSERT ON family_participant,participant_invitation TO family_ledger_app;
