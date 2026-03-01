// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * PIIScanner — detects personally identifiable information before cloud routing.
 *
 * Detections:
 *   - Email addresses
 *   - Dutch IBANs (NL prefix prioritised) + generic IBANs
 *   - BSN (Dutch social security — 9-digit with 11-check / Elfproef)
 *   - Phone numbers (NL, EU, US)
 *   - Credit card numbers (Luhn validated)
 *   - IP addresses
 *   - Person names (via `compromise` NLP, graceful fallback)
 *
 * PRIVACY NOTE: scan results are metadata only (type + count). Raw matched
 * values are never logged or returned to avoid re-exposing PII.
 */

export interface PIIScanResult {
  containsPii: boolean;
  typesFound: string[];
  /** Count per type — for routing decisions and audit logs. Never includes raw values. */
  counts: Record<string, number>;
}

// ── Compiled regex patterns ───────────────────────────────────────────────────

const PATTERNS: Array<{ type: string; regex: RegExp }> = [
  {
    type: "email",
    regex: /\b[\w.+%-]+@[\w-]+\.[a-z]{2,}\b/gi,
  },
  {
    type: "dutch_iban",
    regex: /\bNL\d{2}[A-Z]{4}\d{10}\b/g,
  },
  {
    type: "iban",
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g,
  },
  {
    type: "phone",
    // NL mobile/landline, international E.164, US format
    regex: /(\+31|0031|0)[0-9()\s\-.]{8,14}|\+[1-9]\d{7,14}/g,
  },
  {
    type: "ip_address",
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  },
];

// BSN pattern — 9 consecutive digits (validated with Elfproef below)
const BSN_RAW = /\b\d{9}\b/g;

// Credit card pattern — 13–16 digits with optional spaces/dashes
const CC_RAW = /\b(?:\d[ -]?){13,16}\b/g;

// ── Elfproef (Dutch 11-check for BSN) ────────────────────────────────────────

function isValidBsn(digits: string): boolean {
  if (digits.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const d = Number(digits[i]);
    sum += (i < 8 ? 9 - i : -1) * d;
  }
  return sum % 11 === 0;
}

// ── Luhn check for credit cards ───────────────────────────────────────────────

function isValidLuhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// ── NER via compromise (optional) ─────────────────────────────────────────────

let nlpModule: {
  default: (text: string) => { people(): { out(format: string): string[] } };
} | null = null;

async function loadNlp(): Promise<typeof nlpModule> {
  if (nlpModule !== null) return nlpModule;
  try {
    nlpModule = (await import("compromise")) as typeof nlpModule;
    return nlpModule;
  } catch {
    return null;
  }
}

// ── Scanner ───────────────────────────────────────────────────────────────────

export class PIIScanner {
  /**
   * Scan text for PII. Returns metadata only — no raw matches are stored.
   * Safe to call on any text including large payloads.
   */
  async scan(text: string): Promise<PIIScanResult> {
    const counts: Record<string, number> = {};

    // Regex-based patterns
    for (const { type, regex } of PATTERNS) {
      const matches = text.match(new RegExp(regex.source, regex.flags));
      if (matches && matches.length > 0) {
        counts[type] = (counts[type] ?? 0) + matches.length;
      }
    }

    // BSN — 9-digit with Elfproef
    const bsnMatches = text.match(new RegExp(BSN_RAW.source, BSN_RAW.flags)) ?? [];
    const validBsn = bsnMatches.filter((m) => isValidBsn(m.replace(/\s/g, "")));
    if (validBsn.length > 0) {
      counts["bsn"] = validBsn.length;
    }

    // Credit cards — Luhn validated
    const ccMatches = text.match(new RegExp(CC_RAW.source, CC_RAW.flags)) ?? [];
    const validCc = ccMatches
      .map((m) => m.replace(/[ -]/g, ""))
      .filter((m) => m.length >= 13 && m.length <= 16 && isValidLuhn(m));
    if (validCc.length > 0) {
      counts["credit_card"] = validCc.length;
    }

    // NER — person names via compromise
    try {
      const nlp = await loadNlp();
      if (nlp) {
        const doc = nlp.default(text);
        const people = doc.people().out("array") as string[];
        if (people.length > 0) {
          counts["person_name"] = people.length;
        }
      }
    } catch {
      // NER is best-effort — never block on failure
    }

    const typesFound = Object.keys(counts);
    return {
      containsPii: typesFound.length > 0,
      typesFound,
      counts,
    };
  }

  /** Synchronous scan (regex-only, no NER). Use for hot paths where await is not available. */
  scanSync(text: string): PIIScanResult {
    const counts: Record<string, number> = {};

    for (const { type, regex } of PATTERNS) {
      const matches = text.match(new RegExp(regex.source, regex.flags));
      if (matches && matches.length > 0) {
        counts[type] = matches.length;
      }
    }

    const bsnMatches = text.match(new RegExp(BSN_RAW.source, BSN_RAW.flags)) ?? [];
    const validBsn = bsnMatches.filter((m) => isValidBsn(m));
    if (validBsn.length > 0) counts["bsn"] = validBsn.length;

    const ccMatches = text.match(new RegExp(CC_RAW.source, CC_RAW.flags)) ?? [];
    const validCc = ccMatches
      .map((m) => m.replace(/[ -]/g, ""))
      .filter((m) => m.length >= 13 && m.length <= 16 && isValidLuhn(m));
    if (validCc.length > 0) counts["credit_card"] = validCc.length;

    const typesFound = Object.keys(counts);
    return { containsPii: typesFound.length > 0, typesFound, counts };
  }
}
