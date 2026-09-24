import { downloadName, isUuid, objectPath, readRequest, RENDERER_REVISION, statusForRpcError } from "./cache.ts";
import { SAMPLE_RENDER_DATA } from "./sample.ts";

function assertEquals<T>(actual: T, expected: T, message?: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message ?? "assertEquals"}: expected ${e}, got ${a}`);
}

Deno.test("the object path starts with the order, which the bucket policy reads", () => {
  const path = objectPath(SAMPLE_RENDER_DATA);
  assertEquals(path.split("/")[0], SAMPLE_RENDER_DATA.order_id);
  assertEquals(path.split("/")[1], SAMPLE_RENDER_DATA.contract_id);
});

Deno.test("everything that changes the pages is in the path", () => {
  // Version 2, template 1.0, three acceptances on versions 1 and 2.
  assertEquals(objectPath(SAMPLE_RENDER_DATA).split("/")[2], `v2-t1.0-a3-${RENDERER_REVISION}.pdf`);

  const oneMore = {
    ...SAMPLE_RENDER_DATA,
    acceptances: [
      ...SAMPLE_RENDER_DATA.acceptances,
      { version: 2, side: "client" as const, name: "X", company_name: null, accepted_at: "2026-09-25T10:00:00Z" },
    ],
  };
  assertEquals(objectPath(oneMore).split("/")[2], `v2-t1.0-a4-${RENDERER_REVISION}.pdf`);

  const redacted = { ...SAMPLE_RENDER_DATA, redacted: true };
  assertEquals(objectPath(redacted).split("/")[2], `v2-t1.0-a3-x-${RENDERER_REVISION}.pdf`);
});

Deno.test("acceptances on a later version do not change an earlier version's file", () => {
  const v1 = { ...SAMPLE_RENDER_DATA, version: 1 };
  assertEquals(objectPath(v1).split("/")[2], `v1-t1.0-a2-${RENDERER_REVISION}.pdf`);
});

Deno.test("the download is named after the contract and its version", () => {
  assertEquals(downloadName(SAMPLE_RENDER_DATA), "contract-CT-2026-A1B2C3D4-v2.pdf");
  assertEquals(downloadName({ contract_number: "CT-2026/../X", version: 3 }), "contract-CT-2026X-v3.pdf");
});

Deno.test("a request needs a contract id and defaults to opening inline", () => {
  assertEquals(readRequest(null), null);
  assertEquals(readRequest({}), null);
  assertEquals(readRequest({ contract_id: "not-a-uuid" }), null);
  assertEquals(readRequest({ contract_id: "'; drop table x; --" }), null);
  assertEquals(readRequest({ contract_id: SAMPLE_RENDER_DATA.contract_id }), {
    contractId: SAMPLE_RENDER_DATA.contract_id,
    disposition: "inline",
  });
  assertEquals(readRequest({ contract_id: SAMPLE_RENDER_DATA.contract_id, disposition: "attachment" })?.disposition, "attachment");
  assertEquals(readRequest({ contract_id: SAMPLE_RENDER_DATA.contract_id, disposition: "evil" })?.disposition, "inline");
  assertEquals(isUuid(SAMPLE_RENDER_DATA.order_id), true);
});

Deno.test("not there and not yours are the same answer", () => {
  assertEquals(statusForRpcError(null), 200);
  assertEquals(statusForRpcError({ code: "P0002" }), 404);
  assertEquals(statusForRpcError({ code: "42501" }), 404);
  assertEquals(statusForRpcError({ code: "PGRST301" }), 404);
  assertEquals(statusForRpcError({ code: "XX000" }), 500);
});
