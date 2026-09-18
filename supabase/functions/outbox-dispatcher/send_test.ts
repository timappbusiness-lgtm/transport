import { assert, assertEquals } from "jsr:@std/assert@^1";
import { isPermanent, renderValues, sendEmail } from "./send.ts";

/**
 * No network anywhere here. The fetch is injected, and the only thing
 * being tested is the decision the dispatcher makes about a response:
 * try again, or stop and let somebody look at it.
 */

const CONFIG = { apiKey: "test-key", from: "Coridor <nu-raspunde@coridor.ro>" };

function respondWith(status: number): typeof fetch {
  return () => Promise.resolve(new Response(status === 200 ? "{}" : "", { status }));
}

Deno.test("a 200 is a sent e-mail", async () => {
  const result = await sendEmail(
    { ...CONFIG, fetchImpl: respondWith(200) },
    "cineva@example.ro", "Subiect", "<p>x</p>", "x",
  );
  assertEquals(result.ok, true);
});

Deno.test("a 500 is worth another four tries", async () => {
  const result = await sendEmail(
    { ...CONFIG, fetchImpl: respondWith(500) },
    "cineva@example.ro", "Subiect", "<p>x</p>", "x",
  );
  assertEquals(result.ok, false);
  assertEquals(result.permanent, false);
  assertEquals(result.error, "provider a răspuns 500");
});

Deno.test("a 422 is not", async () => {
  // A malformed address is malformed on every attempt; retrying only
  // delays the moment a person sees it on the admin screen.
  const result = await sendEmail(
    { ...CONFIG, fetchImpl: respondWith(422) },
    "nu-e-adresa", "Subiect", "<p>x</p>", "x",
  );
  assertEquals(result.permanent, true);
});

Deno.test("429 is the one 4xx that means try again", async () => {
  const result = await sendEmail(
    { ...CONFIG, fetchImpl: respondWith(429) },
    "cineva@example.ro", "Subiect", "<p>x</p>", "x",
  );
  assertEquals(result.permanent, false);
});

Deno.test("isPermanent covers the range", () => {
  for (const status of [400, 401, 403, 404, 422]) {
    assertEquals(isPermanent(status), true, String(status));
  }
  for (const status of [429, 500, 502, 503, 504]) {
    assertEquals(isPermanent(status), false, String(status));
  }
});

Deno.test("a network error is always worth repeating", async () => {
  const result = await sendEmail(
    { ...CONFIG, fetchImpl: () => Promise.reject(new Error("ECONNRESET")) },
    "cineva@example.ro", "Subiect", "<p>x</p>", "x",
  );
  assertEquals(result.ok, false);
  assertEquals(result.permanent, undefined);
  assert(result.error?.startsWith("rețea:"));
});

Deno.test("the request carries the sender and the recipient", async () => {
  let seen: RequestInit | undefined;
  await sendEmail(
    {
      ...CONFIG,
      fetchImpl: (_url, init) => {
        seen = init;
        return Promise.resolve(new Response("{}", { status: 200 }));
      },
    },
    "cineva@example.ro", "Subiect", "<p>x</p>", "x",
  );

  const body = JSON.parse(String(seen?.body));
  assertEquals(body.from, CONFIG.from);
  assertEquals(body.to, ["cineva@example.ro"]);
  assertEquals(body.subject, "Subiect");
  // Both parts go, always: a text-only client should never get an empty
  // message.
  assertEquals(body.text, "x");
  assertEquals(body.html, "<p>x</p>");
});

Deno.test("the payload can override the site url, and usually does not", () => {
  assertEquals(renderValues({}, "https://coridor.ro").site_url, "https://coridor.ro");
  assertEquals(
    renderValues({ site_url: "https://altceva.ro" }, "https://coridor.ro").site_url,
    "https://altceva.ro",
  );
  assertEquals(renderValues({ company_name: "X SRL" }, "https://coridor.ro").company_name, "X SRL");
});
