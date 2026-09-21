import { assert, assertEquals } from "jsr:@std/assert@^1";
import { MissingVariable, render, templateVariables } from "./render.ts";
import { renderValues, sendEmail, type SendResult } from "./send.ts";
import { TEMPLATES } from "./templates.ts";

/**
 * The chain, end to end, without a provider.
 *
 * `index.ts` calls `Deno.serve` at the top level, so importing it would
 * bind a port. What is reproduced here instead is the loop it runs —
 * claim a queued row, render it, send it, mark it sent — against an
 * in-memory queue and an injected fetch. That is enough to answer the
 * question this file exists for: **does a row actually make it from
 * `queued` to `sent`, for every template we have?**
 *
 * Nobody has seen a real e-mail from this platform, because no provider
 * is configured. Until one is, this is the strongest statement we can
 * make, and it is a much stronger one than „the code compiles": every
 * template is rendered with realistic values, and a template that gains
 * a variable nobody supplies fails here rather than in somebody's inbox.
 */

const SITE_URL = "https://coridor.ro";

/**
 * A value for every variable any template uses.
 *
 * Deliberately realistic rather than „x": a Romanian name with diacritics
 * in it, a date in the shape the queueing functions write, a plate in the
 * shape a Romanian one has. Anything shorter would pass the same
 * assertions while telling us less.
 */
const SAMPLE: Record<string, string> = {
  company_name: "Transport Ardeal SRL",
  document_label: "Asigurare RCA",
  days_left: "7",
  valid_until: "12 octombrie 2026",
  reason: "Documentul încărcat era ilizibil în zona datei de expirare.",
  plate_number: "CJ 12 ABC",
  invited_by: "Ionuț Rădulescu",
  role: "dispecer",
  from_city: "Cluj-Napoca",
  to_city: "Timișoara",
  from_country: "RO",
  to_country: "RO",
  request_id: "3f6c1b2a-0000-4000-8000-000000000001",
  departure_date: "24 septembrie 2026",
  plan: "Transportator",
  period_end: "24 octombrie 2026",
  what: "contul dumneavoastră",
  scheduled_for: "4 octombrie 2026",
  cancel_token: "9a1c0e77-0000-4000-8000-000000000002",
  listing_title: "Volkswagen Golf 2015, Cluj-Napoca — Arad",
  title: "Volkswagen Golf 2015, München — Cluj-Napoca",
  search_name: "Germania → România, autoturisme",
  reasons: "Ruta: München (DE) — Cluj-Napoca (RO)\n· Tip vehicul: Autoturism",
  count: "3",
  listings: "· Volkswagen Golf 2015 (München — Cluj-Napoca)",
  outcome: "rezolvată",
  resolution: "Am sunat firma, au confirmat, iar anunțul a fost corectat.",
  listing_id: "5d2e9f31-0000-4000-8000-000000000003",
  carrier_name: "Transport Ardeal SRL",
  offer_id: "7b4a2c88-0000-4000-8000-000000000004",
};

interface QueueRow {
  id: string;
  template: string;
  to_email: string;
  status: "queued" | "sending" | "sent" | "failed";
  attempts: number;
  provider_message_id: string | null;
  last_error: string | null;
}

/** The two RPCs the dispatcher uses, as the database implements them. */
function makeQueue(rows: QueueRow[]) {
  return {
    claim(): QueueRow[] {
      const claimed = rows.filter((r) => r.status === "queued");
      for (const row of claimed) {
        row.status = "sending";
        row.attempts += 1;
      }
      return claimed;
    },
    finish(id: string, result: SendResult) {
      const row = rows.find((r) => r.id === id)!;
      if (result.providerId !== undefined) row.provider_message_id = result.providerId;
      if (result.ok) {
        row.status = "sent";
        row.last_error = null;
        return;
      }
      row.last_error = result.error ?? "necunoscut";
      row.status = row.attempts >= 5 || result.permanent === true ? "failed" : "queued";
    },
  };
}

/** A provider that accepts everything and hands back an id, like Resend. */
function acceptingProvider(seen: { subject: string; text: string; html: string }[]): typeof fetch {
  return (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, string>;
    seen.push({ subject: body.subject!, text: body.text!, html: body.html! });
    return Promise.resolve(
      new Response(JSON.stringify({ id: `re_${seen.length}` }), { status: 200 }),
    );
  };
}

/** One pass of the dispatcher's loop, over whatever is queued. */
async function drain(rows: QueueRow[], fetchImpl: typeof fetch): Promise<void> {
  const queue = makeQueue(rows);
  for (const row of queue.claim()) {
    const template = TEMPLATES[row.template];
    let result: SendResult;
    try {
      const mail = render(row.template, template!, renderValues(SAMPLE, SITE_URL), {
        unsubscribeUrl: template!.unsubscribable
          ? `${SITE_URL}/cont/setari/notificari`
          : undefined,
      });
      result = await sendEmail(
        { apiKey: "k", from: "nu-raspunde@coridor.ro", senderName: "Coridor", fetchImpl },
        row.to_email,
        mail.subject,
        mail.html,
        mail.text,
      );
    } catch (error) {
      result = error instanceof MissingVariable
        ? { ok: false, error: error.message, permanent: true }
        : { ok: false, error: String(error), permanent: true };
    }
    queue.finish(row.id, result);
  }
}

const ALL_TEMPLATES = Object.keys(TEMPLATES);

Deno.test("every template goes from queued to sent", async () => {
  const rows: QueueRow[] = ALL_TEMPLATES.map((template, i) => ({
    id: `row-${i}`,
    template,
    to_email: "client@example.ro",
    status: "queued",
    attempts: 0,
    provider_message_id: null,
    last_error: null,
  }));

  const seen: { subject: string; text: string; html: string }[] = [];
  await drain(rows, acceptingProvider(seen));

  const stuck = rows.filter((r) => r.status !== "sent");
  assertEquals(
    stuck.map((r) => `${r.template}: ${r.last_error}`),
    [],
    "every template must render and send with the sample values",
  );
  assertEquals(seen.length, ALL_TEMPLATES.length);
  // The provider's id is what makes a later bounce traceable to a row.
  assert(rows.every((r) => r.provider_message_id !== null));
});

Deno.test("no rendered e-mail carries an unfilled variable", () => {
  for (const [name, template] of Object.entries(TEMPLATES)) {
    const mail = render(name, template, renderValues(SAMPLE, SITE_URL), {
      unsubscribeUrl: `${SITE_URL}/cont/setari/notificari`,
    });
    for (const part of [mail.subject, mail.text, mail.html]) {
      assert(!part.includes("{{"), `${name} left a placeholder in: ${part.slice(0, 80)}`);
    }
  }
});

Deno.test("every template has a subject and a plain-text part", () => {
  for (const [name, template] of Object.entries(TEMPLATES)) {
    const mail = render(name, template, renderValues(SAMPLE, SITE_URL), {});
    assert(mail.subject.trim().length > 0, `${name} has no subject`);
    assert(mail.text.trim().length > 0, `${name} has no text part`);
    // The text part is what a client with images off, or a screen reader,
    // actually reads. It must not be the HTML with the tags left in.
    assert(!mail.text.includes("<p"), `${name} put HTML in the text part`);
  }
});

Deno.test("the Romanian is written with its diacritics", () => {
  // Every template together, so a new one written without them fails
  // here rather than going out looking like a scam.
  const all = ALL_TEMPLATES
    .map((name) => {
      const mail = render(name, TEMPLATES[name]!, renderValues(SAMPLE, SITE_URL), {});
      return `${mail.subject}\n${mail.text}`;
    })
    .join("\n");
  assert(/[ăâîșț]/.test(all), "no Romanian diacritics anywhere in the templates");

  // The two mistakes that actually happen: the Turkish cedilla instead of
  // the Romanian comma-below, and „sunteti" for „sunteți".
  assert(!/[şţ]/.test(all), "cedilla ş/ţ instead of comma-below ș/ț");
  for (const bad of ["sunteti", "puteti", "Buna ziua", "expira ", "numarul"]) {
    assert(!all.includes(bad), `„${bad}" is missing its diacritics`);
  }
});

Deno.test("every action link points somewhere real", () => {
  for (const [name, template] of Object.entries(TEMPLATES)) {
    if (template.action === undefined) continue;
    const mail = render(name, template, renderValues(SAMPLE, SITE_URL), {});
    const match = mail.text.match(/https:\/\/\S+/);
    assert(match !== null, `${name} has an action but no link in the text part`);
    const url = new URL(match![0]);
    assertEquals(url.origin, SITE_URL, `${name} links outside the site`);
    assert(!url.pathname.includes("{{"), `${name} has an unfilled link`);
    assert(!url.pathname.includes("undefined"), `${name} links to undefined`);
  }
});

Deno.test("a template whose variables are missing fails the row, and says which", async () => {
  const rows: QueueRow[] = [{
    id: "row-0",
    template: "document_expiry_reminder",
    to_email: "client@example.ro",
    status: "queued",
    attempts: 0,
    provider_message_id: null,
    last_error: null,
  }];

  // Rendering with nothing but the site URL: every other variable is a hole.
  const queue = makeQueue(rows);
  for (const row of queue.claim()) {
    let result: SendResult;
    try {
      render(row.template, TEMPLATES[row.template]!, renderValues({}, SITE_URL), {});
      result = { ok: true };
    } catch (error) {
      result = error instanceof MissingVariable
        ? { ok: false, error: error.message, permanent: true }
        : { ok: false, error: String(error), permanent: true };
    }
    queue.finish(row.id, result);
  }

  assertEquals(rows[0]!.status, "failed");
  assert(rows[0]!.last_error?.includes("document_label"), rows[0]!.last_error ?? "");
});

Deno.test("a provider outage leaves the row queued for another try", async () => {
  const rows: QueueRow[] = [{
    id: "row-0",
    template: "company_verified",
    to_email: "client@example.ro",
    status: "queued",
    attempts: 0,
    provider_message_id: null,
    last_error: null,
  }];

  await drain(rows, () => Promise.resolve(new Response("", { status: 503 })));

  assertEquals(rows[0]!.status, "queued");
  assertEquals(rows[0]!.attempts, 1);
});

Deno.test("a hard bounce fails the row rather than spending five attempts", async () => {
  const rows: QueueRow[] = [{
    id: "row-0",
    template: "company_verified",
    to_email: "nu-exista@example.ro",
    status: "queued",
    attempts: 0,
    provider_message_id: null,
    last_error: null,
  }];

  await drain(
    rows,
    () =>
      Promise.resolve(
        new Response('{"message":"Invalid `to` field: does not exist"}', { status: 422 }),
      ),
  );

  assertEquals(rows[0]!.status, "failed");
  assertEquals(rows[0]!.attempts, 1);
});

Deno.test("every template a queueing function names exists", () => {
  // The names the database writes into notification_outbox. A template
  // renamed on one side and not the other is an e-mail that fails for
  // every recipient, and this is the cheapest place to catch it.
  const queuedByTheDatabase = [
    "document_expiry_reminder",
    "vehicle_suspended",
    "account_suspended",
    "account_reactivated",
    "company_verified",
    "company_rejected",
    "company_invitation",
    "request_match_alert",
    "reservation_created",
    "reservation_confirmed",
    "reservation_rejected",
    "reservation_expired",
    "subscription_request_received",
    "subscription_activated",
    "account_deletion_scheduled",
    "account_deletion_blocked",
    "account_deletion_cancelled",
    "account_deletion_completed",
    "listing_expiring_soon",
    "saved_search_alert",
    "saved_search_digest",
    "report_closed",
    "offer_received",
    "offer_withdrawn",
    "offer_accepted",
    "offer_rejected",
    "offer_expired",
    "offer_question",
  ];
  for (const name of queuedByTheDatabase) {
    assert(TEMPLATES[name] !== undefined, `no template for ${name}`);
  }
});
