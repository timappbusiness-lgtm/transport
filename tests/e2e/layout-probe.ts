import type { Page } from '@playwright/test';

/**
 * The layout checks every screen answers, measured in the browser.
 *
 * One function, run inside the page, so the sweep and the targeted specs
 * ask the same questions the same way. Each check is a defect that was on
 * a screen of this site and that nobody saw until a person opened it on a
 * phone:
 *
 * - `page-x-scroll`: the page itself moves sideways (a table, a long
 *   word). Wide content scrolls inside its own container instead.
 * - `past-viewport`: the element that makes it move, when nothing on
 *   the way up scrolls or clips on purpose.
 * - `overflow-x`: text standing out of its own box — a long company name,
 *   a locality, a document name, a number — without an ellipsis.
 * - `small-target`: a control under 24×24 CSS px whose 24px circle
 *   reaches another control (WCAG 2.5.8, the spacing exception included:
 *   a stand-alone link in a sentence is exempt, a lone small icon button
 *   with room around it passes).
 * - `stretched-img`: an image drawn at another shape than its own and
 *   without `object-fit` to crop it.
 * - `text-overlap`: two runs of text drawn over each other (the homepage
 *   trust card at 390, before).
 */
export interface LayoutProblem {
  kind:
    | 'page-x-scroll'
    | 'past-viewport'
    | 'overflow-x'
    | 'small-target'
    | 'stretched-img'
    | 'text-overlap';
  el: string;
  detail: string;
}

export async function inspectLayout(page: Page): Promise<LayoutProblem[]> {
  return page.evaluate(() => {
    const problems: { kind: string; el: string; detail: string }[] = [];
    const vw = document.documentElement.clientWidth;

    const describe = (el: Element) => {
      const text = ((el as HTMLElement).innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 50);
      const cls = (el.getAttribute('class') ?? '').split(/\s+/).slice(0, 4).join(' ');
      return `<${el.tagName.toLowerCase()} class="${cls}">${text}`;
    };
    const hidden = (el: Element) => {
      if (el.closest('.sr-only, [hidden], details:not([open]) > :not(summary)')) return true;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        return true;
      }
      const r = el.getBoundingClientRect();
      return r.width === 0 && r.height === 0;
    };
    const scrollsOrClips = (value: string) =>
      value === 'auto' || value === 'scroll' || value === 'hidden' || value === 'clip';

    // The page moves sideways.
    const extra = document.documentElement.scrollWidth - vw;
    if (extra > 1) problems.push({ kind: 'page-x-scroll', el: 'html', detail: `${extra}px` });

    const all = Array.from(document.body.querySelectorAll('*'));

    // What makes it move.
    for (const el of all) {
      if (hidden(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right <= vw + 1 || r.width === 0) continue;
      let parent = el.parentElement;
      let contained = false;
      while (parent && parent !== document.body) {
        if (scrollsOrClips(getComputedStyle(parent).overflowX)) {
          contained = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (!contained) {
        problems.push({ kind: 'past-viewport', el: describe(el), detail: `right ${Math.round(r.right)} > ${vw}` });
      }
    }

    // Text out of its own box.
    for (const el of document.body.querySelectorAll(
      'p, span, a, h1, h2, h3, h4, dd, dt, td, th, li, label, button, strong',
    )) {
      if (hidden(el) || el.children.length > 3) continue;
      const html = el as HTMLElement;
      if (html.clientWidth === 0 || html.scrollWidth <= html.clientWidth + 2) continue;
      const style = getComputedStyle(el);
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue;
      if (style.textOverflow === 'ellipsis') continue;
      problems.push({
        kind: 'overflow-x',
        el: describe(el),
        detail: `${html.scrollWidth - html.clientWidth}px`,
      });
    }

    // Touch targets, WCAG 2.5.8 with its spacing exception.
    type Target = { el: Element; r: DOMRect };
    const targets: Target[] = [];
    const small: Target[] = [];
    for (const el of document.body.querySelectorAll(
      'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab]',
    )) {
      if (hidden(el)) continue;
      // A box or a radio inside its label: the label is the target.
      if (el.matches('input[type=checkbox], input[type=radio]') && el.closest('label')) continue;
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') {
        // A link inside a sentence is exempt.
        const sentence = (el.parentElement?.innerText ?? '').trim();
        if (sentence.length > ((el as HTMLElement).innerText ?? '').trim().length + 3) continue;
      }
      const r = el.getBoundingClientRect();
      targets.push({ el, r });
      if (r.width < 24 || r.height < 24) small.push({ el, r });
    }
    for (const target of small) {
      const cx = target.r.left + target.r.width / 2;
      const cy = target.r.top + target.r.height / 2;
      const crowded = targets.some((other) => {
        if (other.el === target.el || other.el.contains(target.el) || target.el.contains(other.el)) {
          return false;
        }
        const nx = Math.max(other.r.left, Math.min(cx, other.r.right));
        const ny = Math.max(other.r.top, Math.min(cy, other.r.bottom));
        if (Math.hypot(cx - nx, cy - ny) < 12) return true;
        if (!small.some((s) => s.el === other.el)) return false;
        const ox = other.r.left + other.r.width / 2;
        const oy = other.r.top + other.r.height / 2;
        return Math.hypot(cx - ox, cy - oy) < 24;
      });
      if (crowded) {
        problems.push({
          kind: 'small-target',
          el: describe(target.el),
          detail: `${Math.round(target.r.width)}×${Math.round(target.r.height)}`,
        });
      }
    }

    // Images at another shape than their own.
    for (const img of document.querySelectorAll('img')) {
      if (hidden(img) || !img.naturalWidth) continue;
      const fit = getComputedStyle(img).objectFit;
      if (fit === 'cover' || fit === 'contain') continue;
      const r = img.getBoundingClientRect();
      const natural = img.naturalWidth / img.naturalHeight;
      const drawn = r.width / r.height;
      if (Math.abs(natural - drawn) / natural > 0.03) {
        problems.push({
          kind: 'stretched-img',
          el: describe(img),
          detail: `${natural.toFixed(2)} drawn ${drawn.toFixed(2)}`,
        });
      }
    }

    // Text over text: two leaf runs whose lines overlap by most of a line.
    const leaves: { el: Element; r: DOMRect }[] = [];
    for (const el of all) {
      if (el.children.length > 0 || hidden(el) || el.closest('svg')) continue;
      if ((el.textContent ?? '').trim() === '') continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const r of Array.from(range.getClientRects())) {
        if (r.width > 1 && r.height > 1) leaves.push({ el, r });
      }
    }
    const seen = new Set<string>();
    for (let i = 0; i < leaves.length; i += 1) {
      for (let j = i + 1; j < leaves.length; j += 1) {
        const a = leaves[i]!;
        const b = leaves[j]!;
        if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
        // A sticky or fixed bar drawn over the page is the next check's
        // business, not text drawn over text.
        const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (x <= 2 || y <= 0.5 * Math.min(a.r.height, b.r.height)) continue;
        if (a.el.closest('[data-layout-bar]') || b.el.closest('[data-layout-bar]')) continue;
        const key = `${describe(a.el)}|${describe(b.el)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        problems.push({ kind: 'text-overlap', el: describe(a.el), detail: describe(b.el) });
      }
    }

    return problems as { kind: LayoutProblem['kind']; el: string; detail: string }[];
  });
}

/**
 * Marks every bar pinned to the screen, so the overlap check leaves a bar
 * drawn over the page to `coveredByBar`.
 */
export async function markBars(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const position = getComputedStyle(el).position;
      if (position === 'fixed' || position === 'sticky') el.setAttribute('data-layout-bar', '');
    }
  });
}

/**
 * Whatever pinned bar is drawn over the focused element, or null.
 *
 * Asked of the browser's own hit test at the middle of the element, so a
 * skip link that sits above the header on purpose is not counted, and a
 * field that the sticky „Continuă" bar hides is.
 */
export async function coveredByBar(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
    const y = r.top + r.height / 2;
    if (y < 0 || y > innerHeight) return `${el.tagName} off screen at ${Math.round(y)}`;
    const top = document.elementFromPoint(x, y);
    if (!top || el.contains(top) || top.contains(el)) return null;
    for (let bar: Element | null = top; bar && bar !== document.body; bar = bar.parentElement) {
      const position = getComputedStyle(bar).position;
      if (position === 'fixed' || position === 'sticky') {
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? el.id ?? '').trim().slice(0, 40);
        return `${el.tagName.toLowerCase()} „${name}" under ${String(bar.className).slice(0, 60)}`;
      }
    }
    return null;
  });
}

/** Human-readable, one line per problem, for an assertion message. */
export function listProblems(problems: readonly LayoutProblem[]): string[] {
  return problems.map((p) => `${p.kind}: ${p.el} — ${p.detail}`);
}
