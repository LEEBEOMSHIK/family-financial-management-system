CREATE TABLE managed_document (
 id text PRIMARY KEY, family_id text NOT NULL, actor_id text NOT NULL,
 root_id text NOT NULL, version integer NOT NULL CHECK(version > 0),
 kind text NOT NULL CHECK(kind IN ('bank','family')),
 title text NOT NULL, category text NOT NULL, description text NOT NULL,
 filename text NOT NULL, media_type text NOT NULL,
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 6291456),
 sha256 text NOT NULL, original_cipher bytea NOT NULL,
 operation_id text NOT NULL, created_at timestamptz NOT NULL,
 UNIQUE(family_id,id), UNIQUE(family_id,root_id,version), UNIQUE(family_id,actor_id,operation_id),
 FOREIGN KEY(family_id,actor_id) REFERENCES membership(family_id,user_id),
 FOREIGN KEY(family_id,root_id) REFERENCES managed_document(family_id,id)
);
CREATE INDEX managed_document_listing ON managed_document(family_id,kind,created_at DESC);
CREATE TABLE document_download (
 id text PRIMARY KEY, family_id text NOT NULL, actor_id text NOT NULL,
 document_id text, evidence_id text, occurred_at timestamptz NOT NULL,
 CHECK((document_id IS NULL) <> (evidence_id IS NULL)),
 FOREIGN KEY(family_id,actor_id) REFERENCES membership(family_id,user_id),
 FOREIGN KEY(family_id,document_id) REFERENCES managed_document(family_id,id),
 FOREIGN KEY(family_id,evidence_id) REFERENCES evidence(family_id,id)
);
CREATE TRIGGER immutable_managed_document BEFORE UPDATE OR DELETE OR TRUNCATE ON managed_document FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
CREATE TRIGGER immutable_document_download BEFORE UPDATE OR DELETE OR TRUNCATE ON document_download FOR EACH STATEMENT EXECUTE FUNCTION reject_fact_mutation();
GRANT SELECT,INSERT ON managed_document,document_download TO family_ledger_app;
