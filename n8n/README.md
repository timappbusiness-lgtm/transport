# n8n workflows

Four workflows. Postgres owns the decisions (who to notify, when to suspend);
n8n owns delivery and retries. Keeping that split means a Twilio outage never
corrupts application state — it just leaves rows in `notification_outbox`.

## Shared credentials

| Name | Type | Used by |
|---|---|---|
| `supabase-service` | Header Auth — `apikey` + `Authorization: Bearer <service_role_key>` | all |
| `twilio-whatsapp` | Twilio | 1 |
| `smtp-sender` | SMTP | 1 |

The service-role key bypasses RLS entirely. It belongs in n8n credentials and
nowhere else — never in a workflow node's body, never in a Lovable component.

---

## 1. `outbox-dispatcher` — the delivery loop

The only workflow that sends anything. Everything else just writes rows.

```
[Schedule Trigger]  every 5 minutes
        ↓
[Postgres: claim batch]
   update notification_outbox
   set status = 'sending', attempts = attempts + 1
   where id in (
     select id from notification_outbox
     where status = 'queued' and send_after <= now() and attempts < 5
     order by created_at limit 50
     for update skip locked          ← two runs must never claim the same row
   )
   returning *;
        ↓
[Switch on channel]
   ├── email    → [Send Email]     ← template from payload.template
   ├── whatsapp → [Twilio: WhatsApp template]
   ├── sms      → [Twilio: SMS]
   └── inapp    → [NoOp]  the row itself is the notification
        ↓                            ↓ (error output)
[Postgres: mark sent]        [IF attempts >= 5]
   status='sent',              ├── yes → [Postgres: status='failed', last_error]
   sent_at=now()               │          → [Slack: alert #alerts]
                               └── no  → [Postgres: status='queued',
                                          send_after = now() + interval '10 minutes' * attempts]
        ↓
[Postgres: log run]  insert into n8n_run_log(workflow, processed, failed, ran_at)
```

Notes that matter:

- **`FOR UPDATE SKIP LOCKED`** is what makes the claim safe. Without it, a slow
  run overlapping the next one sends everything twice.
- **Exponential backoff** via `send_after` — 10, 20, 30, 40 minutes. Five
  attempts then park it as `failed` and tell a human.
- **WhatsApp needs approved Meta templates.** `document_expiry_reminder` and
  `account_suspended` are utility templates; `listing_match` is marketing and
  needs its own opt-in. Outside the 24-hour customer service window only
  templates send — free text is silently dropped.
- **Fall back to SMS** when WhatsApp fails with a template or opt-in error, but
  only for `account_suspended`. It is the one message worth 0.08 RON of SMS.

Test payload:

```json
{
  "id": "00000000-0000-0000-0000-000000000001",
  "channel": "whatsapp",
  "template": "document_expiry_reminder",
  "to_phone": "+40722123456",
  "payload": {
    "company_name": "Transport Demo SRL",
    "document_label": "ITP (inspecție tehnică periodică)",
    "plate_number": "CJ45XYZ",
    "valid_until": "2026-10-14",
    "days_left": 7
  }
}
```

Romanian copy for that template:

> Bună ziua, {{company_name}}. {{document_label}} pentru {{plate_number}}
> expiră în {{days_left}} zile, pe {{valid_until}}. Încărcați documentul nou
> în platformă ca să evitați suspendarea contului.

---

## 2. `nightly-compliance` — the safety net

`pg_cron` already runs the sweep at 02:00 UTC. This workflow runs at 02:30 and
calls it again through the edge function. The sweep is idempotent, so a second
run costs nothing — and it is how we find out that `pg_cron` stopped.

```
[Schedule Trigger]  0 2 * * *  →  02:30 UTC
        ↓
[HTTP Request]  POST {SUPABASE_URL}/functions/v1/compliance-sweep
                header x-cron-secret: {{CRON_SECRET}}
                timeout 60s, retry 3x with 5s backoff
        ↓
[IF ok === true]
   ├── yes → [IF suspended_companies > 0]
   │            └── [Slack #ops] "{{n}} conturi suspendate azi: ..."
   └── no  → [Slack #alerts] "Compliance sweep FAILED: {{error}}"  ← page someone
        ↓
[Postgres: log run]
```

A failing sweep is the worst silent failure in the system: the platform keeps
showing trucks as verified while nothing is being checked. Alert loudly.

---

## 3. `listing-alerts` — saved-search matching

```
[Webhook]  called by a Supabase database webhook on
           INSERT into cargo_listings / truck_listings where status = 'active'
        ↓
[Postgres: find matching saved searches]
   select s.*, p.id as user_id, p.email, p.phone
   from saved_searches s
   join profiles p on p.id = s.user_id
   where s.is_active
     and s.target = $1
     and (s.filters->>'loading_county'  is null or s.filters->>'loading_county'  = $2)
     and (s.filters->>'unloading_county' is null or s.filters->>'unloading_county' = $3)
     and (s.filters->>'min_weight' is null or (s.filters->>'min_weight')::int <= $4)
     and (s.last_notified_at is null or s.last_notified_at < now() - interval '30 minutes')
        ↓
[IF no matches] → [NoOp, end]
        ↓
[Postgres: insert into notification_outbox]
   one row per match, channel from the saved search flags,
   template 'listing_match',
   dedupe_key = 'match:' || listing_id || ':' || saved_search_id
        ↓
[Postgres: update saved_searches set last_notified_at = now()]
```

- The **30-minute floor** per saved search is what keeps a dispatcher posting
  twenty loads from sending twenty WhatsApp messages to the same carrier. That
  is how people mute you permanently.
- `dedupe_key` is unique in the database, so a webhook retry cannot double-send.
- Delivery is not this workflow's job — it writes rows and stops.

---

## 4. `document-parse-retry`

```
[Schedule Trigger]  every hour
        ↓
[Postgres]  select id from documents
            where status = 'pending' and extraction_error is not null
              and created_at > now() - interval '24 hours'
            limit 20
        ↓
[Loop] → [HTTP Request] POST /functions/v1/parse-document { document_id }
              retry 2x, continue on fail
        ↓
[IF still failing after 24h] → [Slack #ops] "n documente necesită introducere manuală"
```

The document is already reviewable by a human — this only tries to save them
the typing.

---

## Run log table

Apply once:

```sql
create table if not exists public.n8n_run_log (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  workflow text not null,
  processed integer not null default 0,
  failed integer not null default 0,
  details jsonb
);
create index if not exists n8n_run_log_workflow_idx on public.n8n_run_log (workflow, ran_at desc);
alter table public.n8n_run_log enable row level security;

create policy "n8n_run_log_select_admin" on public.n8n_run_log
  for select to authenticated using (public.is_platform_admin());
create policy "n8n_run_log_insert_admin" on public.n8n_run_log
  for insert to authenticated with check (public.is_platform_admin());
create policy "n8n_run_log_update_admin" on public.n8n_run_log
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "n8n_run_log_delete_admin" on public.n8n_run_log
  for delete to authenticated using (public.is_platform_admin());
```

A workflow that stops running is invisible without this. Add one alert on top:
if `outbox-dispatcher` has not logged a run in 30 minutes, ping `#alerts`.

## Cost per month, rough

| Item | Unit | 100 companies |
|---|---|---|
| WhatsApp utility templates (Twilio) | ~0.03 RON | ~600 msg → 18 RON |
| SMS fallback + OTP | ~0.08 RON | ~300 msg → 24 RON |
| E-mail (Resend / SES) | ~0.001 RON | ~2000 → 2 RON |
| Claude document extraction | ~0.09 RON/doc | ~400 docs → 36 RON |

Under 100 RON/month at that scale. SMS OTP on the public individual form is
the one line that can run away — see the cost note in
`prompts/06-individual-quick-account.md`.
