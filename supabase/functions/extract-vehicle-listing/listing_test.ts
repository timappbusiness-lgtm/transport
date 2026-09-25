// =====================================================================
// The rules that decide whether we may read a page at all, and what we
// are allowed to believe once we have.
//
// No test here touches the network. The fixtures are strings, on purpose:
// a test that fetched a real listing site would be both a request we did
// not ask permission for and a test that fails when somebody redesigns
// their page.
// =====================================================================

import { assert, assertEquals, assertFalse } from "jsr:@std/assert@^1";
import {
  estimateCostUsd,
  extractMetadata,
  jsonLdBlocks,
  keepConfident,
  metadataIsEmpty,
  normaliseListingUrl,
  parseRobots,
  readCapped,
  robotsAllows,
  robotsPatternMatches,
} from "./listing.ts";

const UA = "exemplubot";

// ---------------------------------------------------------------------
// The address
// ---------------------------------------------------------------------

Deno.test("a plain listing address is accepted", () => {
  const result = normaliseListingUrl("https://anunturi.example.ro/auto/vw-golf-2018-12345");
  assert(result.ok);
  assertEquals(result.url.hostname, "anunturi.example.ro");
});

Deno.test("the fragment is dropped: it never reached the server anyway", () => {
  const result = normaliseListingUrl("https://example.ro/a/b#galerie");
  assert(result.ok);
  assertEquals(result.url.hash, "");
});

Deno.test("http is refused rather than upgraded", () => {
  const result = normaliseListingUrl("http://example.ro/anunt");
  assertFalse(result.ok);
});

Deno.test("an address inside our own network is refused", () => {
  for (
    const raw of [
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://10.1.2.3/x",
      "https://192.168.0.1/x",
      "https://172.20.0.5/x",
      // The one that matters most: the cloud metadata service.
      "https://169.254.169.254/latest/meta-data/",
      "https://db.internal/x",
      "https://printer.local/x",
      "https://[::1]/x",
    ]
  ) {
    assertFalse(normaliseListingUrl(raw).ok, raw);
  }
});

Deno.test("a host dressed up with credentials is refused", () => {
  assertFalse(normaliseListingUrl("https://example.ro@evil.test/x").ok);
});

Deno.test("a port that is not 443 is refused", () => {
  assertFalse(normaliseListingUrl("https://example.ro:8080/x").ok);
  assert(normaliseListingUrl("https://example.ro:443/x").ok);
});

Deno.test("something that is not a URL is a bad request, not a crash", () => {
  for (const raw of ["", "   ", "nu e link", "javascript:alert(1)", "data:text/html,x"]) {
    assertFalse(normaliseListingUrl(raw).ok, raw);
  }
});

// ---------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------

Deno.test("a site that disallows everything gets no request", () => {
  const txt = "User-agent: *\nDisallow: /";
  assertFalse(robotsAllows(txt, UA, "/auto/vw-golf"));
});

Deno.test("an empty Disallow allows everything, which is what it means", () => {
  const txt = "User-agent: *\nDisallow:";
  assert(robotsAllows(txt, UA, "/auto/vw-golf"));
});

Deno.test("a file with no rules for us allows us", () => {
  const txt = "User-agent: Googlebot\nDisallow: /";
  assert(robotsAllows(txt, UA, "/auto/vw-golf"));
});

Deno.test("a group naming us beats the catch-all, wherever it sits", () => {
  const txt = [
    "User-agent: *",
    "Disallow:",
    "",
    "User-agent: ExempluBot",
    "Disallow: /",
  ].join("\n");
  assertFalse(robotsAllows(txt, UA, "/auto/vw-golf"));
});

Deno.test("and a group naming us can allow what the catch-all forbids", () => {
  const txt = [
    "User-agent: *",
    "Disallow: /",
    "",
    "User-agent: ExempluBot",
    "Allow: /auto/",
    "Disallow: /",
  ].join("\n");
  assert(robotsAllows(txt, UA, "/auto/vw-golf"));
  assertFalse(robotsAllows(txt, UA, "/cont/setari"));
});

Deno.test("the longest matching rule wins", () => {
  const txt = ["User-agent: *", "Disallow: /auto/", "Allow: /auto/anunt/"].join("\n");
  assertFalse(robotsAllows(txt, UA, "/auto/lista"));
  assert(robotsAllows(txt, UA, "/auto/anunt/123"));
});

Deno.test("on a tie, Allow wins", () => {
  const txt = ["User-agent: *", "Disallow: /auto", "Allow: /auto"].join("\n");
  assert(robotsAllows(txt, UA, "/auto/x"));
});

Deno.test("consecutive User-agent lines share one group", () => {
  const txt = ["User-agent: A", "User-agent: ExempluBot", "Disallow: /"].join("\n");
  const groups = parseRobots(txt);
  assertEquals(groups.length, 1);
  assertEquals(groups[0]?.agents, ["a", "exemplubot"]);
  assertFalse(robotsAllows(txt, UA, "/x"));
});

Deno.test("comments and blank lines are ignored", () => {
  const txt = ["# nothing to see", "User-agent: *   # everyone", "Disallow: /privat"].join("\n");
  assertFalse(robotsAllows(txt, UA, "/privat/x"));
  assert(robotsAllows(txt, UA, "/public/x"));
});

Deno.test("a rule before any User-agent belongs to nobody", () => {
  const txt = ["Disallow: /", "User-agent: *", "Allow: /"].join("\n");
  assert(robotsAllows(txt, UA, "/auto/x"));
});

Deno.test("wildcards and end-anchors are honoured", () => {
  assert(robotsPatternMatches("/auto/*/foto", "/auto/123/foto"));
  assertFalse(robotsPatternMatches("/auto/*/foto", "/auto/123/detalii"));
  assert(robotsPatternMatches("/*.pdf$", "/manual/x.pdf"));
  assertFalse(robotsPatternMatches("/*.pdf$", "/manual/x.pdf?download=1"));
  assertFalse(robotsPatternMatches("", "/anything"));
});

Deno.test("an unreadable robots.txt is not a rule: an empty file allows", () => {
  assert(robotsAllows("", UA, "/auto/x"));
});

// ---------------------------------------------------------------------
// The metadata
// ---------------------------------------------------------------------

const OG_PAGE = `<!doctype html><html><head>
<title>Vand VW Golf 7 2018 - Anunturi</title>
<meta property="og:site_name" content="Anunturi Example">
<meta property="og:title" content="Volkswagen Golf 7 1.6 TDI, 2018">
<meta property="og:description" content="Masina este functionala, 145.000 km, Cluj-Napoca.">
<meta property="og:image" content="https://cdn.example.ro/foto/1.jpg">
<meta property="product:price:amount" content="11500">
<meta property="product:price:currency" content="EUR">
</head><body><p>Nu citim corpul paginii.</p></body></html>`;

Deno.test("Open Graph is read, and the body is not", () => {
  const meta = extractMetadata(OG_PAGE);
  assertEquals(meta.title, "Volkswagen Golf 7 1.6 TDI, 2018");
  assertEquals(meta.description, "Masina este functionala, 145.000 km, Cluj-Napoca.");
  assertEquals(meta.image, "https://cdn.example.ro/foto/1.jpg");
  assertEquals(meta.price, "11500");
  assertEquals(meta.currency, "EUR");
  assertEquals(meta.siteName, "Anunturi Example");
  assertFalse(JSON.stringify(meta).includes("Nu citim corpul"));
});

Deno.test("attribute order does not matter", () => {
  const html = `<meta content="Dacia Logan 2020" property="og:title">`;
  assertEquals(extractMetadata(html).title, "Dacia Logan 2020");
});

Deno.test("entities are decoded and whitespace collapsed", () => {
  const html = `<meta property="og:title" content="Golf &amp; Passat   &#8211;   2018">`;
  assertEquals(extractMetadata(html).title, "Golf & Passat – 2018");
});

Deno.test("the document title is the fallback when there is no og:title", () => {
  const html = `<html><head><title>  Ford Focus 2016  </title></head></html>`;
  assertEquals(extractMetadata(html).title, "Ford Focus 2016");
});

const LD_PAGE = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Car","name":"Audi A4 2.0 TDI 2019",
 "description":"Break, 190 CP","image":["https://cdn.example.ro/a4.jpg"],
 "offers":{"@type":"Offer","price":"17900","priceCurrency":"EUR"},
 "address":{"@type":"PostalAddress","addressLocality":"Timisoara"}}
</script></head><body></body></html>`;

Deno.test("JSON-LD fills what Open Graph did not say", () => {
  const meta = extractMetadata(LD_PAGE);
  assertEquals(meta.title, "Audi A4 2.0 TDI 2019");
  assertEquals(meta.image, "https://cdn.example.ro/a4.jpg");
  assertEquals(meta.price, "17900");
  assertEquals(meta.currency, "EUR");
  assertEquals(meta.location, "Timisoara");
});

Deno.test("Open Graph wins where the two disagree", () => {
  const html = `<html><head>
    <meta property="og:title" content="Titlul din og">
    <script type="application/ld+json">{"@type":"Car","name":"Alt titlu"}</script>
  </head></html>`;
  assertEquals(extractMetadata(html).title, "Titlul din og");
});

Deno.test("a @graph wrapper is flattened", () => {
  const html = `<script type="application/ld+json">
    {"@graph":[{"@type":"WebPage","name":"nu asta"},{"@type":"Vehicle","name":"Skoda Octavia 2017"}]}
  </script>`;
  const blocks = jsonLdBlocks(html);
  assertEquals(blocks.length, 2);
  assertEquals(extractMetadata(html).title, "Skoda Octavia 2017");
});

Deno.test("a JSON-LD block that is not about a vehicle is skipped", () => {
  const html = `<script type="application/ld+json">
    {"@type":"BreadcrumbList","name":"Acasa > Auto"}</script>`;
  assertEquals(extractMetadata(html).title, null);
});

Deno.test("broken JSON-LD does not take the rest of the page with it", () => {
  const html = `<script type="application/ld+json">{ nu e json </script>
    <meta property="og:title" content="Opel Astra 2015">`;
  assertEquals(extractMetadata(html).title, "Opel Astra 2015");
});

Deno.test("a page with no metadata is not worth a model call", () => {
  assert(metadataIsEmpty(extractMetadata("<html><body>nimic</body></html>")));
  assertFalse(metadataIsEmpty(extractMetadata(OG_PAGE)));
});

// ---------------------------------------------------------------------
// The confidence floor
// ---------------------------------------------------------------------

Deno.test("a field the model is unsure of is left empty, not guessed", () => {
  const result = keepConfident({
    make: { value: "Volkswagen", confidence: 0.97 },
    model: { value: "Golf", confidence: 0.91 },
    year: { value: "2018", confidence: 0.42 },
  }, 0.7);

  assertEquals(result.fields, { make: "Volkswagen", model: "Golf" });
  assertEquals(result.kept, 2);
  assertEquals(result.dropped, ["year"]);
});

Deno.test("null means the model did not see it, and is not a dropped field", () => {
  const result = keepConfident({
    make: { value: "Dacia", confidence: 0.9 },
    weight_kg: { value: null, confidence: 0.0 },
  }, 0.7);
  assertEquals(result.fields, { make: "Dacia" });
  assertEquals(result.dropped, []);
});

Deno.test("a missing confidence counts as no confidence", () => {
  const result = keepConfident(
    { make: { value: "Ford" } as unknown as { value: string; confidence: number } },
    0.7,
  );
  assertEquals(result.kept, 0);
  assertEquals(result.dropped, ["make"]);
});

Deno.test("a floor of zero still drops nothing that has a value", () => {
  const result = keepConfident({ year: { value: "2011", confidence: 0 } }, 0);
  assertEquals(result.fields, { year: "2011" });
});

// ---------------------------------------------------------------------
// The cost
// ---------------------------------------------------------------------

Deno.test("cost is the list price of what was actually used", () => {
  // 2000 in + 300 out on Opus: 2000*5/1e6 + 300*25/1e6 = 0.01 + 0.0075
  assertEquals(estimateCostUsd("claude-opus-5", 2000, 300), 0.0175);
});

Deno.test("an unknown model is priced at the dearest rate, never the cheapest", () => {
  assertEquals(
    estimateCostUsd("some-future-model", 2000, 300),
    estimateCostUsd("claude-opus-5", 2000, 300),
  );
});

Deno.test("zero usage costs zero", () => {
  assertEquals(estimateCostUsd("claude-opus-5", 0, 0), 0);
});

// ---------------------------------------------------------------------
// The cap on what we read
// ---------------------------------------------------------------------

function streamOf(text: string, chunk = 16): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunk));
      offset += chunk;
    },
  });
}

Deno.test("a body under the cap is read whole", async () => {
  const result = await readCapped(streamOf("salut"), 1000);
  assertEquals(result.text, "salut");
  assertFalse(result.truncated);
});

Deno.test("a body over the cap stops at the cap and says so", async () => {
  const result = await readCapped(streamOf("x".repeat(500)), 100);
  assertEquals(result.text.length, 100);
  assert(result.truncated);
});

Deno.test("no body is not an error", async () => {
  const result = await readCapped(null, 100);
  assertEquals(result.text, "");
  assertFalse(result.truncated);
});
