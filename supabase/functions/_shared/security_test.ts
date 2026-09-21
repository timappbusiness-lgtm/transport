import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { allowedOrigins, corsHeaders, secretsMatch } from "./security.ts";

const request = (origin?: string) =>
  new Request("https://fn.example/x", origin ? { headers: { Origin: origin } } : undefined);

Deno.test("a missing ALLOWED_ORIGIN does not fall back to *", () => {
  assertEquals(allowedOrigins(undefined), []);
  const headers = corsHeaders(request("https://evil.example"), []);
  // Nicio origine în răspuns, deci browserul oprește. Mai bine o funcție
  // care refuză vizibil decât un `*` pe care nu îl observă nimeni.
  assertEquals(headers["Access-Control-Allow-Origin"], undefined);
  assertEquals(headers["Vary"], "Origin");
});

Deno.test("an origin on the list is echoed back", () => {
  const allowed = allowedOrigins("https://coridor.ro, https://www.coridor.ro");
  assertEquals(allowed, ["https://coridor.ro", "https://www.coridor.ro"]);
  assertEquals(
    corsHeaders(request("https://www.coridor.ro"), allowed)["Access-Control-Allow-Origin"],
    "https://www.coridor.ro",
  );
});

Deno.test("a look-alike host is never echoed back", () => {
  const allowed = allowedOrigins("https://coridor.ro");
  const echoed = corsHeaders(request("https://coridor.ro.evil.example"), allowed)[
    "Access-Control-Allow-Origin"
  ];
  // Potrivirea este pe origine întreagă, nu pe prefix.
  assertEquals(echoed, "https://coridor.ro");
});

Deno.test("a trailing slash is not a different origin", () => {
  const allowed = allowedOrigins("https://coridor.ro/");
  assertEquals(
    corsHeaders(request("https://coridor.ro"), allowed)["Access-Control-Allow-Origin"],
    "https://coridor.ro",
  );
});

Deno.test("an empty or blank list yields nothing, not an empty string origin", () => {
  assertEquals(allowedOrigins(""), []);
  assertEquals(allowedOrigins("  ,  , "), []);
});

Deno.test("secretsMatch accepts the right secret", () => {
  assert(secretsMatch("s3cret-value", "s3cret-value"));
});

Deno.test("and refuses everything else, including the empty cases", () => {
  assertFalse(secretsMatch("s3cret-value", "s3cret-valuf"));
  assertFalse(secretsMatch("short", "s3cret-value"));
  assertFalse(secretsMatch(null, "s3cret-value"));
  assertFalse(secretsMatch("s3cret-value", null));
  assertFalse(secretsMatch(null, null));
});

Deno.test("a secret that differs only at the end is still refused", () => {
  // Exact cazul pe care `!==` îl rezolvă la primul octet și comparația
  // constantă îl parcurge întreg.
  assertFalse(secretsMatch("aaaaaaaaaaaaaaab", "aaaaaaaaaaaaaaaa"));
});
