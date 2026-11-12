import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { MessageSignal } from "@/lib/agent/types";
import { countryName, formatDate } from "@/lib/claims";
import { getAnalysis, getCaseFile, getDispute, getDisputeRaw, getOutcome, listEvents, listEvidence, listSubmissions } from "@/lib/db/repo";
import { allowedActions, type Dispute } from "@/lib/paypal/disputes";
import { OUTCOME_LABEL } from "@/lib/submit/outcomes";
import { ClaimTag, StatePill, money, timeLeft } from "../../ui";
import { describeAction } from "@/lib/case/approval";
import { collectEvidenceAction, redraftAction, runAgentAction } from "./actions";
import { ApprovalPanel, type SubmissionView } from "./approval-panel";
import { SandboxPanel } from "./sandbox-panel";
import { CheckForm } from "./check-form";
import { CitedText } from "./cited-text";
import { SubmitButton } from "./submit-button";

const BAND_TITLE = { CONTEST: "Contest", OFFER: "Offer a partial refund", ACCEPT: "Accept the claim" } as const;

const SIGNAL_LABEL: Record<MessageSignal, string> = {
  BUYER_CONFIRMS_RECEIPT: "Buyer confirms receipt",
  BUYER_ACCEPTS_ITEM: "Buyer accepts the item",
  BUYER_REPORTS_PROBLEM: "Buyer reports a problem",
  BUYER_REQUESTS_REFUND: "Buyer asks for a refund",
  SELLER_ADMITS_FAULT: "Seller admits a fault",
  SELLER_OFFERS_HELP: "Seller offers help",
};

const WANTS_LABEL: Record<string, string> = {
  full_refund: "Full refund",
  partial_refund: "Partial refund",
  replacement: "Replacement",
  item_delivery: "The item delivered",
  information: "Information",
  unclear: "Not clear",
};

const TOOL_LABEL: Record<string, string> = {
  get_payment: "Payment record",
  get_order: "Order",
  get_tracking: "Tracking and delivery",
  get_listing: "Listing",
  get_photos: "Photos",
  get_messages: "Messages",
  get_policy: "Shop policy",
  check_paypal_status: "PayPal dispute status",
  safety_net: "Safety net (rules)",
  rules: "Fixed rules (AI unavailable)",
};

/** Turns [MSG-001]-style IDs in a list into links to the evidence record. */
function Cites({ ids }: { ids: string[] }) {
  return (
    <>
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && ", "}
          <a href={`#${id}`} className="cite">
            {id}
          </a>
        </span>
      ))}
    </>
  );
}

export default async function DisputePage(props: PageProps<"/disputes/[id]">) {
  await connection();
  const { id } = await props.params;
  const d = getDispute(decodeURIComponent(id));
  if (!d) notFound();
  const evidence = listEvidence(d.id);
  const events = listEvents(d.id);
  const analysis = getAnalysis(d.id);
  const file = getCaseFile(d.id);
  const t = timeLeft(d.sellerDueAt);
  const photoPath = (eid: string) => String(evidence.find((e) => e.id === eid)?.facts.path ?? "");
  const lastSub = listSubmissions(d.id).at(-1) ?? null;
  const submission: SubmissionView | null = lastSub
    ? { at: lastSub.at, ok: lastSub.ok, mode: lastSub.mode, action: lastSub.action, requestId: lastSub.requestId, error: lastSub.error, paypalStatusAfter: lastSub.paypalStatusAfter, request: lastSub.request }
    : null;
  const outcomeRec = getOutcome(d.id);
  const outcome = outcomeRec ? { label: OUTCOME_LABEL[outcomeRec.kind], code: outcomeRec.code, kind: outcomeRec.kind, demo: outcomeRec.demo } : null;
  const raw = d.source === "paypal" ? getDisputeRaw<Dispute>(d.id) : null;

  return (
    <main>
      <p>
        <Link href="/">← Dispute inbox</Link>
      </p>
      <header className="stack">
        <h1>
          {d.itemName || d.id} <span className="muted">{money(d.amount, d.currency)}</span>
        </h1>
        <div className="row">
          <code>{d.id}</code>
          <ClaimTag type={d.claimType} />
          <StatePill state={d.state} />
          {d.state !== "RESOLVED" && <span className={t.urgent ? "no" : "muted"}>{t.label}</span>}
        </div>
        {d.buyerClaim && (
          <blockquote>
            &ldquo;{d.buyerClaim}&rdquo;
            <span className="muted">
              {" "}
              {d.buyerName || "Buyer"}
              {d.buyerCountry ? `, ${countryName(d.buyerCountry)}` : ""}
            </span>
          </blockquote>
        )}
      </header>

      {file && (
        <section className={`panel stack band band-${file.score.band.toLowerCase()}`}>
          <div className="row spread">
            <div className="stack tight">
              <span className="eyebrow">Agent recommendation</span>
              <h2 className="band-title">
                {BAND_TITLE[file.score.band]}
                {file.score.offer && (
                  <>
                    {" "}
                    {money(file.score.offer.amount, file.score.offer.currency)} ({file.score.offer.percent}%)
                  </>
                )}
              </h2>
            </div>
            <div className="score" aria-label={`Case score ${file.score.score} out of 100`}>
              <span className="score-num">{file.score.score}</span>
              <span className="muted small">/ 100</span>
            </div>
          </div>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${file.score.score}%` }} />
            <i style={{ left: "40%" }} />
            <i style={{ left: "70%" }} />
          </div>
          <p className="muted small">Under 40: accept · 40 to 69: offer a partial refund · 70 or more: contest. Scored by fixed rules, not AI.</p>
          <table className="rules">
            <tbody>
              {file.score.rules.map((r) => (
                <tr key={r.id} className={r.met ? "met" : "unmet"}>
                  <td className="num">{r.met ? (r.points > 0 ? `+${r.points}` : r.points) : "–"}</td>
                  <td>{r.label}</td>
                  <td>{r.cites.length > 0 && <CitedText text={`[${r.cites.join(", ")}]`} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {file.score.advice.length > 0 && (
            <p className="small">
              <strong>Tip for next time:</strong> {file.score.advice.join(" ")}
            </p>
          )}
        </section>
      )}

      {file && (
        <section className="panel stack">
          <div className="row spread">
            <h2>Draft {file.draft.audience === "buyer" ? "message to the buyer" : "response to PayPal"}</h2>
            <form action={redraftAction}>
              <input type="hidden" name="id" value={d.id} />
              <SubmitButton label="Redo score and draft" pendingLabel="Drafting…" secondary />
            </form>
          </div>
          <p className="draft">
            <CitedText text={file.draft.text} />
          </p>
          <p className={file.draft.check.ok ? "yes small" : "no small"}>
            {file.draft.check.ok
              ? `✓ Citation check passed: ${file.draft.check.sentences} sentences, every fact cites a real record and its dates and numbers match.`
              : `✗ Citation check failed: ${file.draft.check.problems.length} problem(s).`}
          </p>
          <p className="muted small">
            {file.draft.evidenceType && <>PayPal evidence type: {file.draft.evidenceType} · </>}
            {file.draft.model.startsWith("template")
              ? "AI drafting was unavailable, so a fixed template wrote this from the evidence · "
              : file.draft.attempts > 1
                ? `${file.draft.attempts} drafts written before one passed · `
                : ""}
            {file.draft.removed.length > 0 ? `${file.draft.removed.length} unprovable sentence(s) removed · ` : ""}
            Written by {file.draft.model} · Nothing has been sent to PayPal.
          </p>
          <p>
            <a href={`/api/disputes/${encodeURIComponent(d.id)}/packet`} target="_blank" rel="noopener">
              View the evidence PDF
            </a>{" "}
            <span className="muted small">
              {file.score.band === "CONTEST"
                ? "This is the file sent to PayPal with the response."
                : "For your records; offers and acceptances don't need an evidence file."}
            </span>
          </p>
          <details>
            <summary>Edit and check</summary>
            <CheckForm key={file.updatedAt} disputeId={d.id} initialText={file.draft.text} />
          </details>
        </section>
      )}

      {file && (
        <section className={`panel stack decision ${d.state === "AWAITING_APPROVAL" ? "decision-open" : ""}`}>
          <h2>Your decision</h2>
          <ApprovalPanel
            key={`${d.state}-${submission?.at ?? ""}`}
            disputeId={d.id}
            state={d.state}
            action={describeAction(file)}
            draftOk={file.draft.check.ok}
            approvedAt={file.approval?.at ?? null}
            source={d.source}
            submission={submission}
            outcome={outcome}
          />
        </section>
      )}

      <section className="panel stack sandbox">
        <h2>{d.source === "paypal" ? "PayPal sandbox" : "Demo controls"}</h2>
        <SandboxPanel
          key={`${d.state}-${d.paypalStatus}`}
          disputeId={d.id}
          source={d.source}
          paypalStatus={d.paypalStatus}
          allowed={raw ? allowedActions(raw) : []}
          submitted={d.state === "SUBMITTED"}
          resolved={d.state === "RESOLVED"}
        />
      </section>

      <section className="panel stack">
        <div className="row spread">
          <h2>AI agent</h2>
          <form action={runAgentAction}>
            <input type="hidden" name="id" value={d.id} />
            <SubmitButton
              label={analysis ? "Run the agent again" : "Run the agent"}
              pendingLabel="Agent working… (can take 1–2 minutes on the free tier)"
            />
          </form>
        </div>

        {!analysis ? (
          <p className="muted">
            The agent reads the claim, decides which records it needs, fetches them, reads the messages and compares
            photos. Nothing is sent to PayPal.
          </p>
        ) : (
          <>
            {analysis.summary && (
              <div className="summary">
                <p className="lead">{analysis.summary.summary}</p>
                <p className="muted small">
                  Buyer wants: {WANTS_LABEL[analysis.summary.buyerWants] ?? analysis.summary.buyerWants} · Key question:{" "}
                  {analysis.summary.keyQuestion}
                </p>
              </div>
            )}

            <div>
              <h3>What the agent fetched</h3>
              <ol className="steps">
                {analysis.steps.map((s) => (
                  <li key={s.step}>
                    <strong>{TOOL_LABEL[s.tool] ?? s.tool}</strong>
                    {s.saved.length > 0 && (
                      <>
                        {" "}
                        → <Cites ids={s.saved} />
                      </>
                    )}
                    {typeof s.input.why === "string" && <span className="muted"> · {s.input.why}</span>}
                    {s.missing.map((m) => (
                      <div key={m} className="no small">
                        Missing: {m}
                      </div>
                    ))}
                  </li>
                ))}
              </ol>
              {analysis.gatheringNote && <p className="muted small">Agent&apos;s note: {analysis.gatheringNote}</p>}
            </div>

            <div>
              <h3>What the messages say</h3>
              {analysis.messageFindings.length === 0 ? (
                <p className="muted">No statements that affect the dispute.</p>
              ) : (
                <ul className="findings">
                  {analysis.messageFindings.map((f, i) => (
                    <li key={i}>
                      <span className={`signal signal-${f.signal.startsWith("BUYER_CONFIRMS") || f.signal === "BUYER_ACCEPTS_ITEM" ? "good" : f.signal === "SELLER_ADMITS_FAULT" ? "bad" : "neutral"}`}>
                        {SIGNAL_LABEL[f.signal]}
                      </span>{" "}
                      &ldquo;{f.quote}&rdquo; <Cites ids={[f.evidenceId]} />
                      <div className="muted small">{f.explanation}</div>
                    </li>
                  ))}
                </ul>
              )}
              {analysis.rejectedFindings > 0 && (
                <p className="muted small">
                  {analysis.rejectedFindings} finding(s) were dropped because the quote did not match the message word for word.
                </p>
              )}
            </div>

            {analysis.photoFinding && (
              <div>
                <h3>Photo comparison</h3>
                <div className="photos">
                  {analysis.photoFinding.citedIds.map((pid) => (
                    <figure key={pid}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/${photoPath(pid)}`} alt={`Photo ${pid}`} width={160} height={160} />
                      <figcaption>
                        <a href={`#${pid}`} className="cite">
                          {pid}
                        </a>
                      </figcaption>
                    </figure>
                  ))}
                </div>
                <p>
                  <span className={`signal signal-${analysis.photoFinding.verdict === "consistent" ? "good" : analysis.photoFinding.verdict === "inconsistent" ? "bad" : "neutral"}`}>
                    {analysis.photoFinding.attribute}: {analysis.photoFinding.verdict}
                  </span>{" "}
                  <span className="muted">confidence {Math.round(analysis.photoFinding.confidence * 100)}%</span>
                </p>
                <ul className="plain small">
                  <li>Seller&apos;s photo: {analysis.photoFinding.listingShows}</li>
                  <li>Buyer&apos;s photo: {analysis.photoFinding.buyerPhotoShows}</li>
                  <li>Why they may differ: {analysis.photoFinding.factors}</li>
                </ul>
              </div>
            )}

            <p className="muted small">
              Models: {Object.entries(analysis.models).map(([k, v]) => `${k} ${v}`).join(" · ")} · Updated{" "}
              {new Date(analysis.updatedAt).toLocaleString()}
            </p>
          </>
        )}
      </section>

      <section className="panel">
        <div className="row spread">
          <h2>Evidence ({evidence.length})</h2>
          <form action={collectEvidenceAction}>
            <input type="hidden" name="id" value={d.id} />
            <SubmitButton label={evidence.length ? "Collect again" : "Collect evidence"} pendingLabel="Collecting…" secondary />
          </form>
        </div>
        {evidence.length === 0 ? (
          <p className="muted">Nothing collected yet. Run the agent, or collect everything with fixed rules.</p>
        ) : (
          <ul className="evidence">
            {evidence.map((e) => (
              <li key={e.id} id={e.id}>
                <code className="cite">{e.id}</code>
                <div>
                  <p>{e.text}</p>
                  {e.kind === "photo" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="thumb" src={`/${String(e.facts.path)}`} alt={e.title} width={96} height={96} />
                  )}
                  <p className="muted small">{e.source}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Timeline</h2>
        <ul className="timeline">
          {events.map((ev) => (
            <li key={ev.id}>
              <span className="muted small">{formatDate(ev.at)}</span> <strong>{ev.type}</strong>{" "}
              <span>{ev.detail}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
