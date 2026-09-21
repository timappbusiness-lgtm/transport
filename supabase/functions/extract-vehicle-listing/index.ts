// =====================================================================
// extract-vehicle-listing
//
// Reads what a car listing publishes about itself and turns it into
// fields a transport request form can offer. It never publishes anything
// and never writes a request: what it returns lands in a form somebody
// reads, corrects and submits, and `create_cargo_request` applies exactly
// the rules it always did.
//
// POST { "source": "link",  "url": "https://..." }
// POST { "source": "photo", "image_base64": "...", "mime": "image/jpeg" }
//
// The order below is the whole design, and it is deliberate:
//
//   1. Work out who is asking — an account, or an address we only ever
//      hold as a salted hash.
//   2. Claim a slot. Nothing costs money before this line.
//   3. For a link: check robots.txt, then fetch, then read the metadata
//      the site publishes for machines. Never the page body.
//   4. Ask the model, with a schema whose every field is nullable, so it
//      has a way to say "not there" instead of inventing something.
//   5. Drop every field it is not sure enough about.
//   6. Close the slot with what it cost.
//
// The page, its HTML and its text are never written anywhere. The only
// thing about a source that survives step 6 is its hostname.
// =====================================================================

import { corsFor } from "../_shared/security.ts";
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  estimateCostUsd,
  extractMetadata,
  type ExtractedListing,
  type Failure,
  keepConfident,
  type ListingMetadata,
  metadataIsEmpty,
  normaliseListingUrl,
  readCapped,
  robotsAllows,
} from "./listing.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

// Sonnet rather than Opus: this reads six short strings a site wrote on
// purpose, which is a much easier job than the blurry document photos
// parse-document deals with. Override per environment if accuracy on real
// listings turns out to need it.
const MODEL = Deno.env.get("ANTHROPIC_EXTRACT_MODEL") ?? "claude-sonnet-5";

// Who we say we are. A site that wants to refuse us has to be able to
// name us, and a person reading their own logs has to be able to find us.
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://coridor.ro";
const USER_AGENT = Deno.env.get("LISTING_BOT_USER_AGENT") ??
  `CoridorBot/1.0 (+${SITE_URL})`;
/** The token a robots.txt group would name, lowercase. */
const UA_TOKEN = "coridorbot";

// Without this, anonymous extraction is off rather than hashed with a
// constant: a hash everybody can reproduce is not a hash, it is the
// address with extra steps.
const IP_SALT = Deno.env.get("IMPORT_IP_SALT") ?? null;

const ROBOTS_TIMEOUT_MS = 3_000;
const PAGE_TIMEOUT_MS = 6_000;
const MAX_PAGE_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;


// ---------------------------------------------------------------------
// The schema
//
// Every field is a value and a confidence, and every value is nullable.
// A model with no way to say "not visible" says something else instead,
// and something else is a wrong year on somebody's transport request.
// ---------------------------------------------------------------------
const scored = (description: string, extra: Record<string, unknown> = {}) => ({
  type: "object",
  additionalProperties: false,
  properties: {
    value: { type: ["string", "null"], description, ...extra },
    confidence: {
      type: "number",
      description: "0.0-1.0. Cât de clar apare valoarea în textul primit.",
    },
  },
  required: ["value", "confidence"],
});

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    make: scored("Marca vehiculului, ex. Volkswagen, Dacia, BMW."),
    model: scored("Modelul, ex. Golf, Logan, Seria 3."),
    year: scored("Anul fabricației, patru cifre."),
    category: scored("Categoria.", {
      enum: [
        "autoturism",
        "autoutilitara",
        "motocicleta",
        "microbuz",
        "rulota",
        "utilaj_agricol",
        null,
      ],
    }),
    from_city: scored("Orașul în care se află vehiculul acum."),
    from_country: scored("Țara, cod ISO din două litere, ex. RO, DE, IT.", {
      pattern: "^[A-Z]{2}$",
    }),
    weight_kg: scored("Masa în kilograme, doar dacă apare explicit."),
    is_running: scored("'true' dacă scrie explicit că pornește și merge, 'false' dacă scrie explicit că nu."),
    is_damaged: scored("'true' dacă scrie explicit că e avariat, lovit sau pentru piese."),
  },
  required: [
    "make",
    "model",
    "year",
    "category",
    "from_city",
    "from_country",
    "weight_kg",
    "is_running",
    "is_damaged",
  ],
} as const;

const SYSTEM_PROMPT =
  `Extragi date despre un vehicul dintr-un anunț auto, ca să completezi o cerere de transport.

Reguli stricte, în ordinea importanței:
- Extrage DOAR ce este scris efectiv în textul primit. Dacă ceva nu apare, pune value: null.
- Nu deduce nimic. Dacă scrie "Golf", nu presupune "Volkswagen" decât dacă marca apare undeva.
- Nu completa din cunoștințe generale: masa unui model, anul unei generații, țara unui oraș.
- confidence spune cât de clar apare valoarea în text, nu cât de plauzibilă ți se pare.
- Dacă textul e ambiguu (două mașini, un titlu de listă, o pagină de categorie), pune null peste tot.
- is_running și is_damaged: null dacă anunțul nu spune. Un anunț care nu menționează avarii
  NU înseamnă că mașina e intactă.
- from_city este locul unde se află vehiculul, nu adresa dealerului dacă sunt diferite și se vede asta.
- Prețul, telefonul și numele vânzătorului NU te interesează. Nu le returna nicăieri.`;

/**
 * Antetele CORS depind acum de cererea care le-a cerut: originea se
 * întoarce numai dacă este pe lista din `ALLOWED_ORIGIN`. Deci și
 * răspunsul de eroare are nevoie de cerere.
 */
function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

/** A salted hash, so a row in the log cannot be walked back to an address. */
async function hashIp(ip: string): Promise<string | null> {
  if (IP_SALT === null || ip === "") return null;
  const bytes = new TextEncoder().encode(`${IP_SALT}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The first address in the chain is the client; the rest are proxies. */
function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim() ?? "";
  return first !== "" ? first : (req.headers.get("x-real-ip") ?? "").trim();
}

class Refusal extends Error {
  constructor(public reason: Failure, public detail?: string) {
    super(reason);
  }
}

async function fetchWithTimeout(url: URL, ms: number, accept: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, "Accept": accept },
    });
  } catch (error) {
    throw new Refusal(
      error instanceof DOMException && error.name === "AbortError" ? "fetch_timeout" : "fetch_failed",
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * robots.txt, and what a missing one means.
 *
 * A file we could not read is not a refusal — that is what the standard
 * says and what every other reader does. A file that says no is final:
 * we do not then ask for the page "just to see".
 */
async function robotsAllowsPage(url: URL): Promise<boolean> {
  const robotsUrl = new URL("/robots.txt", url.origin);
  let response: Response;
  try {
    response = await fetchWithTimeout(robotsUrl, ROBOTS_TIMEOUT_MS, "text/plain");
  } catch {
    return true;
  }

  if (response.status >= 400) {
    await response.body?.cancel().catch(() => {});
    // 404 is "no rules". A 401 or 403 on robots.txt is a site that does
    // not want to be read by programs at all, so we treat it as no.
    return response.status === 404 || response.status === 410;
  }

  if (response.status >= 300) {
    await response.body?.cancel().catch(() => {});
    return true;
  }

  const { text } = await readCapped(response.body, 256 * 1024);
  return robotsAllows(text, UA_TOKEN, url.pathname + url.search);
}

/**
 * Fetches the page, following redirects by hand.
 *
 * By hand because every hop has to pass the same address check as the
 * first one. A site that redirects to 169.254.169.254 is the oldest way
 * of turning a fetch on somebody's behalf into a credential leak, and
 * `redirect: "follow"` would take it.
 */
async function fetchListingPage(start: URL): Promise<{ html: string; finalUrl: URL }> {
  let url = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetchWithTimeout(url, PAGE_TIMEOUT_MS, "text/html,application/xhtml+xml");

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => {});
      const location = response.headers.get("location");
      if (location === null) throw new Refusal("http_error");
      const next = normaliseListingUrl(new URL(location, url).toString());
      if (!next.ok) throw new Refusal("bad_request");
      url = next.url;
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      // 403 and 429 here are a site refusing us. We do not retry, we do
      // not change the user agent, and we do not come back.
      throw new Refusal("http_error");
    }

    const type = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!type.includes("text/html") && !type.includes("application/xhtml")) {
      await response.body?.cancel().catch(() => {});
      throw new Refusal("not_html");
    }

    const { text, truncated } = await readCapped(response.body, MAX_PAGE_BYTES);
    // The head is where the metadata lives, so a truncated body is only
    // a problem if we found nothing in what we did read.
    if (truncated && text.length === 0) throw new Refusal("too_large");
    return { html: text, finalUrl: url };
  }

  throw new Refusal("http_error");
}

/** Only the named values go to the model. Never the page. */
function metadataAsText(meta: ListingMetadata): string {
  const lines: string[] = [];
  if (meta.title !== null) lines.push(`Titlu: ${meta.title}`);
  if (meta.description !== null) lines.push(`Descriere: ${meta.description}`);
  if (meta.location !== null) lines.push(`Localitate: ${meta.location}`);
  if (meta.siteName !== null) lines.push(`Sursă: ${meta.siteName}`);
  return lines.join("\n");
}

interface ModelResult {
  extracted: Partial<ExtractedListing>;
  inputTokens: number;
  outputTokens: number;
}

async function askModel(
  content: Anthropic.MessageParam["content"],
): Promise<ModelResult> {
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: EXTRACTION_SCHEMA },
      },
      messages: [{ role: "user", content }],
    });
  } catch {
    throw new Refusal("model_error");
  }

  if (response.stop_reason === "refusal") throw new Refusal("model_refused");

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Refusal("model_error");

  let extracted: Partial<ExtractedListing>;
  try {
    extracted = JSON.parse(textBlock.text) as Partial<ExtractedListing>;
  } catch {
    throw new Refusal("model_error");
  }

  return {
    extracted,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const started = Date.now();
  let extractionId: string | null = null;
  let sourceHost: string | null = null;

  try {
    const body = await req.json().catch(() => ({})) as {
      source?: string;
      url?: string;
      image_base64?: string;
      mime?: string;
    };

    const source = body.source === "photo" ? "photo" : body.source === "link" ? "link" : null;
    if (source === null) return jsonResponse(req, { ok: false, reason: "bad_request" }, 400);

    // --- Who is asking ------------------------------------------------
    // The JWT is read rather than trusted from the body: an account id a
    // caller can choose is an account id a caller can spend.
    const authHeader = req.headers.get("Authorization") ?? "";
    let userId: string | null = null;
    if (authHeader !== "") {
      const caller = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data } = await caller.auth.getUser();
      userId = data.user?.id ?? null;
    }

    let ipHash: string | null = null;
    if (userId === null) {
      ipHash = await hashIp(clientIp(req));
      if (ipHash === null) {
        // Either no salt is configured or we cannot see an address.
        // Counting is not optional, so the answer is no.
        return jsonResponse(req, { ok: false, reason: "anonymous_unavailable" }, 503);
      }
    }

    // --- The slot, before anything costs anything ---------------------
    const { data: claim, error: claimError } = await admin
      .rpc("claim_import_slot", {
        p_user_id: userId,
        p_ip_hash: ipHash,
        p_source_type: source,
      })
      .single<{ extraction_id: string | null; allowed: boolean; reason: string | null; remaining: number }>();

    if (claimError) {
      console.error("claim_import_slot failed", { message: claimError.message });
      return jsonResponse(req, { ok: false, reason: "unknown" }, 500);
    }
    if (!claim?.allowed) {
      return jsonResponse(req, { ok: false, reason: claim?.reason ?? "unknown" }, 429);
    }
    extractionId = claim.extraction_id;

    // --- The work -----------------------------------------------------
    let result: ModelResult;
    let imageUrl: string | null = null;

    if (source === "link") {
      const normalised = normaliseListingUrl(body.url ?? "");
      if (!normalised.ok) throw new Refusal(normalised.reason);
      sourceHost = normalised.url.hostname;

      if (!(await robotsAllowsPage(normalised.url))) throw new Refusal("robots_disallow");

      const { html } = await fetchListingPage(normalised.url);
      const meta = extractMetadata(html);
      if (metadataIsEmpty(meta)) throw new Refusal("no_metadata");

      // The candidate photo is a URL we hand back, not bytes we keep.
      // Nothing is downloaded unless somebody ticks the box.
      const candidate = meta.image === null
        ? null
        : normaliseListingUrl(new URL(meta.image, normalised.url).toString());
      imageUrl = candidate !== null && candidate.ok ? candidate.url.toString() : null;

      result = await askModel([{ type: "text", text: metadataAsText(meta) }]);
    } else {
      const base64 = body.image_base64 ?? "";
      const mime = body.mime ?? "";
      if (base64 === "" || !["image/jpeg", "image/png", "image/webp"].includes(mime)) {
        throw new Refusal("bad_request");
      }
      // base64 is 4 characters per 3 bytes.
      if ((base64.length * 3) / 4 > MAX_IMAGE_BYTES) throw new Refusal("too_large");

      result = await askModel([
        {
          type: "image",
          source: { type: "base64", media_type: mime as "image/jpeg", data: base64 },
        },
        {
          type: "text",
          text: "Aceasta este poza unui anunț auto sau a unei mașini. Extrage ce se vede.",
        },
      ]);
    }

    // --- What we are allowed to believe -------------------------------
    const { data: settings } = await admin
      .from("import_settings")
      .select("min_field_confidence")
      .single<{ min_field_confidence: number }>();

    const floor = settings?.min_field_confidence ?? 0.7;
    const { fields, kept, dropped } = keepConfident(result.extracted, floor);
    const cost = estimateCostUsd(MODEL, result.inputTokens, result.outputTokens);

    await admin.rpc("finish_import", {
      p_extraction_id: extractionId,
      p_status: "ok",
      p_duration_ms: Date.now() - started,
      p_input_tokens: result.inputTokens,
      p_output_tokens: result.outputTokens,
      p_cost_usd: cost,
      p_failure_reason: null,
      p_source_host: sourceHost,
      p_fields_kept: kept,
    });

    return jsonResponse(req, {
      ok: true,
      fields,
      dropped,
      image_url: imageUrl,
      remaining: claim.remaining,
    });
  } catch (error) {
    const reason: Failure = error instanceof Refusal ? error.reason : "unknown";

    // The log line carries the reason and the host, never the address, the
    // page or the model's answer.
    console.error("extract-vehicle-listing refused", { reason, host: sourceHost });

    if (extractionId !== null) {
      await admin.rpc("finish_import", {
        p_extraction_id: extractionId,
        p_status: "failed",
        p_duration_ms: Date.now() - started,
        p_input_tokens: null,
        p_output_tokens: null,
        p_cost_usd: 0,
        p_failure_reason: reason,
        p_source_host: sourceHost,
        p_fields_kept: null,
      }).then(() => {}, () => {});
    }

    return jsonResponse(req, { ok: false, reason }, reason === "bad_request" ? 400 : 502);
  }
});

// ---------------------------------------------------------------------
// Cost note (list prices at the time of writing, Claude Sonnet 5:
// $3 / MTok input, $15 / MTok output).
//
// A link extraction sends the title, the description and the locality —
// rarely more than 400 input tokens — and gets back about 250 output
// tokens of JSON. That is roughly $0.005, about 2 bani.
//
// A photo is the expensive one: a phone picture is 1.5k-2.5k input
// tokens, so about $0.011, around 5 bani. The default budget of $50 a
// month is therefore some four thousand photo extractions, and the
// per-person daily limit of ten is what stops one afternoon from being a
// meaningful share of that.
//
// The real number is in `listing_extractions.cost_usd`, computed from the
// tokens the API actually reported. These are the figures to sanity-check
// it against, not a substitute for it.
// ---------------------------------------------------------------------
