-- Finishing 0052, which I got half right.
--
-- That migration granted `anon` and `authenticated` everything on `public` and
-- stopped there. `service_role` was left with nothing, and it is the role the
-- whole notification pipeline runs as: lib/supabase/service.ts exists
-- precisely so that sending does not run under a member's session, because
-- notification_templates is admin-only and the outbox is scoped per person.
--
-- So on a database built from these files, every notification silently failed.
-- The dispatcher read "permission denied for table users", filed the send as
-- having no template, and nothing arrived. Production was fine, for the same
-- reason it was fine before 0052: its tables were created through Supabase's
-- API, where the default privilege covers all three roles.
--
-- Found by running the pipeline against a fresh sandbox rather than reading
-- it, which is the only way this class of thing ever turns up. It is the
-- second time in two days: the lesson is that a grant is not a detail of the
-- schema, it is the schema.
--
-- Unlike anon and authenticated, service_role gets `signin_throttle` as well.
-- It is the role that has to write it, and there is no RLS in front of it
-- because service_role bypasses RLS by design. This matches what production
-- reports today, so applying it there changes nothing.

grant usage on schema public to service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on routines to service_role;
