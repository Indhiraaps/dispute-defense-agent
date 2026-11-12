import { connection } from "next/server";
import { inboxData } from "@/lib/dashboard";
import { recentWebhookEvents } from "@/lib/events";
import { listOutcomes } from "@/lib/db/repo";
import { playbook } from "@/lib/submit/outcomes";
import { Inbox } from "./inbox";

const EVIDENCE_LABEL: Record<string, string> = {
  payment: "Payment record",
  order: "Order",
  tracking: "Tracking",
  delivery: "Delivery confirmation",
  listing: "Listing",
  photo: "Photos",
  message: "Buyer messages",
  policy: "Shop policy",
};

const SETTINGS = [
  { name: "PAYPAL_CLIENT_ID", what: "PayPal sandbox client ID" },
  { name: "PAYPAL_CLIENT_SECRET", what: "PayPal sandbox secret" },
  { name: "PAYPAL_WEBHOOK_ID", what: "PayPal webhook ID (to verify webhooks)" },
  { name: "GEMINI_API_KEY", what: "Gemini free-tier API key" },
];

export default async function Home() {
  await connection(); // read the database and settings at request time
  const { rows, kpis } = inboxData();
  const events = await recentWebhookEvents(10);
  const book = playbook();
  const demoOutcomes = listOutcomes().filter((o) => o.demo && o.action === "provide_evidence").length;

  return (
    <main className="wide">
      <header className="page-head">
        <div className="stack tight">
          <span className="eyebrow">Resolution Center</span>
          <h1>Disputes</h1>
          <p className="muted">
            The agent gathers the evidence, scores every case and drafts a cited response. You decide what is sent to PayPal.
          </p>
        </div>
      </header>

      <Inbox initialRows={rows} initialKpis={kpis} />

      {book.byEvidence.length > 0 && (
        <section className="panel stack">
          <h2>What evidence wins</h2>
          <p className="muted small">
            From disputes you contested and PayPal decided. Measured results only; a few cases are not a trend.
            {demoOutcomes > 0 && ` Includes ${demoOutcomes} simulated demo decision${demoOutcomes > 1 ? "s" : ""}.`}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Evidence used</th>
                  <th>Won</th>
                  <th>Contested</th>
                </tr>
              </thead>
              <tbody>
                {book.byEvidence.map((r) => (
                  <tr key={r.kind}>
                    <td>{EVIDENCE_LABEL[r.kind] ?? r.kind}</td>
                    <td className="num">{r.won}</td>
                    <td className="num">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <details className="panel">
        <summary>System status</summary>
        <div className="stack">
          <ul className="checks">
            {SETTINGS.map((s) => (
              <li key={s.name}>
                <span className={process.env[s.name] ? "yes" : "no"}>{process.env[s.name] ? "Set" : "Missing"}</span> {s.what}{" "}
                <code className="muted">{s.name}</code>
              </li>
            ))}
          </ul>
          <h3>Webhook events received</h3>
          {events.length === 0 ? (
            <p className="muted">
              None yet. Point the sandbox app&apos;s webhook at <code>&lt;public URL&gt;/api/webhooks/paypal</code>.
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Received</th>
                    <th>Event</th>
                    <th>Resource</th>
                    <th>Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={`${e.event.id}-${e.receivedAt}`}>
                      <td>{new Date(e.receivedAt).toLocaleString()}</td>
                      <td>{e.event.event_type}</td>
                      <td>
                        <code>{String(e.event.resource?.dispute_id ?? e.event.resource?.id ?? "-")}</code>
                      </td>
                      <td className={e.verified ? "yes" : "no"}>{e.verified ? "Yes" : "Skipped"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
    </main>
  );
}
