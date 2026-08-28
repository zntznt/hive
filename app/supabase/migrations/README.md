# These files, and production's ledger

Two records of the same schema, and they do not line up. That is not a bug to
fix, it is a thing to know before reading either one.

**These files** are a curated, consolidated, gapless sequence, `0001` to the
latest. Several of them fold together work that reached production as three or
four separate applies. They exist so `npm run sandbox:reset` can build the
database from nothing, which is the only check that they still can.

**Production's ledger**, `supabase_migrations.schema_migrations`, is the
history of what actually ran, keyed by a 14 digit timestamp. It has more rows
than this directory has files, in a different order, and its `name` column is
whatever the apply was called at the time.

So a number in the ledger is not a number here. The ledger's
`0015_availability_nudge` ran on 30 July; this directory's `0015` is
`signin_template_wording`, a different thing entirely. Reading across the two
by number gives a confident wrong answer, which is how the missing thread
table got written up as "created through the API" before the ledger was
actually consulted.

## Do not use `supabase db push`

The CLI derives a version from the filename. These are `0001_…`, not
timestamps, so `db push` reads every file as unapplied and tries to run the
lot against production. Production is changed with `apply_migration`, one file
at a time, deliberately. The sandbox is built with `db reset`.

## The four that were never written down

A batch applied on 30 July never reached version control. Each has a ledger
entry, no file, and was recovered later by reading production:

| ledger entry | what it did | recovered by |
|---|---|---|
| `0015_availability_nudge` | the availability nudge templates for email and WhatsApp | `0059` |
| `0016_event_thread` | `event_comments` | `0057` |
| `0017_event_receipts` | `events.scheduled_at`, `events.cancelled_at` | `0048` |
| `0018_event_bin_and_snooze` | `events.deleted_at`, `plate_snoozes` | `0021` |
| | its `change_requests` kinds and `events_deleted_idx` | `0058` |

Every one of them was found the same way: by building a database from these
files and watching the app fall over. None was found by reading.

## Checking that these files still build production

Reset the sandbox, then compare. Schema first, ten categories, and the
fingerprints should match on every one except functions:

```sql
-- columns, constraints, indexes, rls, policies, functions,
-- triggers, enums, grants, views
select kind, count(*), md5(string_agg(key || ' :: ' || def, E'\n' order by key, def))
  from ( ... ) group by kind order by kind;
```

Functions differ on comment text alone, because migration files get edited
after they have already run: production keeps the text from the day it ran and
a rebuild produces today's. Strip comments and whitespace before comparing and
all of them match.

Then data, because the schema diff cannot see rows and one of the four
missing migrations was rows only:

```sql
select md5(string_agg(channel || '/' || key || '/' || coalesce(lang,'-'),
                      E'\n' order by channel, key, lang)), count(*)
  from notification_templates;
```

A missing template does not raise. `notify.ts` files the send as
`no_template` and nothing arrives, which is why this one hid through three
previous rounds of the same hunt.
