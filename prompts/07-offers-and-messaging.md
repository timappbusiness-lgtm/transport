# Prompt 07 — Offers and in-platform messaging

**Prerequisites:** prompts 01–06; migration `..._deals.sql` applied.

Phase 2 territory. Ship the MVP first and see whether people actually want to
negotiate in the platform rather than on the phone — in Romanian road freight
that is not a given.

---

## Lovable prompt

```
Add price offers and in-platform messaging. Create only the files listed.
Do NOT change the boards, the listing cards' layout, or any existing hook
beyond adding the two buttons noted at the end.

CREATE

1. src/hooks/useOffers.ts
   - offersForListing(listingType, listingId) - what the listing owner sees
   - myOffers() - offers sent by the current user or company
   Mutations: sendOffer, withdrawOffer, acceptOffer, rejectOffer.
   acceptOffer must, in one flow: set the offer to accepted, set every other
   pending offer on that listing to rejected, set the listing status to
   assigned, and insert a transports row. Do this in a single Postgres function
   called accept_offer(offer_id uuid) rather than four client round-trips -
   a half-applied accept leaves two carriers thinking they won the load.
   Write the SQL for that function and include it in the response so I can
   apply it in the Supabase SQL editor.

2. src/components/offers/OfferForm.tsx
   Dialog: price_amount, currency, payment_term_days, message, valid_until
   (default 48 hours). Shows the listing's asking price above the input for
   reference. Romanian validation messages.
   On a 42501 error, show the database message directly - it explains that the
   account is suspended or unverified.

3. src/components/offers/OfferList.tsx
   For the listing owner: every offer sorted by price ascending, each showing
   the bidding company's name, rating, verification badge, price, payment term,
   message, and Accept / Reject buttons.
   Accepting asks for confirmation: "Accepți oferta de {price} de la {company}?
   Celelalte oferte vor fi respinse automat."

4. src/hooks/useConversations.ts
   Conversation list and message thread, with a Supabase Realtime subscription
   on the messages table filtered by conversation_id. Unsubscribe on unmount -
   a leaked channel per page visit will exhaust the connection limit.
   Mutations: startConversation(listing), sendMessage(conversationId, body).

5. src/components/messaging/ConversationList.tsx
   Left panel: counterparty name, listing route, last message preview,
   unread indicator, sorted by last_message_at.

6. src/components/messaging/MessageThread.tsx
   Right panel: bubbles, day separators ("Azi", "Ieri", "14.09.2026"),
   text input with Enter to send and Shift+Enter for a newline.
   Marks messages read on view.

7. src/pages/Messages.tsx at route /mesaje
   ConversationList + MessageThread side by side. On mobile, the list is the
   page and tapping a conversation navigates to the thread.

8. src/pages/Offers.tsx at route /oferte
   Tabs: "Primite" and "Trimise".

MODIFY

9. src/components/listings/CargoListingCard.tsx and TruckListingCard.tsx
   Wire the existing "Trimite ofertă" button to open OfferForm, and add a
   "Mesaj" button that calls startConversation and navigates to /mesaje.
   Do NOT change the card layout or any other prop.

10. src/components/layout/AppShell.tsx
    Add "Oferte" -> /oferte and "Mesaje" -> /mesaje, each with an unread badge.
    Do NOT change anything else.
```

---

## Verification checklist

- [ ] A suspended company cannot send an offer (trigger `offers_guard_insert`)
- [ ] An individual can offer on a truck listing but not on a load
- [ ] Accepting one offer rejects the rest **and** creates the `transports` row
- [ ] Two simultaneous accepts on the same listing: only one wins (this is why
      it is one SQL function)
- [ ] `offers_count` on the listing stays in sync
- [ ] Realtime delivers a message to the other party without a refresh
- [ ] Leaving `/mesaje` unsubscribes the channel — check the network panel
- [ ] A third company cannot read the conversation
- [ ] Accepting an offer moves the listing to `assigned` and off the board
