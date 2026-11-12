import { getDb } from "./index";
import type { Analysis } from "../agent/types";
import type { CaseFile } from "../case/types";
import type { Outcome, Submission } from "../submit/types";
import { insertEvent, toDispute, toEvent, toEvidence, upsertDisputeRow } from "./rows";
import {
  EVIDENCE_PREFIX,
  type DisputeRow,
  type EvidenceKind,
  type EvidenceRecord,
  type Facts,
  type TimelineEvent,
  type WorkflowState,
} from "../types";

// ---------- disputes ----------

export function listDisputes(): (DisputeRow & { evidenceCount: number })[] {
  const rows = getDb()
    .prepare(
      `SELECT d.*, (SELECT COUNT(*) FROM evidence e WHERE e.dispute_id = d.id) AS evidence_count
       FROM disputes d
       ORDER BY CASE WHEN d.state IN ('RESOLVED','MANUAL') THEN 1 ELSE 0 END, d.seller_due_at IS NULL, d.seller_due_at`,
    )
    .all() as (Parameters<typeof toDispute>[0] & { evidence_count: number })[];
  return rows.map((r) => ({ ...toDispute(r), evidenceCount: r.evidence_count }));
}

export function getDispute(id: string): DisputeRow | null {
  const row = getDb().prepare("SELECT * FROM disputes WHERE id = ?").get(id) as
    | Parameters<typeof toDispute>[0]
    | undefined;
  return row ? toDispute(row) : null;
}

/** The raw PayPal dispute JSON, for PayPal-sourced disputes. */
export function getDisputeRaw<T = unknown>(id: string): T | null {
  const row = getDb().prepare("SELECT raw FROM disputes WHERE id = ?").get(id) as { raw: string | null } | undefined;
  return row?.raw ? (JSON.parse(row.raw) as T) : null;
}

export function saveDispute(d: Omit<DisputeRow, "updatedAt">, raw?: unknown) {
  upsertDisputeRow(getDb(), d, raw);
}

export function setState(id: string, state: WorkflowState, detail = "") {
  const db = getDb();
  db.prepare("UPDATE disputes SET state = ?, updated_at = ? WHERE id = ?").run(state, new Date().toISOString(), id);
  insertEvent(db, id, `state:${state}`, detail);
}

// ---------- timeline ----------

export function addEvent(disputeId: string, type: string, detail = "") {
  insertEvent(getDb(), disputeId, type, detail);
}

export function listEvents(disputeId: string): TimelineEvent[] {
  return (
    getDb().prepare("SELECT * FROM events WHERE dispute_id = ? ORDER BY id").all(disputeId) as Parameters<
      typeof toEvent
    >[0][]
  ).map(toEvent);
}

// ---------- AI analysis ----------

export function getAnalysis(disputeId: string): Analysis | null {
  const row = getDb().prepare("SELECT data FROM analysis WHERE dispute_id = ?").get(disputeId) as
    | { data: string }
    | undefined;
  return row ? (JSON.parse(row.data) as Analysis) : null;
}

export function saveAnalysis(a: Analysis) {
  getDb()
    .prepare(
      `INSERT INTO analysis (dispute_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(dispute_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
    .run(a.disputeId, JSON.stringify(a), a.updatedAt);
}

// ---------- submissions and outcomes ----------

export function addSubmission(s: Submission) {
  getDb().prepare("INSERT INTO submissions (dispute_id, at, data) VALUES (?, ?, ?)").run(s.disputeId, s.at, JSON.stringify(s));
}

export function listSubmissions(disputeId: string): Submission[] {
  return (getDb().prepare("SELECT data FROM submissions WHERE dispute_id = ? ORDER BY id").all(disputeId) as { data: string }[]).map(
    (r) => JSON.parse(r.data) as Submission,
  );
}

export function getOutcome(disputeId: string): Outcome | null {
  const row = getDb().prepare("SELECT data FROM outcomes WHERE dispute_id = ?").get(disputeId) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as Outcome) : null;
}

export function saveOutcome(o: Outcome) {
  getDb()
    .prepare(
      `INSERT INTO outcomes (dispute_id, at, data) VALUES (?, ?, ?)
       ON CONFLICT(dispute_id) DO UPDATE SET at = excluded.at, data = excluded.data`,
    )
    .run(o.disputeId, o.at, JSON.stringify(o));
}

export function listOutcomes(): Outcome[] {
  return (getDb().prepare("SELECT data FROM outcomes ORDER BY at").all() as { data: string }[]).map((r) => JSON.parse(r.data) as Outcome);
}

// ---------- case file: score + draft ----------

export function getCaseFile(disputeId: string): CaseFile | null {
  const row = getDb().prepare("SELECT data FROM case_files WHERE dispute_id = ?").get(disputeId) as
    | { data: string }
    | undefined;
  return row ? (JSON.parse(row.data) as CaseFile) : null;
}

export function saveCaseFile(c: CaseFile) {
  getDb()
    .prepare(
      `INSERT INTO case_files (dispute_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(dispute_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
    .run(c.disputeId, JSON.stringify(c), c.updatedAt);
}

/** Recommendation per dispute, for the list page. */
export function listCaseSummaries(): Record<string, { score: number; band: string }> {
  const rows = getDb().prepare("SELECT dispute_id, data FROM case_files").all() as { dispute_id: string; data: string }[];
  return Object.fromEntries(
    rows.map((r) => {
      const c = JSON.parse(r.data) as CaseFile;
      return [r.dispute_id, { score: c.score.score, band: c.score.band }];
    }),
  );
}

// ---------- evidence ----------

export type NewEvidence = {
  disputeId: string;
  kind: EvidenceKind;
  sourceRef: string;
  source: string;
  title: string;
  text: string;
  facts: Facts;
};

/**
 * Saves an evidence record. A record with the same sourceRef keeps its ID
 * (so citations like [TRK-001] stay valid); a new one gets the next number.
 */
export function upsertEvidence(e: NewEvidence): EvidenceRecord {
  const db = getDb();
  const now = new Date().toISOString();
  const tx = db.transaction((): string => {
    const existing = db
      .prepare("SELECT id FROM evidence WHERE dispute_id = ? AND source_ref = ?")
      .get(e.disputeId, e.sourceRef) as { id: string } | undefined;
    if (existing) {
      db.prepare(
        `UPDATE evidence SET kind = ?, source = ?, title = ?, text = ?, facts = ?, collected_at = ?
         WHERE dispute_id = ? AND id = ?`,
      ).run(e.kind, e.source, e.title, e.text, JSON.stringify(e.facts), now, e.disputeId, existing.id);
      return existing.id;
    }
    const prefix = EVIDENCE_PREFIX[e.kind];
    const ids = db
      .prepare("SELECT id FROM evidence WHERE dispute_id = ? AND id LIKE ?")
      .all(e.disputeId, `${prefix}-%`) as { id: string }[];
    const next = ids.reduce((max, r) => Math.max(max, Number(r.id.split("-")[1]) || 0), 0) + 1;
    const id = `${prefix}-${String(next).padStart(3, "0")}`;
    db.prepare(
      `INSERT INTO evidence (dispute_id, id, kind, source_ref, source, title, text, facts, collected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(e.disputeId, id, e.kind, e.sourceRef, e.source, e.title, e.text, JSON.stringify(e.facts), now);
    return id;
  });
  const id = tx();
  return getEvidence(e.disputeId, id)!;
}

export function listEvidence(disputeId: string): EvidenceRecord[] {
  return (
    getDb()
      .prepare(
        `SELECT * FROM evidence WHERE dispute_id = ?
         ORDER BY CASE kind WHEN 'payment' THEN 1 WHEN 'order' THEN 2 WHEN 'tracking' THEN 3 WHEN 'delivery' THEN 4
           WHEN 'listing' THEN 5 WHEN 'photo' THEN 6 WHEN 'message' THEN 7 ELSE 8 END, id`,
      )
      .all(disputeId) as Parameters<typeof toEvidence>[0][]
  ).map(toEvidence);
}

export function getEvidence(disputeId: string, evidenceId: string): EvidenceRecord | null {
  const row = getDb().prepare("SELECT * FROM evidence WHERE dispute_id = ? AND id = ?").get(disputeId, evidenceId) as
    | Parameters<typeof toEvidence>[0]
    | undefined;
  return row ? toEvidence(row) : null;
}
