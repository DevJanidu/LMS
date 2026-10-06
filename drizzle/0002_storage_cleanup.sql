-- Queue object removal before metadata is cascade-deleted. The queue has no
-- user FK, so it survives deletion of the owning account or subject.
CREATE FUNCTION queue_deleted_storage_object() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.storage_key IS NOT NULL THEN
    INSERT INTO pending_object_deletions (storage_key) VALUES (OLD.storage_key)
    ON CONFLICT (storage_key) DO NOTHING;
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER resources_storage_cleanup BEFORE DELETE ON resources
FOR EACH ROW EXECUTE FUNCTION queue_deleted_storage_object();
--> statement-breakpoint
CREATE TRIGGER pending_uploads_storage_cleanup BEFORE DELETE ON pending_uploads
FOR EACH ROW EXECUTE FUNCTION queue_deleted_storage_object();
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX subjects_title_search_idx ON subjects USING gin (title gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX topics_title_search_idx ON topics USING gin (title gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX resources_title_search_idx ON resources USING gin (title gin_trgm_ops);
