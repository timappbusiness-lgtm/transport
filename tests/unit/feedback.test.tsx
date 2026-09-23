import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buttonClasses } from '@/components/ui/button';
import { BoardSkeleton, DashboardSkeleton } from '@/components/ui/skeleton';
import { ToastView, toastFor, type Toast } from '@/components/ui/toast';
import { tabClasses } from '@/components/ui/tab';
import { CARD_INTERACTIVE } from '@/components/ui/interactive';
import { loadingCopy } from '@/content/loading';
import { requestsCopy } from '@/content/cereri';

/**
 * The feedback layer: what a screen shows while it loads, what a save
 * says afterwards, and how a control answers a hand on it.
 *
 * Each of these is small, and each fails quietly — a spinner nobody can
 * read, a success that a screen reader hears twice, a hover that moves the
 * layout under the pointer. None of it throws.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

describe('skeletons', () => {
  const screens = [
    ['a board', <BoardSkeleton key="b" label={loadingCopy.requests} title="Cereri" lede="Rânduri." />],
    ['the dashboard', <DashboardSkeleton key="a" label={loadingCopy.account} />],
  ] as const;

  it.each(screens)('%s is announced once, and its boxes are silent', (_, node) => {
    const html = renderToStaticMarkup(node);
    // One live region, one sentence.
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<span class="sr-only">Se încarcă[^<]*…<\/span>/);
    // Every grey box is hidden from assistive technology.
    const bones = html.match(/<span aria-hidden="true" class="block animate-pulse[^"]*"/g) ?? [];
    expect(bones.length).toBeGreaterThan(4);
  });

  it('a board skeleton has the board card shape: tile, lines, action', () => {
    const html = renderToStaticMarkup(
      <BoardSkeleton label={loadingCopy.requests} title="Cereri" lede="Rânduri." cards={3} />,
    );
    // The tile is the size of the real category tile, so nothing jumps.
    expect(html.match(/h-12 w-16 flex-none rounded-input sm:h-16 sm:w-24/g)).toHaveLength(3);
  });

  it('a board skeleton carries the page’s own heading, as text and not as a second h1', () => {
    const html = renderToStaticMarkup(
      <BoardSkeleton label={loadingCopy.requests} title={requestsCopy.board.title} lede={requestsCopy.board.lede} />,
    );
    // The lede is the largest thing a phone paints on a board; drawn
    // here, it is on screen at the first paint rather than after the rows.
    expect(html).toContain(requestsCopy.board.lede);
    expect(html).not.toContain('<h1');
    // Hidden from a screen reader, which hears the status sentence once.
    expect(html).toMatch(/<div aria-hidden="true" class="max-w-\[46rem\]"><p class="font-display text-h1/);
  });

  it('each board loading file uses the words its page uses', () => {
    for (const [file, copy] of [
      ['src/app/cereri/(panou)/loading.tsx', 'requestsCopy.board'],
      ['src/app/trasee/(panou)/loading.tsx', 'departuresCopy.board'],
    ] as const) {
      const loader = read(file);
      expect(loader, file).toContain(`title={${copy}.title}`);
      expect(loader, file).toContain(`lede={${copy}.lede}`);
      const page = read(file.replace('loading.tsx', 'page.tsx'));
      expect(page, file).toMatch(/<h1 className="text-h1">\{c\.title\}<\/h1>/);
      expect(page, file).toMatch(/<p className="mt-3 text-body-lg text-muted">\{c\.lede\}<\/p>/);
    }
  });

  it('the tile in the skeleton is the tile on the card', () => {
    // If the card tile changes size, the skeleton must follow, or the
    // page jumps when the rows arrive.
    const art = read('src/components/ui/category-art.tsx');
    expect(art).toContain("box: 'h-12 w-16 sm:h-16 sm:w-24'");
  });

  it('no loading state is a spinner', () => {
    for (const file of walk(join(ROOT, 'src'))) {
      if (!/\.(tsx|ts)$/.test(file)) continue;
      expect(read(file.slice(ROOT.length + 1)), file).not.toMatch(/animate-spin|Spinner/);
    }
  });

  it('no loading boundary covers a page that can 404 or redirect', () => {
    // Under a loading.tsx the page streams, the 200 goes out with the
    // skeleton, and a later notFound() is a 404 page with a 200 status —
    // for a missing request, an unlisted firm, a conversation that is not
    // yours. It happened once in this pass; the list pages now sit in
    // route groups so their skeleton covers them and nothing else.
    const loaders = walk(join(ROOT, 'src/app')).filter((f) => f.endsWith('/loading.tsx'));
    const offenders: string[] = [];
    for (const loader of loaders) {
      const dir = loader.slice(0, -'/loading.tsx'.length);
      const covered = walk(dir).filter(
        (f) => /\/(page|layout)\.tsx$/.test(f) && f !== `${dir}/layout.tsx`,
      );
      for (const file of covered) {
        if (/\b(notFound|redirect|permanentRedirect)\(/.test(read(file.slice(ROOT.length + 1)))) {
          offenders.push(`${loader.slice(ROOT.length + 1)} covers ${file.slice(ROOT.length + 1)}`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('every loading.tsx draws a skeleton and has a label', () => {
    const loaders = walk(join(ROOT, 'src/app')).filter((f) => f.endsWith('/loading.tsx'));
    expect(loaders.length).toBeGreaterThanOrEqual(3);
    for (const file of loaders) {
      const source = read(file.slice(ROOT.length + 1));
      expect(source, file).toMatch(/(Board|Dashboard)Skeleton/);
      expect(source, file).toMatch(/label=\{loadingCopy\.\w+\}/);
    }
  });
});

describe('toasts', () => {
  const toast = (over: Partial<Toast>): Toast => ({
    id: 1,
    kind: 'success',
    message: 'Am salvat zonele.',
    ...over,
  });

  it('a success is polite and has no close button', () => {
    const html = renderToStaticMarkup(<ToastView toast={toast({})} onClose={() => {}} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('data-toast="success"');
    expect(html).not.toContain('<button');
    expect(html).toContain('Am salvat zonele.');
  });

  it('an error is read at once and can be closed', () => {
    const html = renderToStaticMarkup(
      <ToastView toast={toast({ kind: 'error', message: 'Nu am putut salva.' })} onClose={() => {}} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('>Închide</button>');
  });

  it('a quiet error is drawn but not announced a second time', () => {
    // The form keeps its inline FormError, which is the alert.
    const html = renderToStaticMarkup(
      <ToastView toast={toast({ kind: 'error', message: 'x', quiet: true })} onClose={() => {}} />,
    );
    expect(html).not.toMatch(/role="(alert|status)"/);
    expect(html).toContain('data-toast="error"');
  });

  it('neither kind carries an icon or the accent on an error', () => {
    for (const kind of ['success', 'error'] as const) {
      const html = renderToStaticMarkup(<ToastView toast={toast({ kind })} onClose={() => {}} />);
      expect(html).not.toContain('<svg');
      if (kind === 'error') expect(html).not.toMatch(/\b(bg|text|border)-accent\b/);
    }
  });

  it('an error wins over a notice, and nothing gives nothing', () => {
    expect(toastFor({})).toBeNull();
    expect(toastFor({ notice: '', error: '' })).toBeNull();
    expect(toastFor({ notice: 'Salvat.' })).toEqual({ kind: 'success', message: 'Salvat.' });
    expect(toastFor({ notice: 'Salvat.', error: 'Nu.' })).toEqual({ kind: 'error', message: 'Nu.' });
  });

  it('the forms that raise a toast keep their inline error', () => {
    const forms = walk(join(ROOT, 'src/components')).filter((f) =>
      read(f.slice(ROOT.length + 1)).includes('useActionToast(state)'),
    );
    expect(forms.length).toBeGreaterThanOrEqual(5);
    for (const file of forms) {
      const source = read(file.slice(ROOT.length + 1));
      expect(source, file).toContain('<FormError>{state.error}</FormError>');
      // And no longer print the notice at the top as well.
      expect(source, file).not.toContain('<FormNotice>{state.notice}</FormNotice>');
    }
  });

  it('the provider wraps the whole page', () => {
    expect(read('src/app/layout.tsx')).toMatch(
      /<ToastProvider>\s*<SiteHeader \/>\s*<main id="continut">\{children\}<\/main>\s*<SiteFooter \/>\s*<\/ToastProvider>/,
    );
  });
});

describe('motion', () => {
  const css = read('src/app/globals.css');

  it('every keyframe moves only transform and opacity', () => {
    const frames = [...css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\n\}/g)];
    expect(frames.length).toBeGreaterThanOrEqual(3);
    for (const [, body] of frames) {
      const props = [...body!.matchAll(/^\s*([a-z-]+):/gm)].map((m) => m[1]);
      for (const prop of props) expect(['transform', 'opacity']).toContain(prop);
    }
  });

  it('reduced motion takes every animation and transition to one frame', () => {
    const block = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(block).toContain('animation-duration: 0.01ms !important');
    expect(block).toContain('transition-duration: 0.01ms !important');
  });

  it('the press is a transform, and only where motion is welcome', () => {
    expect(buttonClasses()).toContain('motion-safe:active:scale-[0.98]');
    expect(buttonClasses()).not.toMatch(/(^|\s)active:scale/);
    expect(tabClasses(false, 'md')).toContain('active:scale-[0.98]');
    expect(tabClasses(false, 'md')).toContain('motion-reduce:active:scale-100');
    expect(CARD_INTERACTIVE).toContain('motion-safe:hover:-translate-y-0.5');
    expect(CARD_INTERACTIVE).not.toMatch(/(^|\s)hover:-translate/);
  });

  it('no transition animates a layout property', () => {
    for (const file of walk(join(ROOT, 'src'))) {
      if (!/\.(tsx|ts)$/.test(file)) continue;
      const source = read(file.slice(ROOT.length + 1));
      expect(source, file).not.toMatch(/transition-all|transition-\[[^\]]*(width|height|top|left|margin|padding)/);
    }
  });

  it('the raised shadow fades in on its own layer, not by animating box-shadow', () => {
    expect(CARD_INTERACTIVE).not.toContain('transition-shadow');
    expect(CARD_INTERACTIVE).toMatch(/before:opacity-0/);
    expect(CARD_INTERACTIVE).toMatch(/hover:before:opacity-100/);
  });

  it('inputs answer a hover with their border, and not while focused', () => {
    expect(css).toMatch(/select,\s*textarea\s*\):hover:not\(:disabled, :focus\)/);
  });
});
