import { expect, test } from '@playwright/test';

/**
 * Antetele, pe răspunsul adevărat.
 *
 * Testul unitar verifică ce scriem în configurație. Ăsta verifică ce
 * ajunge la browser — două lucruri diferite, iar între ele stă Next,
 * care are propriile idei despre ce antete păstrează.
 *
 * Constatarea R2 din `docs/12-audit-securitate.md`: nu exista niciunul.
 */

const PAGES = ['/', '/cereri', '/trasee', '/autentificare'];

test.describe('antetele de securitate ajung la browser', () => {
  for (const path of PAGES) {
    test(`${path} le are pe toate`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response, `${path} nu a răspuns`).not.toBeNull();

      const headers = response!.headers();

      expect(headers['x-frame-options'], path).toBe('DENY');
      expect(headers['x-content-type-options'], path).toBe('nosniff');
      expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
      expect(headers['permissions-policy'], path).toContain('camera=()');

      const csp = headers['content-security-policy'] ?? '';
      expect(csp, `${path} nu are CSP`).toContain("frame-ancestors 'none'");
      expect(csp, path).toContain("object-src 'none'");
      expect(csp, path).toContain("form-action 'self'");
    });
  }

  test('și pagina chiar funcționează cu ele puse', async ({ page }) => {
    // O politică prea strânsă se vede ca o pagină goală, nu ca o eroare
    // de configurare. Deci: încărcare, consolă curată, conținut vizibil.
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/cereri');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const blocked = errors.filter((text) => /Content Security Policy|Refused to/i.test(text));
    expect(blocked, `CSP a blocat ceva de care pagina are nevoie:\n${blocked.join('\n')}`)
      .toHaveLength(0);
  });
});
