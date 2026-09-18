// =====================================================================
// Sending, and deciding whether a failure is worth repeating
//
// Separate from `index.ts` because that file calls `Deno.serve` at the
// top level: a test importing it would bind a port. Everything here is a
// pure function over a response, so the tests inject a fetch and never
// touch the network.
// =====================================================================

export interface SendResult {
  ok: boolean;
  error?: string;
  /**
   * True when trying again cannot help.
   *
   * The distinction matters: a 500 is a provider having a bad minute and
   * deserves the four remaining attempts; a 422 for a malformed address
   * will be a 422 every time, and four more tries only delay the moment a
   * person looks at it.
   */
  permanent?: boolean;
}

export interface MailerConfig {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
}

/** Whether a status code is worth another attempt. */
export function isPermanent(status: number): boolean {
  // 429 is the exception inside the 4xx range: it means "not now", which
  // is exactly what a retry is for.
  return status >= 400 && status < 500 && status !== 429;
}

export async function sendEmail(
  config: MailerConfig,
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<SendResult> {
  const doFetch = config.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await doFetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: config.from, to: [to], subject, html, text }),
    });
  } catch (error) {
    // A network error is always worth repeating.
    return {
      ok: false,
      error: `rețea: ${error instanceof Error ? error.message : "necunoscut"}`,
    };
  }

  if (response.ok) {
    // The body is not read: nothing downstream needs the provider's id,
    // and leaving it unread means a large one cannot stall the loop.
    await response.body?.cancel().catch(() => {});
    return { ok: true };
  }

  await response.body?.cancel().catch(() => {});
  return {
    ok: false,
    error: `provider a răspuns ${response.status}`,
    permanent: isPermanent(response.status),
  };
}

/** What a row needs on top of its payload to render. */
export function renderValues(
  payload: Record<string, unknown>,
  siteUrl: string,
): Record<string, unknown> {
  // `site_url` first so a payload that carries its own wins — a producer
  // that knows better than the environment is rare but should not be
  // overridden by it.
  return { site_url: siteUrl, ...payload };
}
