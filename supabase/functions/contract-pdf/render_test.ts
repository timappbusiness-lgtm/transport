import { Buffer } from "node:buffer";
import PDFDocument from "npm:pdfkit@0.20.2";
import { INTER_REGULAR, INTER_SEMIBOLD } from "./fonts.ts";
import { contractFacts } from "./model.ts";
import { type PdfKitConstructor, renderContractPdf } from "./render.ts";
import { SAMPLE_RENDER_DATA } from "./sample.ts";
import { templateFor } from "./templates/index.ts";

// The same drawing the Next unit tests check page by page, run here under
// Deno with the npm specifier the deployed function uses: a pdfkit that
// works in Node and not in the edge runtime would pass those and fail here.
Deno.test("draws the sample contract under Deno, in well under three seconds", async () => {
  const started = performance.now();
  const facts = contractFacts(SAMPLE_RENDER_DATA);
  const document = templateFor(facts.templateVersion).build(facts, SAMPLE_RENDER_DATA.snapshot.generated_at ?? null);
  const pdf = await renderContractPdf(document, {
    PDFDocument: PDFDocument as unknown as PdfKitConstructor,
    fonts: { regular: Buffer.from(INTER_REGULAR, "base64"), semibold: Buffer.from(INTER_SEMIBOLD, "base64") },
  });
  const elapsed = performance.now() - started;

  const head = new TextDecoder().decode(pdf.slice(0, 8));
  if (!head.startsWith("%PDF-1.7")) throw new Error(`not a PDF: ${head}`);
  const body = new TextDecoder("latin1").decode(pdf);
  if (!body.includes("/FontFile2")) throw new Error("the font is not embedded");
  if (body.includes("/Helvetica")) throw new Error("a standard font slipped in");
  if (elapsed > 3000) throw new Error(`took ${Math.round(elapsed)} ms`);
});
