// =====================================================================
// extract-vehicle-listing: the parts with no network in them
//
// Everything here is a pure function over strings, which is the only way
// the rules in it can be tested. The rules are not incidental: they are
// where this feature is allowed to exist at all.
//
//   - We read a listing page's public metadata. We do not scrape it.
//     Open Graph and JSON-LD are what a site publishes *for* other
//     programs to read; the body of the page is not.
//   - robots.txt decides, and a site that says no gets no request for
//     the page at all.
//   - Nothing that comes back is kept. The metadata goes to the model
//     and then out of memory; only the fields a person accepts survive,
//     in their own draft.
//
// See `index.ts` for the order these are applied in.
// =====================================================================

/** Every way this can refuse, by the name the log and the interface use. */
export type Failure =
  | "robots_disallow"
  | "fetch_failed"
  | "fetch_timeout"
  | "http_error"
  | "not_html"
  | "too_large"
  | "no_metadata"
  | "model_error"
  | "model_refused"
  | "bad_request"
  | "unknown";

// ---------------------------------------------------------------------
// The address
//
// A URL somebody types is an instruction to make a request from our
// server, so it is checked as one. The refusals here are not politeness:
// an unchecked fetch is how an edge function becomes a proxy into a
// private network.
// ---------------------------------------------------------------------

/** Names that resolve inside, or to somewhere that is not the internet. */
const PRIVATE_HOST = new RegExp(
  [
    "^localhost$",
    "\\.localhost$",
    "^127\\.",
    "^0\\.",
    "^10\\.",
    "^169\\.254\\.", // link-local, and the cloud metadata address
    "^192\\.168\\.",
    "^172\\.(1[6-9]|2[0-9]|3[01])\\.",
    "\\.local$",
    "\\.internal$",
    "^\\[", // any IPv6 literal
  ].join("|"),
);

export function normaliseListingUrl(
  raw: string,
): { ok: true; url: URL } | { ok: false; reason: Failure } {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "" || trimmed.length > 2048) return { ok: false, reason: "bad_request" };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "bad_request" };
  }

  // http would be a plaintext request made on somebody's behalf, and
  // every listing site worth reading has been https for years.
  if (url.protocol !== "https:") return { ok: false, reason: "bad_request" };

  // user:pass@host is a way of dressing one host up as another.
  if (url.username !== "" || url.password !== "") return { ok: false, reason: "bad_request" };

  if (url.port !== "" && url.port !== "443") return { ok: false, reason: "bad_request" };

  const host = url.hostname.toLowerCase();
  if (PRIVATE_HOST.test(host)) return { ok: false, reason: "bad_request" };

  // A bare IPv4 literal is never a listing site, and is how the metadata
  // service gets asked for credentials.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return { ok: false, reason: "bad_request" };

  if (!host.includes(".")) return { ok: false, reason: "bad_request" };

  // The fragment is the browser's business and never ours.
  url.hash = "";
  return { ok: true, url };
}

// ---------------------------------------------------------------------
// robots.txt
//
// The subset of the exclusion standard that a well-behaved reader needs:
// the group whose User-agent names us wins over the group that says `*`,
// and inside a group the longest matching rule wins, with Allow taking a
// tie. `*` and `$` are honoured because sites use them to say exactly
// what we are asking about.
//
// A file we could not read is not permission. `robotsAllows` is only
// called with a file we actually got; the caller decides what a missing
// one means, and it decides "allowed", because that is what the standard
// says and what every other reader does.
// ---------------------------------------------------------------------

interface RobotsGroup {
  agents: string[];
  rules: { allow: boolean; pattern: string }[];
}

export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  // Consecutive User-agent lines share one group of rules.
  let expectingAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (line === "") continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (!expectingAgents || current === null) {
        current = { agents: [], rules: [] };
        groups.push(current);
        expectingAgents = true;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (field === "allow" || field === "disallow") {
      if (current === null) continue; // a rule before any User-agent belongs to nobody
      expectingAgents = false;
      current.rules.push({ allow: field === "allow", pattern: value });
    }
  }

  return groups;
}

/** Does `pattern` match `path`, with `*` as any run and `$` as end-of-path. */
export function robotsPatternMatches(pattern: string, path: string): boolean {
  // An empty Disallow means "nothing is disallowed" and never matches.
  if (pattern === "") return false;

  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;

  const parts = body.split("*");
  let index = 0;

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i] ?? "";
    if (i === 0) {
      if (!path.startsWith(part)) return false;
      index = part.length;
      continue;
    }
    if (part === "") continue;
    const found = path.indexOf(part, index);
    if (found === -1) return false;
    index = found + part.length;
  }

  if (!anchored) return true;

  // With `$`, the last literal run has to land on the end. A trailing `*`
  // before it means anything may sit in between, so only the tail matters.
  const last = parts[parts.length - 1] ?? "";
  return last === "" ? true : path.endsWith(last);
}

export function robotsAllows(robotsTxt: string, userAgentToken: string, path: string): boolean {
  const groups = parseRobots(robotsTxt);
  if (groups.length === 0) return true;

  const token = userAgentToken.toLowerCase();

  // A group naming us beats the catch-all, however far down the file it
  // sits. Nothing else in the file applies once one names us.
  const named = groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  const applicable = named.length > 0 ? named : groups.filter((g) => g.agents.includes("*"));
  if (applicable.length === 0) return true;

  let best: { allow: boolean; length: number } | null = null;

  for (const group of applicable) {
    for (const rule of group.rules) {
      if (!robotsPatternMatches(rule.pattern, path)) continue;
      const length = rule.pattern.length;
      if (
        best === null ||
        length > best.length ||
        // Same length: Allow wins, which is what the standard says.
        (length === best.length && rule.allow && !best.allow)
      ) {
        best = { allow: rule.allow, length };
      }
    }
  }

  return best === null ? true : best.allow;
}

// ---------------------------------------------------------------------
// The metadata, and nothing else
//
// Deliberately not a parser. We want six named values that a site chose
// to publish for machines; walking the document would be the beginning of
// reading the page, which is the thing we are not doing.
// ---------------------------------------------------------------------

export interface ListingMetadata {
  title: string | null;
  description: string | null;
  image: string | null;
  price: string | null;
  currency: string | null;
  location: string | null;
  siteName: string | null;
}

export const EMPTY_METADATA: ListingMetadata = {
  title: null,
  description: null,
  image: null,
  price: null,
  currency: null,
  location: null,
  siteName: null,
};

function decodeEntities(value: string): string {
  return value
    .replace(/&(?:amp|#38);/g, "&")
    .replace(/&(?:lt|#60);/g, "<")
    .replace(/&(?:gt|#62);/g, ">")
    .replace(/&(?:quot|#34);/g, '"')
    .replace(/&(?:apos|#39);/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function clean(value: string | null | undefined, max = 500): string | null {
  if (value === null || value === undefined) return null;
  const text = decodeEntities(String(value)).replace(/\s+/g, " ").trim();
  if (text === "") return null;
  return text.length > max ? text.slice(0, max) : text;
}

/** `<meta property="og:title" content="...">`, in either attribute order. */
function metaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*?content\\s*=\\s*["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*?(?:property|name)\\s*=\\s*["']${escaped}["']`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1] !== undefined) return match[1];
  }
  return null;
}

/** Every `<script type="application/ld+json">` body, parsed and flattened. */
export function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(html)) !== null) {
    const body = match[1];
    if (body === undefined) continue;
    try {
      const parsed = JSON.parse(body.trim());
      // A @graph is the common wrapper; flatten one level so callers do
      // not each have to know about it.
      const graph = (parsed as { "@graph"?: unknown })?.["@graph"];
      if (Array.isArray(graph)) out.push(...graph);
      else if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      // A malformed block is a site's problem, not a reason to give up on
      // the rest of the page.
    }
  }
  return out;
}

const VEHICLE_TYPES = new Set([
  "vehicle",
  "car",
  "motorcycle",
  "product",
  "offer",
  "individualproduct",
]);

function typeOf(node: unknown): string[] {
  const raw = (node as { "@type"?: unknown })?.["@type"];
  if (typeof raw === "string") return [raw.toLowerCase()];
  if (Array.isArray(raw)) return raw.filter((t) => typeof t === "string").map((t) => t.toLowerCase());
  return [];
}

export function extractMetadata(html: string): ListingMetadata {
  const meta: ListingMetadata = { ...EMPTY_METADATA };

  meta.title = clean(metaContent(html, "og:title") ?? metaContent(html, "twitter:title"), 300);
  meta.description = clean(
    metaContent(html, "og:description") ?? metaContent(html, "description"),
    1500,
  );
  meta.image = clean(metaContent(html, "og:image") ?? metaContent(html, "twitter:image"), 2048);
  meta.siteName = clean(metaContent(html, "og:site_name"), 120);
  meta.price = clean(
    metaContent(html, "product:price:amount") ?? metaContent(html, "og:price:amount"),
    40,
  );
  meta.currency = clean(
    metaContent(html, "product:price:currency") ?? metaContent(html, "og:price:currency"),
    10,
  );
  meta.location = clean(
    metaContent(html, "og:locality") ?? metaContent(html, "business:contact_data:locality"),
    120,
  );

  if (meta.title === null) {
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
    meta.title = clean(title, 300);
  }

  // JSON-LD fills the gaps rather than overriding: Open Graph is what the
  // site chose to show, and the two disagree often enough to matter.
  for (const node of jsonLdBlocks(html)) {
    if (typeof node !== "object" || node === null) continue;
    const types = typeOf(node);
    if (types.length > 0 && !types.some((t) => VEHICLE_TYPES.has(t))) continue;

    const record = node as Record<string, unknown>;
    meta.title ??= clean(record.name as string, 300);
    meta.description ??= clean(record.description as string, 1500);

    if (meta.image === null) {
      const image = record.image;
      if (typeof image === "string") meta.image = clean(image, 2048);
      else if (Array.isArray(image) && typeof image[0] === "string") {
        meta.image = clean(image[0], 2048);
      } else if (typeof image === "object" && image !== null) {
        meta.image = clean((image as { url?: string }).url, 2048);
      }
    }

    const offers = Array.isArray(record.offers) ? record.offers[0] : record.offers;
    if (typeof offers === "object" && offers !== null) {
      const offer = offers as Record<string, unknown>;
      meta.price ??= clean(offer.price as string, 40);
      meta.currency ??= clean(offer.priceCurrency as string, 10);
      const area = offer.areaServed ?? offer.availableAtOrFrom;
      if (typeof area === "string") meta.location ??= clean(area, 120);
    }

    if (meta.location === null) {
      const address = record.address;
      if (typeof address === "string") meta.location = clean(address, 120);
      else if (typeof address === "object" && address !== null) {
        meta.location = clean((address as { addressLocality?: string }).addressLocality, 120);
      }
    }
  }

  return meta;
}

/** Nothing worth a model call. */
export function metadataIsEmpty(meta: ListingMetadata): boolean {
  return meta.title === null && meta.description === null;
}

// ---------------------------------------------------------------------
// What the model is allowed to have told us
// ---------------------------------------------------------------------

/** One extracted value, with how sure the model says it is. */
export interface Scored {
  value: string | null;
  confidence: number;
}

export interface ExtractedListing {
  make: Scored;
  model: Scored;
  year: Scored;
  category: Scored;
  from_city: Scored;
  from_country: Scored;
  weight_kg: Scored;
  is_running: Scored;
  is_damaged: Scored;
}

export const EXTRACTED_FIELDS: (keyof ExtractedListing)[] = [
  "make",
  "model",
  "year",
  "category",
  "from_city",
  "from_country",
  "weight_kg",
  "is_running",
  "is_damaged",
];

/**
 * Drops every field the model is not sure enough about.
 *
 * An empty box costs somebody ten seconds. A wrong year they did not
 * notice costs them a transport quoted for the wrong car, so the floor
 * errs towards the empty box.
 */
export function keepConfident(
  extracted: Partial<ExtractedListing>,
  floor: number,
): { fields: Record<string, string>; kept: number; dropped: string[] } {
  const fields: Record<string, string> = {};
  const dropped: string[] = [];

  for (const key of EXTRACTED_FIELDS) {
    const scored = extracted[key];
    if (scored === undefined || scored === null) continue;
    const value = scored.value;
    if (value === null || value === undefined || String(value).trim() === "") continue;

    const confidence = typeof scored.confidence === "number" ? scored.confidence : 0;
    if (confidence < floor) {
      dropped.push(key);
      continue;
    }
    fields[key] = String(value).trim();
  }

  return { fields, kept: Object.keys(fields).length, dropped };
}

// ---------------------------------------------------------------------
// The cost
//
// Recorded per attempt so the monthly budget is a real number rather than
// an estimate. List prices live here because the log is where somebody
// will look to work out why a month cost what it did.
// ---------------------------------------------------------------------

export interface ModelPrice {
  /** USD per million input tokens. */
  input: number;
  /** USD per million output tokens. */
  output: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

/** Opus rates when the model is one we have no price for: never under-report. */
export const FALLBACK_PRICE: ModelPrice = { input: 5, output: 25 };

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = MODEL_PRICES[model] ?? FALLBACK_PRICE;
  const usd = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  // Six decimals is what the column holds, and a cent is far too coarse
  // for something that costs fractions of one.
  return Math.round(usd * 1_000_000) / 1_000_000;
}

// ---------------------------------------------------------------------
// Reading a body without letting it be unbounded
// ---------------------------------------------------------------------

/**
 * Reads at most `limit` bytes and says whether the body was longer.
 *
 * Content-Length is a claim, not a fact: a body can arrive longer than it
 * said, and a page we cannot cap is a page that can exhaust the function.
 */
export async function readCapped(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<{ text: string; truncated: boolean }> {
  if (body === null) return { text: "", truncated: false };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > limit) {
        chunks.push(value.slice(0, value.byteLength - (total - limit)));
        truncated = true;
        break;
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const merged = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { text: new TextDecoder("utf-8", { fatal: false }).decode(merged), truncated };
}
