-- Optional PostgreSQL GiST exclusion constraint for self-hosted deployments
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE OR REPLACE FUNCTION gv_immutable_date(text) RETURNS date
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT to_date($1, 'YYYY-MM-DD');
$$;

ALTER TABLE seat_allocations
  DROP CONSTRAINT IF EXISTS no_overlapping_active_seat_allocations;

ALTER TABLE seat_allocations
  ADD CONSTRAINT no_overlapping_active_seat_allocations
  EXCLUDE USING gist (
    center_id WITH =,
    seat_id WITH =,
    daterange(gv_immutable_date(start_date), gv_immutable_date(end_date), '[)') WITH &&,
    int4range(start_minute, end_minute, '[)') WITH &&
  )
  WHERE (status = 'ACTIVE');
