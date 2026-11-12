import type { EvidenceRecord } from "../types";
import type { CheckProblem, CheckResult } from "./types";

/**
 * Step 6: the grounding check. Plain code, no AI. A draft passes only if:
 *   1. every sentence cites at least one evidence ID, like [TRK-001]
 *      (short courtesy lines with no facts, like "Thank you.", are allowed),
 *   2. every cited ID exists for this dispute,
 *   3. every date, number and ID in a sentence appears in the records it cites.
 * This is what stops a sentence like "The buyer is a known scammer." from
 * ever reaching PayPal: there is no record to cite for it.
 */

const CITE_GROUP = /\[\s*([A-Z]{3}-\d{3}(?:\s*,\s*[A-Z]{3}-\d{3})*)\s*\]/g;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const DATE_PATTERNS = [
  new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}(?:,?\\s+(\\d{4}))?`, "gi"), // 4 Nov 2026
  new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, "gi"), // Nov 4, 2026
  /\b(\d{4})-(\d{2})-(\d{2})\b/g, // 2026-11-04
];
const COURTESY = /^(thank you|thanks|we('re| are) sorry|sorry|we apologi[sz]e|kind regards|best regards|hello|hi|dear)\b/i;

type DateKey = { month: number; day: number; year: number | null };

/** Finds dates in text and returns them with their positions, so they can be removed before number checks. */
function findDates(text: string): { key: DateKey; start: number; end: number }[] {
  const out: { key: DateKey; start: number; end: number }[] = [];
  const taken = (s: number, e: number) => out.some((o) => s < o.end && e > o.start);
  DATE_PATTERNS.forEach((re, i) => {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (taken(start, end)) continue;
      let key: DateKey;
      if (i === 0) key = { day: +m[1], month: MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, year: m[3] ? +m[3] : null };
      else if (i === 1) key = { month: MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, day: +m[2], year: m[3] ? +m[3] : null };
      else key = { year: +m[1], month: +m[2], day: +m[3] };
      if (key.month >= 1 && key.day >= 1 && key.day <= 31) out.push({ key, start, end });
    }
  });
  return out;
}

/** Splits a draft into sentences. A citation written after the full stop stays with its sentence. */
export function splitSentences(text: string): string[] {
  // Split after . ! ? followed by a space, but never inside double quotes,
  // so a quoted message like "Got it, love it! The colours..." stays whole.
  const src = text.replace(/\s+/g, " ").trim();
  const parts: string[] = [];
  let inQuote = false;
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const closesQuote = (c === '"' && inQuote) || c === "”";
    if (c === '"') inQuote = !inQuote;
    else if (c === "“") inQuote = true;
    else if (c === "”") inQuote = false;
    // A quote that ends a sentence: ...wrote "Got it, thanks." [MSG-001] Next sentence.
    if (closesQuote && /[.!?]/.test(src[i - 1] ?? "")) {
      const rest = src.slice(i + 1);
      const m = rest.match(/^((?:\s*\[[^\]]*\])*)\s+(?=["“A-Z0-9])/);
      if (m) {
        const end = i + 1 + m[1].length;
        parts.push(src.slice(start, end).trim());
        start = end + 1;
        i = end;
        continue;
      }
    }
    if (!inQuote && /[.!?]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /["”’']/.test(src[j])) j++;
      if (src[j] === " " && /[\["“A-Z0-9]/.test(src[j + 1] ?? "")) {
        parts.push(src.slice(start, j).trim());
        start = j + 1;
        i = j;
      }
    }
  }
  if (start < src.length) parts.push(src.slice(start).trim());
  const out: string[] = [];
  for (const p of parts) {
    // Citations at the start of a piece belong to the sentence before it: "...USD. [PAY-001] Next sentence."
    const lead = p.match(/^((?:\[[^\]]*\]\s*)+)(.*)$/);
    if (lead && out.length) {
      out[out.length - 1] += ` ${lead[1].trim()}`;
      const rest = lead[2].replace(/^[.!?]\s*/, "").trim();
      if (rest) out.push(rest);
    } else if (p) out.push(p);
  }
  return out;
}

export function citesIn(sentence: string): string[] {
  const ids: string[] = [];
  for (const m of sentence.matchAll(CITE_GROUP)) ids.push(...m[1].split(/\s*,\s*/));
  return [...new Set(ids)];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function checkDraft(
  text: string,
  evidence: EvidenceRecord[],
  opts: { allowedTokens?: string[]; maxWords?: number } = {},
): CheckResult {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const sentences = splitSentences(text);
  const problems: CheckProblem[] = [];
  const allowed = (opts.allowedTokens ?? []).map((t) => t.toLowerCase());

  if (opts.maxWords) {
    const words = text.replace(CITE_GROUP, "").split(/\s+/).filter(Boolean).length;
    if (words > opts.maxWords) problems.push({ sentence: 0, text: "", issue: `Too long: ${words} words (limit ${opts.maxWords})` });
  }
  if (sentences.length === 0) problems.push({ sentence: 0, text: "", issue: "The draft is empty" });

  sentences.forEach((s, i) => {
    const n = i + 1;
    const cites = citesIn(s);
    const body = s.replace(CITE_GROUP, " ").replace(/\s+/g, " ").trim();
    const fail = (issue: string) => problems.push({ sentence: n, text: s, issue });

    if (cites.length === 0) {
      const isCourtesy = COURTESY.test(body) && !/\d/.test(body) && body.split(" ").length <= 14;
      if (!isCourtesy) fail("States something without citing any evidence record");
      return;
    }
    const unknown = cites.filter((id) => !byId.has(id));
    if (unknown.length) fail(`Cites ${unknown.join(", ")}, which ${unknown.length > 1 ? "are" : "is"} not in the evidence`);
    const cited = cites.map((id) => byId.get(id)).filter((e): e is EvidenceRecord => !!e);
    if (cited.length === 0) return;

    const hay = cited
      .map((e) => `${e.text} ${Object.values(e.facts).filter((v) => v !== null).join(" ")}`)
      .join(" ")
      .toLowerCase();
    const hayDates = findDates(hay).map((d) => d.key);

    // Dates must match a date in the cited records (day and month, and year if given).
    const dates = findDates(body);
    for (const d of dates) {
      const found = hayDates.some((h) => h.month === d.key.month && h.day === d.key.day && (d.key.year === null || h.year === null || h.year === d.key.year));
      if (!found) fail(`Date "${body.slice(d.start, d.end)}" is not in ${cites.join(", ")}`);
    }

    // Every other number or ID (amounts, tracking numbers, postcodes, counts) must appear in the cited records.
    let rest = body;
    for (const d of [...dates].sort((a, b) => b.start - a.start)) rest = rest.slice(0, d.start) + " " + rest.slice(d.end);
    const tokens = rest.match(/[A-Za-z0-9]*\d[A-Za-z0-9]*(?:[.,]\d+)*/g) ?? [];
    for (const raw of tokens) {
      const t = raw.toLowerCase();
      if (allowed.includes(t)) continue;
      const re = new RegExp(`(^|[^a-z0-9])${escapeRe(t)}([^a-z0-9]|$)`);
      if (!re.test(hay)) fail(`"${raw}" does not appear in ${cites.join(", ")}`);
    }
  });

  return { ok: problems.length === 0, sentences: sentences.length, problems };
}
