import { assert, assertEquals, assertThrows, assertStringIncludes } from "jsr:@std/assert@^1";
import {
  escapeHtml,
  MissingVariable,
  render,
  templateVariables,
  variablesIn,
} from "./render.ts";
import { renderValues } from "./send.ts";
import { TEMPLATES, WITHOUT_PRODUCER } from "./templates.ts";
import { BRAND_NAME, OPERATOR_LINE } from "../_shared/brand.ts";

/**
 * The two things worth testing about an e-mail nobody will read twice:
 * that a broken one never leaves, and that the Romanian is Romanian.
 */

const SITE = "https://exemplu.ro";

Deno.test("a template renders its subject, body and action", () => {
  const mail = render("company_verified", TEMPLATES.company_verified!, {
    company_name: "Transport Rapid SRL",
    site_url: SITE,
  });

  assertEquals(mail.subject, "Transport Rapid SRL este verificată");
  assertStringIncludes(mail.html, "Transport Rapid SRL");
  assertStringIncludes(mail.html, `${SITE}/cont/trasee/nou`);
  assertStringIncludes(mail.text, "Publică primul traseu: https://exemplu.ro/cont/trasee/nou");
});

Deno.test("a missing variable throws instead of shipping a hole", () => {
  const error = assertThrows(
    () => render("company_verified", TEMPLATES.company_verified!, { site_url: SITE }),
    MissingVariable,
  );
  assertEquals((error as MissingVariable).variable, "company_name");
});

Deno.test("an empty string counts as missing", () => {
  // „Bună ziua, " with nothing after it is worse than no e-mail at all.
  assertThrows(
    () => render("company_verified", TEMPLATES.company_verified!, {
      company_name: "   ",
      site_url: SITE,
    }),
    MissingVariable,
  );
});

Deno.test("every variable in a template is found", () => {
  assertEquals(variablesIn("{{ a }} și {{ b }}, iar apoi {{ a }}"), ["a", "b"]);
  assertEquals(variablesIn("fără variabile"), []);
  assertEquals(templateVariables(TEMPLATES.request_match_alert!).sort(), [
    "from_city",
    "from_country",
    "request_id",
    "site_url",
    "to_city",
    "to_country",
  ]);
});

Deno.test("somebody else's company name cannot inject markup", () => {
  const mail = render("company_verified", TEMPLATES.company_verified!, {
    company_name: '<script>alert("x")</script> SRL',
    site_url: SITE,
  });
  assert(!mail.html.includes("<script>"));
  assertStringIncludes(mail.html, "&lt;script&gt;");
  // The text version carries it literally, which is correct: there is no
  // markup to escape into.
  assertStringIncludes(mail.text, "<script>");
});

Deno.test("escapeHtml covers the five characters that matter", () => {
  assertEquals(escapeHtml(`<>&"'`), "&lt;&gt;&amp;&quot;&#39;");
});

// ---------------------------------------------------------------------
// The unsubscribe rule
// ---------------------------------------------------------------------

Deno.test("an alert can be switched off", () => {
  const mail = render("request_match_alert", TEMPLATES.request_match_alert!, {
    from_city: "Cluj-Napoca",
    from_country: "RO",
    to_city: "München",
    to_country: "DE",
    request_id: "abc",
    site_url: SITE,
  }, { unsubscribeUrl: `${SITE}/cont/setari/notificari` });

  assertStringIncludes(mail.html, "Schimbă-ți preferințele");
  assertStringIncludes(mail.text, "Nu mai vrei mesajele astea?");
});

Deno.test("a suspension cannot", () => {
  // Somebody who cannot be told their account stopped working cannot fix
  // it, and an unsubscribe link here makes that permanent.
  const mail = render("account_suspended", TEMPLATES.account_suspended!, {
    company_name: "Transport Rapid SRL",
    reason: "Asigurare CMR expirată",
    site_url: SITE,
  }, { unsubscribeUrl: `${SITE}/cont/setari/notificari` });

  assert(!mail.html.includes("Schimbă-ți preferințele"));
  assert(!mail.text.includes("Nu mai vrei"));
});

Deno.test("every security and account message refuses the unsubscribe link", () => {
  const mustNotOptOut = [
    "account_suspended",
    "account_reactivated",
    "company_verified",
    "company_rejected",
    "document_rejected",
    "vehicle_suspended",
    "company_invitation",
    "reservation_confirmed",
    "subscription_activated",
    "subscription_request_received",
    "account_deletion_scheduled",
    "account_deletion_blocked",
    "account_deletion_cancelled",
    "account_deletion_completed",
  ];
  for (const name of mustNotOptOut) {
    assertEquals(TEMPLATES[name]?.unsubscribable, false, name);
  }
});

// ---------------------------------------------------------------------
// The Romanian
// ---------------------------------------------------------------------

Deno.test("no exclamation marks and no superlatives anywhere", () => {
  for (const [name, template] of Object.entries(TEMPLATES)) {
    const all = [template.subject, ...template.lines].join(" ");
    assert(!all.includes("!"), `${name} carries an exclamation mark`);
    assert(
      !/\b(excelent|extraordinar|fantastic|uimitor|cel mai bun|perfect)\b/i.test(all),
      `${name} carries a superlative`,
    );
  }
});

Deno.test("the copy is Romanian, with its diacritics", () => {
  for (const [name, template] of Object.entries(TEMPLATES)) {
    const all = [template.subject, ...template.lines].join(" ");
    assert(/[ăâîșț]/i.test(all), `${name} has no Romanian diacritics at all`);
    // The Turkish cedillas render close enough that nobody notices and
    // break search, sorting and screen readers.
    assert(!/[şţŞŢ]/.test(all), `${name} uses the Turkish cedilla`);
    assert(
      !/\b(Submit|Cancel|Loading|Please|Error|Click here)\b/.test(all),
      `${name} has English left in it`,
    );
  }
});

Deno.test("every template has exactly one action, or none", () => {
  for (const [name, template] of Object.entries(TEMPLATES)) {
    if (template.action === undefined) continue;
    assertStringIncludes(template.action.href, "{{ site_url }}", name);
    assert(template.action.label.length <= 30, `${name} action label is a sentence`);
  }
});

Deno.test("every template starts by greeting the person", () => {
  for (const [name, template] of Object.entries(TEMPLATES)) {
    assertEquals(template.lines[0], "Bună ziua,", name);
  }
});

// ---------------------------------------------------------------------
// The honest gap
// ---------------------------------------------------------------------

Deno.test("the deletion e-mail carries the link that stops the clock", () => {
  // The one message where the action is not a convenience: an account
  // held for a fortnight has no working login to cancel from, so the
  // token in this link is the whole rescue.
  const mail = render("account_deletion_scheduled", TEMPLATES.account_deletion_scheduled!, {
    what: "contului",
    scheduled_for: "02.10.2026",
    cancel_token: "6f1d0c7a-0000-0000-0000-00000000abcd",
    site_url: SITE,
  });

  assertStringIncludes(
    mail.html,
    `${SITE}/stergere/anuleaza?t=6f1d0c7a-0000-0000-0000-00000000abcd`,
  );
  assertStringIncludes(mail.text, "Anulează ștergerea: https://exemplu.ro/stergere/anuleaza");
  assertStringIncludes(mail.subject, "02.10.2026");
});

Deno.test("the last e-mail says it is the last one", () => {
  const mail = render("account_deletion_completed", TEMPLATES.account_deletion_completed!, {});
  assertStringIncludes(mail.text, "ultimul mesaj");
  assertEquals(TEMPLATES.account_deletion_completed!.action, undefined);
});

Deno.test("the templates with no producer are listed, not pretended about", () => {
  // Writing the copy early costs nothing; claiming these events already
  // reach anybody would be false. The list is what a reader checks
  // against the migrations.
  for (const name of WITHOUT_PRODUCER) {
    assert(TEMPLATES[name] !== undefined, `${name} is listed but not written`);
  }
  assert(WITHOUT_PRODUCER.length > 0);
});

Deno.test("every template renders with its own variables filled", () => {
  // Catches a template whose action URL wants something the body never
  // mentions, which is the shape of a hole nobody sees until it sends.
  for (const [name, template] of Object.entries(TEMPLATES)) {
    const values: Record<string, string> = {};
    for (const variable of templateVariables(template)) values[variable] = "x";
    const mail = render(name, template, values);
    assert(mail.subject.length > 0, name);
    assert(!mail.html.includes("{{"), `${name} left a placeholder in the html`);
    assert(!mail.text.includes("{{"), `${name} left a placeholder in the text`);
  }
});

// ---------------------------------------------------------------------
// The brand: one name, from the generated copy, and the mark beside it
// ---------------------------------------------------------------------

Deno.test("the header carries the mark beside the name, as decoration", () => {
  const values = renderValues({ company_name: "Transport Rapid SRL" }, SITE);
  const mail = render("company_verified", TEMPLATES.company_verified!, values, {
    markUrl: `${SITE}/brand/mark-email.png`,
  });
  // An empty alt: with images off the name beside it is all that shows,
  // not a broken icon and not the name twice.
  assertStringIncludes(mail.html, `<img src="${SITE}/brand/mark-email.png" width="32" height="32" alt=""`);
  assertStringIncludes(mail.html, `>${BRAND_NAME}</td>`);
  assert(mail.text.endsWith(`${BRAND_NAME}\n${OPERATOR_LINE}`));
});

Deno.test("every e-mail says who sends it: the operator, under the message", () => {
  for (const [name, template] of Object.entries(TEMPLATES)) {
    const values = Object.fromEntries(templateVariables(template).map((v) => [v, "x"]));
    const mail = render(name, template, renderValues(values, SITE));
    assertStringIncludes(mail.html, escapeHtml(OPERATOR_LINE), name);
    assert(mail.text.endsWith(OPERATOR_LINE), name);
  }
  // The line is the operator's, not a placeholder.
  assert(!OPERATOR_LINE.includes("[de completat]"));
  assertStringIncludes(OPERATOR_LINE, "CUI RO ");
});

Deno.test("without a mark the header is the name alone", () => {
  const mail = render("company_verified", TEMPLATES.company_verified!, renderValues({ company_name: "X SRL" }, SITE));
  assert(!mail.html.includes("<img"));
  assertStringIncludes(mail.html, `>${BRAND_NAME}</p>`);
});

Deno.test("no template spells the name out: it arrives as {{ brand }}", () => {
  for (const [name, template] of Object.entries(TEMPLATES)) {
    const text = [template.subject, ...template.lines, template.action?.label ?? ""].join("\n");
    assert(!text.includes(BRAND_NAME), `${name} writes the brand name instead of {{ brand }}`);
  }
  const invitation = render(
    "company_invitation",
    TEMPLATES.company_invitation!,
    renderValues({ invited_by: "Ana", company_name: "X SRL", role: "dispecer" }, SITE),
  );
  assertStringIncludes(invitation.text, `firmei X SRL pe ${BRAND_NAME}, cu rolul dispecer`);
});
