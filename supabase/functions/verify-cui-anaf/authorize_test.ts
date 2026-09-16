import { authorizeCompanyWrite, type CompanyWriteChecks, normaliseCui } from "./authorize.ts";

function assertEquals<T>(actual: T, expected: T, message?: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message ?? "assertEquals"}: expected ${e}, got ${a}`);
}

function checks(opts: { manages: boolean | Error; cui: string | null }): CompanyWriteChecks {
  return {
    callerManages: () =>
      opts.manages instanceof Error ? Promise.reject(opts.manages) : Promise.resolve(opts.manages),
    storedCui: () => Promise.resolve(opts.cui),
  };
}

const COMPANY = "fc000000-0000-0000-0000-000000000001";

Deno.test("a manager of the company, looking up its own CUI, may write", async () => {
  const d = await authorizeCompanyWrite(checks({ manages: true, cui: "14399840" }), COMPANY, 14399840);
  assertEquals(d, { allowed: true });
});

Deno.test("a caller who does not manage the company gets 403", async () => {
  const d = await authorizeCompanyWrite(checks({ manages: false, cui: "14399840" }), COMPANY, 14399840);
  assertEquals(d.allowed, false);
  assertEquals(d.allowed === false && d.status, 403);
});

Deno.test("a failed membership check (no JWT, RPC error) is a 403, not a write", async () => {
  const d = await authorizeCompanyWrite(
    checks({ manages: new Error("permission denied"), cui: "14399840" }),
    COMPANY,
    14399840,
  );
  assertEquals(d.allowed === false && d.status, 403);
});

Deno.test("a manager cannot copy another firm's ANAF record onto their company", async () => {
  const d = await authorizeCompanyWrite(checks({ manages: true, cui: "14399840" }), COMPANY, 99999999);
  assertEquals(d.allowed === false && d.status, 409);
});

Deno.test("an unknown company is a 404", async () => {
  const d = await authorizeCompanyWrite(checks({ manages: true, cui: null }), COMPANY, 14399840);
  assertEquals(d.allowed === false && d.status, 404);
});

Deno.test("a stored CUI with the RO prefix still matches", async () => {
  const d = await authorizeCompanyWrite(checks({ manages: true, cui: "RO 14399840" }), COMPANY, 14399840);
  assertEquals(d, { allowed: true });
});

Deno.test("normaliseCui strips the prefix and spaces and rejects nonsense", () => {
  assertEquals(normaliseCui("RO 12 345 678"), 12345678);
  assertEquals(normaliseCui("x"), null);
  assertEquals(normaliseCui("12345678901"), null);
});
