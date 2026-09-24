import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import { INTER_REGULAR, INTER_SEMIBOLD } from '../../supabase/functions/contract-pdf/fonts.ts';
import { contractFacts } from '../../supabase/functions/contract-pdf/model.ts';
import { PRINT, type PdfKitConstructor, renderContractPdf } from '../../supabase/functions/contract-pdf/render.ts';
import { SAMPLE_RENDER_DATA } from '../../supabase/functions/contract-pdf/sample.ts';
import type { RenderData } from '../../supabase/functions/contract-pdf/snapshot.ts';
import { templateFor } from '../../supabase/functions/contract-pdf/templates/index.ts';

/**
 * The contract as a PDF: drawn with the same renderer, fonts and model
 * the edge function uses, then read back through its text layer — what a
 * search, a copy-paste or a screen reader gets. A diacritic that prints
 * right and copies out as a box fails here.
 */

const PDFDocument = createRequire(import.meta.url)('pdfkit') as PdfKitConstructor;

async function draw(data: RenderData): Promise<Uint8Array> {
  const facts = contractFacts(data);
  const document = templateFor(facts.templateVersion).build(facts, data.snapshot.generated_at ?? null);
  return renderContractPdf(document, {
    PDFDocument,
    fonts: { regular: Buffer.from(INTER_REGULAR, 'base64'), semibold: Buffer.from(INTER_SEMIBOLD, 'base64') },
  });
}

interface PageText {
  width: number;
  height: number;
  text: string;
}

async function read(pdf: Uint8Array): Promise<{ pages: PageText[]; title: unknown }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: pdf.slice(), disableFontFace: true, useSystemFonts: false });
  const doc = await task.promise;
  const pages: PageText[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : ''))
      .join('');
    pages.push({ width: viewport.width, height: viewport.height, text });
  }
  const meta = await doc.getMetadata();
  await task.destroy();
  return { pages, title: (meta.info as Record<string, unknown>).Title };
}

describe('the contract PDF', () => {
  let pdf: Uint8Array;
  let pages: PageText[];
  let title: unknown;
  let elapsed: number;

  beforeAll(async () => {
    const started = performance.now();
    pdf = await draw(SAMPLE_RENDER_DATA);
    elapsed = performance.now() - started;
    ({ pages, title } = await read(pdf));
  }, 30_000);

  const all = () => pages.map((p) => p.text).join('\n');

  it('is drawn in well under three seconds', () => {
    expect(elapsed).toBeLessThan(3000);
  });

  it('is A4, every page', () => {
    for (const page of pages) {
      expect(page.width).toBeCloseTo(595.28, 1);
      expect(page.height).toBeCloseTo(841.89, 1);
    }
  });

  it('embeds its own font and no standard one', () => {
    const raw = Buffer.from(pdf).toString('latin1');
    expect(raw).toContain('/FontFile2');
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Inter/);
    expect(raw).not.toContain('/Helvetica');
  });

  it('keeps the Romanian letters in the text layer, with the comma below', () => {
    const text = all();
    for (const word of ['Ștefan Țurcanu', 'Bălășescu', 'Târgu Mureș', 'Iași', 'înmatriculare', 'șoferului', 'Neînțelegeri']) {
      expect(text).toContain(word);
    }
    expect(text).not.toMatch(/[şţŞŢ]/);
    expect(text).not.toContain('�');
  });

  it('prints dates, amounts and day counts the Romanian way', () => {
    const text = all();
    expect(text).toContain('2.400,00 lei');
    expect(text).toContain('30 de zile');
    expect(text).toContain('între 01.10.2026 și 02.10.2026');
    expect(text).toContain('24.09.2026, ora 13:30');
  });

  it('carries the contract number, the version, the generation time and the page on every page', () => {
    pages.forEach((page, i) => {
      expect(page.text).toContain('Contract CT-2026-A1B2C3D4 · versiunea 2 · generat la 24.09.2026, ora 13:30');
      expect(page.text).toContain(`Pagina ${i + 1} din ${pages.length}`);
      expect(page.text).toContain('Acceptări versiunea 2: transportatorul — Ștefan Țurcanu, 24.09.2026, ora 14:05');
    });
  });

  it('names itself in the document properties', () => {
    expect(title).toBe('Contract de transport CT-2026-A1B2C3D4, versiunea 2');
  });

  it('draws the same bytes from the same version, so a cached file is the file', async () => {
    const again = await draw(structuredClone(SAMPLE_RENDER_DATA));
    expect(Buffer.from(again).equals(Buffer.from(pdf))).toBe(true);
  });
});

describe('the print scale, against the design tokens', () => {
  const css = readFileSync('src/app/globals.css', 'utf8');
  const token = (name: string) => {
    const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
    if (!m) throw new Error(`no --${name} in globals.css`);
    return m[1]!.trim();
  };
  const rem = (name: string) => parseFloat(token(name));

  it('uses the stylesheet’s text greys and hairlines', () => {
    expect(PRINT.color.foreground).toBe(token('color-foreground'));
    expect(PRINT.color.muted).toBe(token('color-muted'));
    expect(PRINT.color.border).toBe(token('color-border'));
    expect(PRINT.color.borderStrong).toBe(token('color-border-strong'));
  });

  it('keeps the screen’s ratios between body, small and h3', () => {
    const body = rem('text-body');
    expect(PRINT.size.small / PRINT.size.body).toBeCloseTo(rem('text-small') / body, 1);
    expect(PRINT.size.subheading / PRINT.size.body).toBeCloseTo(rem('text-h3') / body, 1);
  });

  it('spaces on the 4px grid', () => {
    expect(PRINT.step).toBe(4 * 0.75);
  });
});
