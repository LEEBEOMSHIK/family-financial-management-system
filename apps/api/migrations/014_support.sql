CREATE TABLE support_issue (
 id text PRIMARY KEY, family_id text NOT NULL, actor_id text NOT NULL,
 operation_id text NOT NULL, digest text NOT NULL,
 title text NOT NULL, description text NOT NULL, path text NOT NULL, screen_name text NOT NULL,
 viewport_width integer NOT NULL, viewport_height integer NOT NULL,
 pins jsonb NOT NULL CHECK (jsonb_typeof(pins)='array' AND jsonb_array_length(pins)<=5),
 image_cipher bytea, created_at timestamptz NOT NULL,
 UNIQUE(family_id,id), UNIQUE(family_id,actor_id,operation_id),
 FOREIGN KEY(family_id,actor_id) REFERENCES membership(family_id,user_id)
);
CREATE INDEX support_issue_listing ON support_issue(family_id,created_at DESC,id);
CREATE TABLE support_event (
 id text PRIMARY KEY, family_id text NOT NULL, issue_id text NOT NULL, actor_id text NOT NULL,
 version integer NOT NULL CHECK(version>0), operation_id text NOT NULL, digest text NOT NULL,
 comment text NOT NULL, status text CHECK(status IN ('received','investigating','needs_info','resolved')),
 created_at timestamptz NOT NULL,
 UNIQUE(family_id,issue_id,version), UNIQUE(family_id,issue_id,actor_id,operation_id),
 FOREIGN KEY(family_id,actor_id) REFERENCES membership(family_id,user_id),
 FOREIGN KEY(family_id,issue_id) REFERENCES support_issue(family_id,id)
);
CREATE TRIGGER immutable_support_issue BEFORE UPDATE OR DELETE OR TRUNCATE ON support_issue FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
CREATE TRIGGER immutable_support_event BEFORE UPDATE OR DELETE OR TRUNCATE ON support_event FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
GRANT SELECT,INSERT ON support_issue,support_event TO family_ledger_app;
