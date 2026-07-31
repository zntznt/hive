-- The same payment, claimed twice.
--
-- settlements had only a primary key on id, so a double submit, a retried
-- server action or two open tabs each wrote an identical pending row. Both
-- surfaces net pending settlements out of the balance, so the debtor's number
-- shot past zero into credit, and the recipient saw two visually identical
-- "X dice que te pagó $Y" rows and could confirm both. Two confirmed rows of
-- 100 leave the debtor +200 and the creditor -200: a real double credit, with
-- no guard at any layer.
--
-- One outstanding claim per debtor, creditor and event. Partial, because two
-- CONFIRMED payments of the same amount between the same pair are ordinary
-- (you can settle up twice for two different expenses) and only the unresolved
-- ones can be confused for each other.
create unique index if not exists settlements_one_pending_claim
  on public.settlements (event_id, from_user, to_user)
  where not confirmed;
