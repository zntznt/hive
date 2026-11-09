-- Any active member could write the outbox, and the outbox is what we send.
--
-- outbox_insert (0005) let an active user queue a row for themselves or for
-- anyone they share a club or an event with, with any template and any
-- payload. outbox_update let them rewrite such a row while it waited. The
-- dispatcher runs as the service role and renders the payload into mail from
-- our own address, so the public key could send a club-mate an email that
-- said whatever it liked, inside a real template, from Hive.
--
-- Nothing in the app needs either policy. Every row is queued by
-- queueNotification and settled by the dispatcher, both on the service role,
-- which bypasses RLS; the rest are written by SECURITY DEFINER functions,
-- which run as the table's owner. Reading stays as it was (outbox_select):
-- a member still sees their own rows, an admin sees all of them.
drop policy if exists outbox_insert on public.notification_outbox;
drop policy if exists outbox_update on public.notification_outbox;

-- Resending an invitation, claimed before it is sent.
--
-- resendInvitation read last_sent_at, sent, then stamped it. There is no
-- UPDATE policy on invitations, so the stamp never landed (and neither did the
-- 30 day revival it carried), and two clicks at once both passed the read
-- anyway. Each resend is mail from our address to someone who never signed
-- up, so this is the flood guard: one statement checks the caller may manage
-- the invitation (the same test as invitations_select), that it is still
-- open, and that the last send was more than ten minutes ago, and stamps it.
-- Only the caller that gets `true` sends.
create or replace function public.claim_invitation_resend(inv_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare ok boolean;
begin
  update invitations i
     set last_sent_at = now(),
         expires_at = now() + interval '30 days'
   where i.id = inv_id
     and i.claimed_by_user_id is null
     and i.declined_at is null
     and (i.last_sent_at is null or i.last_sent_at < now() - interval '10 minutes')
     and ((i.event_id is not null and is_event_organizer(i.event_id))
          or (i.club_id is not null and is_club_admin(i.club_id))
          or is_app_admin())
  returning true into ok;
  return coalesce(ok, false);
end $$;

revoke execute on function public.claim_invitation_resend(uuid) from public, anon;
grant execute on function public.claim_invitation_resend(uuid) to authenticated;
