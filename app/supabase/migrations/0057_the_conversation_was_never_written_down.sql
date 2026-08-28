-- The thread on an event page, which production has had all along and these
-- files have never been able to build.
--
-- `event_comments` exists on the deployed database and in no migration, no
-- seed and no RLS test here. Production's ledger names the one that made it:
-- `20260730222105 0016_event_thread`, applied on 30 July. No such file was
-- ever committed. `git log -S event_comments` over supabase/migrations finds
-- nothing before this commit, so the migration ran against production and then
-- never reached version control at all.
--
-- The result was that `npm run sandbox:reset` produced 33 tables where
-- production has 34, and the Conversación section answered every read with
-- "Could not find the table 'public.event_comments' in the schema cache" and
-- took the whole event page down with a 500. Two places write to it,
-- actions.ts and the event page, and both worked in production and nowhere
-- else.
--
-- That July batch is worth knowing about on its own. It reused numbers that
-- were already taken, so production has both an 0016_signin_codes and an
-- 0016_event_thread, an 0017 twice and an 0018 twice, and only one of each
-- pair is a file here. The table lists match now, 34 against 34, so nothing
-- else is missing outright, but a ledger that disagrees with the directory is
-- worth a proper audit rather than this footnote.
--
-- This is the third time in this repo: 0052 and 0054 were both the same shape,
-- something that worked on production because production was built by applying
-- things as they happened, which is not the same as these files being able to
-- build it. The check that catches it is running the app against a fresh
-- sandbox, and it caught this one too.
--
-- Every definition below is transcribed from what production reports today
-- rather than designed here, so applying this there changes nothing and a
-- database built from these files matches the one people are using.

create table if not exists public.event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  -- on delete cascade on the author too: deleting an account takes their
  -- messages with it, which is what "eliminar cuenta" promises.
  user_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  -- set when somebody edits their own line, so the thread can say so
  edited_at timestamptz,
  -- Trimmed length, so a message of nothing but spaces is not a message. The
  -- ceiling is the thread's, not the database's idea of a limit: past a couple
  -- of thousand characters this is a document, and the composer is one line.
  constraint event_comments_body_check
    check (length(btrim(body)) >= 1 and length(btrim(body)) <= 2000)
);

-- The thread is always read as "this event, oldest first", which is exactly
-- this index and the order the page asks for.
create index if not exists event_comments_event_idx
  on public.event_comments (event_id, created_at);

alter table public.event_comments enable row level security;

-- The policies carry no TO clause, which is what production has. `anon` is
-- reached by them in name only: is_active_user() is false without a session,
-- so a stranger matches nothing here.

-- Same visibility as the event itself. can_see_event is what every other read
-- on an event is gated by, so the thread cannot be more visible than the night
-- it belongs to.
drop policy if exists event_comments_select on public.event_comments;
create policy event_comments_select on public.event_comments
for select
using (is_active_user() and can_see_event(event_id));

-- Posting is for people actually on the event, under their own name. The
-- user_id check is what stops a member writing a line as somebody else.
drop policy if exists event_comments_insert on public.event_comments;
create policy event_comments_insert on public.event_comments
for insert
with check (is_active_user() and user_id = auth.uid() and is_event_member(event_id));

-- Editing is your own words only, never an organizer's privilege. Taking
-- something down is one thing; rewriting what somebody said is another.
drop policy if exists event_comments_update on public.event_comments;
create policy event_comments_update on public.event_comments
for update
using (user_id = auth.uid());

-- Deleting is your own, or anything if you run the event, the same rule the
-- album uses in 0039.
drop policy if exists event_comments_delete on public.event_comments;
create policy event_comments_delete on public.event_comments
for delete
using (user_id = auth.uid() or is_event_organizer(event_id));
