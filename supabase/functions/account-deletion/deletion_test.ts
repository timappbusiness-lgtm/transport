import { assert, assertEquals, assertThrows } from "jsr:@std/assert@^1";
import { chunk, groupByBucket, isAlreadyGone } from "./deletion.ts";

Deno.test("paths are grouped by bucket and deduplicated", () => {
  const grouped = groupByBucket([
    { bucket: "documents", path: "c1/itp.pdf" },
    { bucket: "listing-photos", path: "u1/a.jpg" },
    { bucket: "documents", path: "c1/rca.pdf" },
    // The same photo, named by the listing and by the folder.
    { bucket: "listing-photos", path: "u1/a.jpg" },
  ]);

  assertEquals([...grouped.keys()].sort(), ["documents", "listing-photos"]);
  assertEquals(grouped.get("documents"), ["c1/itp.pdf", "c1/rca.pdf"]);
  assertEquals(grouped.get("listing-photos"), ["u1/a.jpg"]);
});

Deno.test("empty and blank entries never reach the storage API", () => {
  const grouped = groupByBucket([
    { bucket: "", path: "x" },
    { bucket: "documents", path: "  " },
    { bucket: "documents", path: " c1/itp.pdf " },
  ]);
  assertEquals(grouped.size, 1);
  assertEquals(grouped.get("documents"), ["c1/itp.pdf"]);
});

Deno.test("a long history is split into calls storage will accept", () => {
  const paths = Array.from({ length: 250 }, (_, i) => `c1/${i}.pdf`);
  const batches = chunk(paths, 100);
  assertEquals(batches.length, 3);
  assertEquals(batches[0]!.length, 100);
  assertEquals(batches[2]!.length, 50);
  assertEquals(batches.flat().length, 250);
  assertThrows(() => chunk(paths, 0));
});

Deno.test("a file that has already gone is not a failure", () => {
  // The shape of a run that died halfway and started again.
  assert(isAlreadyGone("Object not found"));
  assert(isAlreadyGone("The resource does not exist"));
  assert(!isAlreadyGone("Permission denied"));
  assert(!isAlreadyGone(null));
});
