-- The revokes in 0031 did not revoke anything.
--
-- Postgres grants EXECUTE on every new function to PUBLIC, and both anon and
-- authenticated inherit from PUBLIC. So `revoke execute ... from anon` removes
-- a grant that was never there and leaves the PUBLIC one standing: checked
-- afterwards, admin_set_app_admin, approve_change_request, rsvp_set, pick_slot
-- and the rest were still reachable at /rest/v1/rpc/... with the anon key.
-- Only the two functions written with `from public, anon, authenticated`
-- actually moved.
--
-- Nothing was breached by that: each of those functions checks the caller's
-- role itself, which is why they were safe enough to ship. But an endpoint
-- that is only safe because of what it does after you reach it is one bad edit
-- away from not being safe, and the intent of the last migration was that anon
-- should not reach them at all. This does that properly: take PUBLIC away,
-- then grant back to exactly the role that needs it.

do $$
declare
  -- everything a signed-in member, organizer or admin invokes
  f text;
  signed_in text[] := array[
    'add_expense_with_shares(uuid, integer, text, uuid[], uuid[])',
    'admin_set_app_admin(uuid, boolean)',
    'admin_set_user_status(uuid, user_status)',
    'apply_poll_option(uuid, uuid)',
    'approve_change_request(uuid)',
    'approve_join_request(uuid)',
    'claim_invitation(text)',
    'confirm_rsvp(uuid)',
    'decline_invitation(text, boolean)',
    'join_event(text)',
    'mark_attendance(uuid, uuid[])',
    'nudge_admins()',
    'pending_queue_status()',
    'pick_slot(uuid, timestamptz, timestamptz)',
    'poll_results(uuid)',
    'promote_guest(uuid, citext, text)',
    'promote_waitlist(uuid)',
    'replace_payment_methods(jsonb)',
    'request_account_deletion()',
    'request_join_club(text)',
    'rsvp_set(uuid, rsvp_status)',
    'set_event_deleted(uuid, boolean)',
    'set_event_status(uuid, event_status)'
  ];
  -- trigger functions. Postgres refuses to call these directly ("can only be
  -- called as a trigger"), so this is tidiness rather than a hole, but there is
  -- no reason for them to appear in the API surface at all.
  triggers text[] := array[
    'absorb_guest_shares()',
    'club_creator_becomes_admin()',
    'event_organizer_becomes_member()',
    'guests_fit()',
    'handle_new_user()',
    'log_activity()',
    'prevent_privilege_change()',
    'protect_last_club_admin()',
    'reallocate_on_amount_change()',
    'reallocate_shares_trg()',
    'settlements_guard()'
  ];
  -- internal helpers with no caller outside other definer functions
  internal text[] := array[
    'event_seats_taken(uuid, uuid)'
  ];
begin
  foreach f in array signed_in loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array triggers || internal loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- Deliberately still open to anon:
--
--   get_invitation_preview, get_club_join_preview
--     the invite and join landing pages render before anyone signs in. Both
--     take a token, return one club or event and nothing else, and are the
--     reason those pages can say what you are being invited to.
--
--   is_active_user, is_app_admin, is_club_member, is_club_admin,
--   is_club_manager, is_event_member, is_event_organizer, can_see_event
--     these appear inside RLS policy expressions, which run as the invoking
--     role, so anon has to be able to execute them for its own policies to
--     evaluate at all. Each is a predicate about auth.uid(), which is null for
--     anon, so they answer false and tell it nothing.

-- Not a hole (the function is SECURITY INVOKER, so it runs as whoever fired
-- the trigger and can reach nothing they could not), but a definer-shaped
-- footgun to leave lying around, and the only function in the schema without a
-- pinned search_path.
alter function public.touch_updated_at() set search_path = public;
