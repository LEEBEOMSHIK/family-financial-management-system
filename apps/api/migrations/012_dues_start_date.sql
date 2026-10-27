ALTER TABLE dues_event ADD COLUMN starts_on date;
ALTER TABLE dues_event ADD CONSTRAINT dues_start_date_month CHECK (
 starts_on IS NULL OR (kind='fee' AND month=(date_trunc('month',starts_on)+interval '1 month')::date)
);
