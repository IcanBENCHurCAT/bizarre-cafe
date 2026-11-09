ALTER TABLE event_attendance ADD CONSTRAINT event_attendance_event_id_user_id_key UNIQUE (event_id, user_id);
