# Prompt 10 — Notifications: the in-app side

**Prerequisites:** prompts 01–09; migration
`..._storage_notifications_cron.sql` applied.

The sending itself is n8n's job (`n8n/README.md`). This prompt covers what the
user sees inside the app and how they control what reaches them.

---

## Lovable prompt

```
Add in-app notifications and notification preferences. Create only the files
listed. Do NOT change the boards, the document pages or the admin panel.

CREATE

1. src/hooks/useNotifications.ts
   Query notification_outbox rows for the current user or company where
   channel = "inapp", newest first, limit 50. Realtime subscription on inserts.
   Mutations: markAsRead(id), markAllAsRead().
   Unsubscribe on unmount.

2. src/components/notifications/NotificationBell.tsx
   Top-bar bell with an unread count badge. Popover lists notifications with
   an icon per template:
   - document_expiry_reminder -> amber clock
   - account_suspended        -> red alert
   - account_reactivated      -> green check
   - new_offer                -> blue tag
   - new_message              -> blue message
   - listing_match            -> accent truck
   Each row renders a Romanian sentence built from the payload, for example:
   "ITP-ul pentru B-123-ABC expiră în 7 zile (14.09.2026)"
   "Cont suspendat: RCA expirat pentru CJ-45-XYZ"
   "Ofertă nouă de 2.400 RON pentru cursa Cluj → Timișoara"
   Clicking navigates to the relevant page.

3. src/components/notifications/NotificationPreferences.tsx
   Per-channel switches, grouped by what they actually are:
   - "Documente și cont" (e-mail, WhatsApp): expiry reminders, suspension.
     E-mail here is NOT switchable off - these are contractual messages, not
     marketing. Render it as a fixed line: "Prin e-mail - obligatoriu".
   - "Activitate" (e-mail, WhatsApp, push): new offers, new messages
   - "Alerte pentru anunțuri noi" (e-mail, WhatsApp, push): saved-search matches.
     This one is marketing and requires an explicit opt-in, unticked by default.
   Store the flags in profiles (add a jsonb column notification_prefs, default
   '{}') and in saved_searches for the per-search channels.

4. src/components/listings/SaveSearchButton.tsx
   On both board pages: saves the current filter state from the URL into
   saved_searches with a name the user types, plus the notification channels.
   Respects the plan's max_saved_searches - when the limit is reached, show
   "Planul {name} permite {n} căutări salvate" with a link to /abonament.

5. src/pages/SavedSearches.tsx at route /cautari-salvate
   List of saved searches: name, a human-readable summary of the filters
   ("Cluj → oriunde, peste 5 t, frigorific"), channel toggles, "Rulează"
   which applies the filters to the board, and delete.

6. src/components/documents/ExpiryWarningBanner.tsx
   On /documente and /flota: when anything expires within 30 days, a prominent
   amber banner listing each item as "{document} pentru {plate} - expiră în
   {n} zile" with an upload button per row. Red for anything already expired.

MODIFY

7. src/components/layout/AppShell.tsx
   Add NotificationBell to the top bar and "Căutări salvate" -> /cautari-salvate
   to the sidebar. Do NOT change anything else.

8. src/pages/Account.tsx
   Add a "Notificări" tab rendering NotificationPreferences.
   Do NOT change the existing tabs.

SQL to apply first (include it in your response so I can run it):
  alter table public.profiles
    add column if not exists notification_prefs jsonb not null default '{}'::jsonb;
```

---

## Verification checklist

- [ ] The bell shows unread count and clears on read
- [ ] A new `inapp` row arrives without a refresh
- [ ] Contractual e-mail (expiry, suspension) cannot be switched off
- [ ] Marketing alerts are unticked by default — verify on a fresh account
- [ ] Saved searches respect the plan limit
- [ ] The expiry banner appears at 30 days and turns red after expiry
- [ ] The Romanian sentences read naturally with real payload data, diacritics
      included
- [ ] Leaving a page with a realtime subscription closes the channel

**GDPR:** the marketing/contractual split is not cosmetic. Sending
"cursă nouă pe traseul tău" to someone who did not opt in is a marketing
message without consent. Keep them on separate templates so one opt-out does
not silence a suspension warning.
