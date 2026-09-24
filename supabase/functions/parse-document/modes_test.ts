import { isCalendarDate, isDocumentPath, mayRead, readableMime, readRequest, withDeclaredDate } from "./modes.ts";

function assertEquals<T>(actual: T, expected: T, message?: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message ?? "assertEquals"}: expected ${e}, got ${a}`);
}

const DOC = "d0000000-0000-4000-8000-000000000001";
const COMPANY = "fc000000-0000-4000-8000-000000000001";

Deno.test("a bare document id is the old request, unchanged", () => {
  assertEquals(readRequest({ document_id: DOC }), { mode: "parse", documentId: DOC });
});

Deno.test("classify takes a path in the documents bucket's own shape, nothing else", () => {
  assertEquals(readRequest({ mode: "classify", file_path: `${COMPANY}/${DOC}.jpg` }), {
    mode: "classify",
    filePath: `${COMPANY}/${DOC}.jpg`,
  });
  for (const path of ["../etc/passwd", `${COMPANY}/../${DOC}.jpg`, `${COMPANY}/${DOC}.exe`, "x.pdf", ""]) {
    assertEquals("error" in readRequest({ mode: "classify", file_path: path }), true, path);
  }
});

Deno.test("declare needs a real calendar date", () => {
  assertEquals(readRequest({ mode: "declare", document_id: DOC, valid_until: "2027-03-25" }), {
    mode: "declare",
    documentId: DOC,
    validUntil: "2027-03-25",
  });
  for (const date of ["2027-02-30", "25.03.2027", "2027-3-5", ""]) {
    assertEquals("error" in readRequest({ mode: "declare", document_id: DOC, valid_until: date }), true, date);
  }
});

Deno.test("a missing or malformed id, or an unknown mode, is refused", () => {
  assertEquals("error" in readRequest({}), true);
  assertEquals("error" in readRequest({ document_id: "abc" }), true);
  assertEquals("error" in readRequest({ mode: "approve", document_id: DOC }), true);
  assertEquals("error" in readRequest(null), true);
});

Deno.test("only a document waiting for us is read again", () => {
  for (const status of ["uploaded", "parsing", "pending"]) assertEquals(mayRead(status), true, status);
  // Reading one of these used to put it back into the review queue.
  for (const status of ["approved", "rejected", "expired", "replaced", null]) {
    assertEquals(mayRead(status), false, String(status));
  }
});

Deno.test("the model reads PDFs and three image formats; HEIC it cannot", () => {
  assertEquals(readableMime("application/pdf"), "application/pdf");
  assertEquals(readableMime("image/jpeg"), "image/jpeg");
  assertEquals(readableMime("image/heic"), null);
  assertEquals(readableMime("application/octet-stream"), null);
});

Deno.test("the declared date sits beside what the model read, never over it", () => {
  const now = new Date("2026-09-24T10:00:00Z");
  const merged = withDeclaredDate({ valid_until: "2027-01-01", confidence: 0.9 }, "2027-01-31", "u1", now);
  assertEquals(merged, {
    valid_until: "2027-01-01",
    confidence: 0.9,
    declared: { valid_until: "2027-01-31", by: "u1", at: "2026-09-24T10:00:00.000Z" },
  });
  assertEquals(withDeclaredDate(null, "2027-01-31", "u1", now).declared, {
    valid_until: "2027-01-31",
    by: "u1",
    at: "2026-09-24T10:00:00.000Z",
  });
});

Deno.test("paths and dates", () => {
  assertEquals(isDocumentPath(`${COMPANY}/${DOC}.pdf`), true);
  assertEquals(isDocumentPath(`${COMPANY}/${DOC}`), false);
  assertEquals(isCalendarDate("2028-02-29"), true);
  assertEquals(isCalendarDate("2027-02-29"), false);
});
