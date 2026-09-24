import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { requestsCopy } from '@/content/cereri';
import { REQUEST_STEPS, emptyDraft } from '@/lib/request-form';
import { OFFERED_CATEGORIES } from '@/lib/vehicle-categories';

/**
 * The publishing flow, as markup: the four named steps, the cards that
 * replaced the dropdown and the radio list, the route drawing, and the
 * photos travelling with the form from every step.
 *
 * The rules are `validateDraft` and are pinned in request-form.test.ts;
 * the browser half — blur, focus, the sticky bar — is
 * tests/e2e/publicare-cerere.spec.ts.
 */

vi.mock('@/app/cerere/actions', () => ({
  publishRequestAction: async () => ({}),
  previewCarriersAction: async () => null,
}));
// The step is in the address; here, the plain address — step one.
vi.mock('next/navigation', () => ({
  usePathname: () => '/cerere/noua',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/app/draft-actions', () => ({
  loadDraftAction: async () => null,
  saveDraftAction: async () => true,
  clearDraftAction: async () => {},
}));
vi.mock('@/app/cerere/import-actions', () => ({
  previewRequestPhotosAction: async () => ({}),
  attachListingPhotoAction: async () => ({ ok: false }),
  removeRequestPhotoAction: async () => {},
  extractFromLinkAction: async () => ({ ok: false }),
  extractFromPhotoAction: async () => ({ ok: false }),
}));

const { RequestForm, PhotoPaths } = await import('@/components/requests/request-form');
const { PublishStepper } = await import('@/components/requests/publish/stepper');
const { RoutePreview } = await import('@/components/requests/publish/route-preview');
const { ChoiceCard } = await import('@/components/requests/publish/choice-card');
const { PhotoPanelLocked } = await import('@/components/requests/photo-panel');

const c = requestsCopy.form;

function form(signedIn = false): string {
  return renderToStaticMarkup(
    <RequestForm
      initial={emptyDraft()}
      hasPrefill={false}
      today="2026-09-23"
      signedIn={signedIn}
      serverDraft={null}
    />,
  );
}

describe('the first screen of the flow', () => {
  const html = form();

  it('names the four steps, the first one current', () => {
    expect(REQUEST_STEPS.map((s) => c.steps[s])).toEqual(['Traseu', 'Vehicul', 'Serviciu', 'Contact']);
    for (const step of REQUEST_STEPS) expect(html).toContain(`data-step="${step}"`);
    expect(html).toMatch(/data-step="ruta" data-state="current"/);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  });

  it('says what the step asks and why, in plain words', () => {
    expect(html).toContain(c.stepHeads.ruta.title);
    expect(html).toContain(c.stepHeads.ruta.why);
  });

  it('puts the two places side by side from md, stacked below', () => {
    expect(html).toContain(c.route.fromCity);
    expect(html).toContain(c.route.toCity);
    expect(html).toMatch(/class="grid gap-4 md:grid-cols-2"/);
  });

  it('draws an empty route and waits for both places before a distance', () => {
    expect(html).toMatch(/data-route-preview="true" data-state="empty"/);
    expect(html).toContain(c.route.distanceWaiting);
    expect(html).not.toContain('data-distance');
  });

  it('keeps the action bar on the bottom of a phone and in the flow on a wide screen', () => {
    const bar = html.match(/<div data-action-bar="true" class="([^"]+)"/)?.[1] ?? '';
    expect(bar).toContain('sticky');
    expect(bar).toContain('bottom-0');
    expect(bar).toContain('sm:static');
    // No „Înapoi" on the first step: there is nowhere to go back to.
    expect(html).not.toContain(`>${c.back}<`);
    expect(html).toContain(`>${c.next}<`);
  });

  it('shows no message before anybody has touched anything', () => {
    // Messages appear on blur, never as a wall on the first render.
    expect(html).not.toContain('data-field-error');
    expect(html).not.toContain('aria-invalid="true"');
  });
});

describe('the photos travel with the form', () => {
  it('draws one hidden field per photo', () => {
    const html = renderToStaticMarkup(
      <PhotoPaths
        photos={[
          { path: 'u/1.jpg', preview: 'blob:1' },
          { path: 'u/2.jpg', preview: 'blob:2' },
        ]}
      />,
    );
    expect(html.match(/type="hidden" name="photo_paths"/g)).toHaveLength(2);
  });

  it('from the form itself, not from the step that shows the photos', () => {
    // Regression: the fields were drawn inside the photo panel, which only
    // exists on the vehicle step. The form is sent from the contact step,
    // so it carried no photos at all.
    const panel = readFileSync('src/components/requests/photo-panel.tsx', 'utf8');
    expect(panel).not.toMatch(/name="photo_paths"/);

    const source = readFileSync('src/components/requests/request-form.tsx', 'utf8');
    // The form element is `KeepingForm`, which keeps what was typed when a
    // request fails; the paths still have to be inside it, before any step.
    const formOpen = source.indexOf('<KeepingForm ref={formRef}');
    const paths = source.indexOf('<PhotoPaths photos={photos} />');
    const firstStep = source.indexOf("{step === 'ruta'");
    expect(formOpen).toBeGreaterThan(-1);
    expect(paths).toBeGreaterThan(formOpen);
    expect(paths).toBeLessThan(firstStep);
    expect(source.match(/<PhotoPaths /g)).toHaveLength(1);
  });

  it('shows a signed-out visitor where the photos go and when', () => {
    const html = renderToStaticMarkup(<PhotoPanelLocked />);
    expect(html).toContain('data-locked="true"');
    expect(html).toContain(c.photos.signedOut);
    expect(html).not.toContain('type="file"');
  });
});

describe('the stepper', () => {
  it('marks done steps as buttons back, the current one, and the ones ahead as quiet', () => {
    const html = renderToStaticMarkup(<PublishStepper current="serviciu" onSelect={() => {}} />);
    expect(html).toMatch(/data-step="ruta" data-state="done"/);
    expect(html).toMatch(/data-step="vehicul" data-state="done"/);
    expect(html).toMatch(/data-step="serviciu" data-state="current"/);
    expect(html).toMatch(/data-step="contact" data-state="ahead"/);
    // Two ways back, and none forward: going forward runs the checks.
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toContain(c.stepCurrent('Serviciu', 3, 4));
  });
});

describe('the route drawing', () => {
  const base = { fromCity: 'München', fromCountry: 'DE', toCity: '', toCountry: 'RO' };

  it('fills the origin once it is chosen', () => {
    const html = renderToStaticMarkup(<RoutePreview {...base} km={null} />);
    expect(html).toContain('data-state="from"');
    expect(html).toContain('München');
  });

  it('draws the route and shows the distance as the key number with both', () => {
    const html = renderToStaticMarkup(<RoutePreview {...base} toCity="Cluj-Napoca" km={934} />);
    expect(html).toContain('data-state="both"');
    expect(html).toContain('data-distance');
    expect(html).toMatch(/934\s?km/);
    expect(html).toContain(c.route.distanceNote);
    expect(html).toContain(c.route.mapLabel('München', 'Cluj-Napoca'));
  });

  it('shows no distance for places typed rather than picked', () => {
    const html = renderToStaticMarkup(<RoutePreview {...base} toCity="Cluj-Napoca" km={null} />);
    expect(html).not.toContain('data-distance');
    expect(html).toContain(c.route.distanceWaiting);
  });
});

describe('a choice drawn as a card', () => {
  const html = renderToStaticMarkup(
    <ChoiceCard
      name="svc"
      value="expres"
      checked
      onChange={() => {}}
      title="Expres"
      description={c.service.expres.means}
      aside={c.service.expres.price}
    />,
  );

  it('is still a native radio, named by its title and described by the rest', () => {
    const input = html.match(/<input [^>]*\/>/)?.[0] ?? '';
    for (const part of ['type="radio"', 'name="svc"', 'value="expres"', 'checked=""']) expect(input).toContain(part);
    const labelledBy = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(html).toContain(`id="${labelledBy}"`);
    expect(html).toMatch(/aria-describedby="[^"]+"/);
  });

  it('says chosen by more than colour', () => {
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('rounded-full bg-accent');
  });
});

describe('the vehicle categories', () => {
  it('are the offered list, every one with its weight hint', async () => {
    const { categoryMeta } = await import('@/lib/vehicle-categories');
    for (const category of OFFERED_CATEGORIES) {
      expect(categoryMeta(category)?.weightHint, category).toBeTruthy();
    }
  });
});
