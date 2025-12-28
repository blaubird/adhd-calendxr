CREATE INDEX IF NOT EXISTS items_user_day_time_idx ON items (user_id, day, time_start);
CREATE INDEX IF NOT EXISTS items_status_idx ON items (status);
