import {
  isCalendarDate,
  isDocumentPath,
  isMementoPath,
  mayRead,
  mementoAnswer,
  mementoHint,
  readableMime,
  readRequest,
  withDeclaredDate,
} from "./modes.ts";

function assertEquals<T>(actual: T, expected: T, message?: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message ?? "assertEquals"}: expected ${e}, got ${a}`);
}

function assert(condition: boolean, message?: string): void {
  if (!condition) throw new Error(message ?? "assert");
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

// --- memento ---------------------------------------------------------------

const OWNER = "0b6f2a3c-1111-4a2b-9c3d-000000000001";
const FILE = "7e1d9c2b-2222-4f3e-8a1b-000000000002";

Deno.test("memento takes a JPEG in the memento bucket's shape and a known kind", () => {
  assertEquals(readRequest({ mode: "memento", file_path: `${OWNER}/${FILE}.jpg`, kind: "rovinieta" }), {
    mode: "memento",
    filePath: `${OWNER}/${FILE}.jpg`,
    kind: "rovinieta",
  });
});

Deno.test("memento refuses anything else", () => {
  for (const body of [
    { mode: "memento", file_path: `${OWNER}/${FILE}.pdf`, kind: "rca" },
    { mode: "memento", file_path: `../${OWNER}/${FILE}.jpg`, kind: "rca" },
    { mode: "memento", file_path: `${OWNER}/${FILE}.jpg`, kind: "licenta_comunitara" },
    { mode: "memento", file_path: `${OWNER}/${FILE}.jpg` },
    { mode: "memento", kind: "rca" },
  ]) {
    assert("error" in readRequest(body), JSON.stringify(body));
  }
  assert(!isMementoPath(`${OWNER}/${FILE}.JPG`));
  assert(isMementoPath(`${OWNER}/${FILE}.jpg`));
});

Deno.test("the model is told what the person said the photo is", () => {
  assertEquals(mementoHint("rca"), "rca");
  assert(mementoHint("rovinieta")!.includes("chitanță"));
  assertEquals(mementoHint("altceva"), null);
});

Deno.test("only the date, the series and the plate leave the function", () => {
  const answer = mementoAnswer({
    detected_kind: "rca",
    document_number: " RO/25/ABC123 ",
    valid_until: "2027-03-25",
    holder_name: "Ion Popescu",
    holder_cui: "123456",
    plate_number: "B123ABC",
    confidence: 0.92,
    issues: [],
  });
  assertEquals(answer, {
    valid_until: "2027-03-25",
    document_number: "RO/25/ABC123",
    plate_number: "B123ABC",
    confidence: 0.92,
  });
});

Deno.test("a date the model got wrong is no date, not a wrong one", () => {
  assertEquals(mementoAnswer({ valid_until: "2027-02-30" }).valid_until, null);
  assertEquals(mementoAnswer({ valid_until: "25.03.2027" }).valid_until, null);
  assertEquals(mementoAnswer(null), {
    valid_until: null,
    document_number: null,
    plate_number: null,
    confidence: null,
  });
});
