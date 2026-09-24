/**
 * Draws a `ContractDocument` as an A4 PDF.
 *
 * pdfkit is passed in rather than imported, so this file stays pure
 * TypeScript: the edge function passes `npm:pdfkit`, the Next unit tests
 * pass the same package from node_modules, and both draw the same pages.
 * The fonts are passed in too, as TrueType bytes — Inter, embedded and
 * subset by pdfkit — so the Romanian letters are real glyphs with a
 * ToUnicode map behind them: they print, and they copy out of the PDF as
 * ș and ț, not as boxes or as the cedilla look-alikes.
 *
 * Deliberately plain. No logo, no icon, no colour beyond the text greys,
 * no rule except a hairline where a table needs one. A contract is read
 * on paper by somebody deciding whether they are owed money.
 */

import type { Block, ContractDocument } from './document.ts';
import type { Row } from './model.ts';

/**
 * The print scale, taken from the design tokens in `src/app/globals.css`.
 *
 * The screen body is 15px; on paper it is 9.5pt. The other sizes keep
 * the screen's ratios to it — `small` is 13/15 of body, `subheading` is
 * `h3`'s 17/15 — and `tests/unit/contract-pdf.test.ts` holds both the
 * colours and the ratios to the stylesheet. Spacing is the 4px grid at
 * 0.75pt per px: a step of 3pt.
 */
export const PRINT = {
  color: {
    foreground: '#1c262b', // --color-foreground
    muted: '#5e6d74', // --color-muted
    border: '#e2e7e9', // --color-border
    borderStrong: '#7c8a91', // --color-border-strong
  },
  size: {
    title: 18,
    subtitle: 10,
    heading: 12,
    subheading: 10.75,
    body: 9.5,
    small: 8.25,
    footer: 7.25,
  },
  /** Line height 1.5 on screen; Inter's own line box is ~1.21, pdfkit adds the rest as a gap. */
  lineGap: 0.3,
  step: 3,
  margin: { top: 57, bottom: 88, left: 57, right: 57 },
  labelColumn: 150,
} as const;

/** The part of pdfkit's document this renderer uses. */
export interface PdfDoc {
  page: {
    width: number;
    height: number;
    margins: { top: number; bottom: number; left: number; right: number };
  };
  y: number;
  registerFont(name: string, src: unknown): PdfDoc;
  font(name: string): PdfDoc;
  fontSize(size: number): PdfDoc;
  fillColor(color: string): PdfDoc;
  strokeColor(color: string): PdfDoc;
  lineWidth(width: number): PdfDoc;
  text(text: string, x?: number, y?: number, options?: Record<string, unknown>): PdfDoc;
  heightOfString(text: string, options?: Record<string, unknown>): number;
  moveTo(x: number, y: number): PdfDoc;
  lineTo(x: number, y: number): PdfDoc;
  stroke(): PdfDoc;
  rect(x: number, y: number, w: number, h: number): PdfDoc;
  addPage(options?: Record<string, unknown>): PdfDoc;
  switchToPage(index: number): PdfDoc;
  bufferedPageRange(): { start: number; count: number };
  on(event: string, listener: (chunk: Uint8Array) => void): PdfDoc;
  end(): void;
}

export type PdfKitConstructor = new (options: Record<string, unknown>) => PdfDoc;

export interface RenderDeps {
  PDFDocument: PdfKitConstructor;
  /** TrueType bytes (a Buffer under Node and Deno's node compatibility). */
  fonts: { regular: unknown; semibold: unknown };
}

const REGULAR = 'Inter';
const SEMIBOLD = 'Inter-SemiBold';

function gap(size: number): number {
  return size * PRINT.lineGap;
}

export async function renderContractPdf(contract: ContractDocument, deps: RenderDeps): Promise<Uint8Array> {
  const created = contract.info.createdAt ? new Date(contract.info.createdAt.replace(/(\.\d{3})\d+/, '$1')) : null;
  const doc = new deps.PDFDocument({
    size: 'A4',
    margins: PRINT.margin,
    bufferPages: true,
    autoFirstPage: true,
    // Handing pdfkit a font up front keeps it from loading Helvetica's
    // metrics from disk, which a bundled edge function does not have.
    font: deps.fonts.regular,
    lang: 'ro-RO',
    displayTitle: true,
    pdfVersion: '1.7',
    info: {
      Title: contract.info.title,
      Subject: contract.info.subject,
      Author: contract.info.author,
      Keywords: contract.info.keywords,
      Creator: contract.info.author,
      Producer: 'pdfkit',
      ...(created && !Number.isNaN(created.getTime()) ? { CreationDate: created, ModDate: created } : {}),
    },
  });

  const chunks: Uint8Array[] = [];
  const finished = new Promise<void>((resolve) => doc.on('end', () => resolve()));
  doc.on('data', (chunk) => chunks.push(chunk));

  doc.registerFont(REGULAR, deps.fonts.regular);
  doc.registerFont(SEMIBOLD, deps.fonts.semibold);

  const left: number = PRINT.margin.left;
  const width = doc.page.width - PRINT.margin.left - PRINT.margin.right;
  const bottom = () => doc.page.height - PRINT.margin.bottom;
  let y: number = PRINT.margin.top;

  const ensure = (height: number) => {
    if (y + height > bottom()) {
      doc.addPage();
      y = PRINT.margin.top;
    }
  };

  const style = (font: string, size: number, color: string = PRINT.color.foreground) => {
    doc.font(font).fontSize(size).fillColor(color);
  };

  const measure = (text: string, font: string, size: number, w: number) => {
    doc.font(font).fontSize(size);
    return doc.heightOfString(text, { width: w, lineGap: gap(size) });
  };

  const hairline = (at: number, color: string = PRINT.color.border) => {
    doc.lineWidth(0.5).strokeColor(color).moveTo(left, at).lineTo(left + width, at).stroke();
  };

  /** Flowing text: pdfkit carries it over a page break by itself. */
  const flow = (text: string, font: string, size: number, color: string, x = left, w = width) => {
    ensure(size * 1.6);
    style(font, size, color);
    doc.text(text, x, y, { width: w, lineGap: gap(size) });
    y = doc.y;
  };

  const rows = (items: Row[], labelSize: number = PRINT.size.small, valueSize: number = PRINT.size.body) => {
    const labelW = PRINT.labelColumn;
    const valueX = left + labelW + 4 * PRINT.step;
    const valueW = width - labelW - 4 * PRINT.step;
    for (const item of items) {
      const h = Math.max(
        measure(item.label, REGULAR, labelSize, labelW),
        measure(item.value, REGULAR, valueSize, valueW),
      );
      ensure(h);
      const top = y;
      style(REGULAR, labelSize, PRINT.color.muted);
      doc.text(item.label, left, top + (valueSize - labelSize) * 0.6, { width: labelW, lineGap: gap(labelSize) });
      style(REGULAR, valueSize);
      doc.text(item.value, valueX, top, { width: valueW, lineGap: gap(valueSize) });
      y = top + h + PRINT.step;
    }
  };

  const table = (block: Extract<Block, { kind: 'table' }>) => {
    const pad = 2 * PRINT.step;
    const xs: number[] = [];
    let acc = left;
    for (const fraction of block.widths) {
      xs.push(acc);
      acc += fraction * width;
    }
    const cellW = (i: number) => (block.widths[i] ?? 0) * width - pad;
    const size = PRINT.size.small;

    const header = () => {
      const h = Math.max(...block.columns.map((c, i) => measure(c, SEMIBOLD, size, cellW(i))));
      ensure(h + 2 * pad);
      style(SEMIBOLD, size, PRINT.color.muted);
      block.columns.forEach((c, i) => doc.text(c, xs[i]!, y, { width: cellW(i), lineGap: gap(size) }));
      y += h + PRINT.step;
      hairline(y, PRINT.color.borderStrong);
      y += PRINT.step;
    };

    header();
    for (const cells of block.rows) {
      const h = Math.max(...cells.map((c, i) => measure(c, REGULAR, size, cellW(i))));
      if (y + h + pad > bottom()) {
        doc.addPage();
        y = PRINT.margin.top;
        header();
      }
      style(REGULAR, size);
      cells.forEach((c, i) => doc.text(c, xs[i]!, y, { width: cellW(i), lineGap: gap(size) }));
      y += h + PRINT.step;
      hairline(y);
      y += PRINT.step;
    }
    y += PRINT.step;
  };

  // Title and the record under it.
  style(SEMIBOLD, PRINT.size.title);
  doc.text(contract.title, left, y, { width });
  y = doc.y + PRINT.step;
  style(REGULAR, PRINT.size.subtitle, PRINT.color.muted);
  doc.text(contract.subtitle, left, y, { width });
  y = doc.y + 3 * PRINT.step;
  rows(contract.meta, PRINT.size.small, PRINT.size.small);
  y += PRINT.step;
  hairline(y, PRINT.color.borderStrong);
  y += 4 * PRINT.step;

  for (const block of contract.blocks) {
    switch (block.kind) {
      case 'heading': {
        y += 3 * PRINT.step;
        // A heading never sits alone at the bottom of a page.
        ensure(measure(block.text, SEMIBOLD, PRINT.size.heading, width) + 12 * PRINT.step);
        flow(block.text, SEMIBOLD, PRINT.size.heading, PRINT.color.foreground);
        y += 2 * PRINT.step;
        break;
      }
      case 'subheading': {
        y += 2 * PRINT.step;
        ensure(measure(block.text, SEMIBOLD, PRINT.size.subheading, width) + 8 * PRINT.step);
        flow(block.text, SEMIBOLD, PRINT.size.subheading, PRINT.color.foreground);
        y += PRINT.step;
        break;
      }
      case 'paragraph': {
        flow(block.text, REGULAR, PRINT.size.body, block.muted ? PRINT.color.muted : PRINT.color.foreground);
        y += 2 * PRINT.step;
        break;
      }
      case 'rows': {
        rows(block.rows);
        y += PRINT.step;
        break;
      }
      case 'table': {
        table(block);
        break;
      }
      case 'list': {
        const indent = 4 * PRINT.step;
        for (const item of block.items) {
          ensure(PRINT.size.body * 1.6);
          style(REGULAR, PRINT.size.body);
          doc.text('–', left, y, { width: indent, lineBreak: false });
          flow(item, REGULAR, PRINT.size.body, PRINT.color.foreground, left + indent, width - indent);
          y += PRINT.step;
        }
        y += PRINT.step;
        break;
      }
      case 'notice': {
        const pad = 3 * PRINT.step;
        const inner = width - 2 * pad;
        const titleH = measure(block.title, SEMIBOLD, PRINT.size.body, inner);
        const textH = measure(block.text, REGULAR, PRINT.size.small, inner);
        const h = titleH + PRINT.step + textH + 2 * pad;
        ensure(h);
        doc.lineWidth(0.75).strokeColor(PRINT.color.borderStrong).rect(left, y, width, h).stroke();
        style(SEMIBOLD, PRINT.size.body);
        doc.text(block.title, left + pad, y + pad, { width: inner, lineGap: gap(PRINT.size.body) });
        style(REGULAR, PRINT.size.small);
        doc.text(block.text, left + pad, y + pad + titleH + PRINT.step, { width: inner, lineGap: gap(PRINT.size.small) });
        y += h + 3 * PRINT.step;
        break;
      }
    }
  }

  // The footer on every page: contract, version, when it was generated,
  // page x of n, and the acceptances this version carries.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing inside the bottom margin would otherwise start a new page.
    const margins = doc.page.margins;
    const savedBottom = margins.bottom;
    margins.bottom = 0;
    const top = doc.page.height - PRINT.margin.bottom + 5 * PRINT.step;
    hairline(top);
    const size = PRINT.size.footer;
    const pageLabel = `Pagina ${i - range.start + 1} din ${range.count}`;
    style(REGULAR, size, PRINT.color.muted);
    doc.text(pageLabel, left, top + 2 * PRINT.step, { width, align: 'right', lineBreak: false });
    doc.text(contract.footer.left, left, top + 2 * PRINT.step, { width: width - 70, lineGap: gap(size) });
    let lineY = doc.y + PRINT.step / 2;
    for (const line of contract.footer.lines) {
      doc.text(line, left, lineY, { width, lineGap: gap(size) });
      lineY = doc.y;
    }
    margins.bottom = savedBottom;
  }

  doc.end();
  await finished;

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
