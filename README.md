# Dispute Defense Agent

An AI agent that helps small PayPal sellers decide whether to fight a buyer dispute, then builds a cited evidence packet and submits it once the seller approves. PayPal sandbox only. Every tool in the stack is free.

## Build status

| Phase | What | Status |
|---|---|---|
| 0 | Sandbox spike: test the three unknowns | **Scripts ready; run them (below)** |
| 1 | Project setup, PayPal client, webhook receiver | Done |
| 2 | Evidence store (SQLite) and demo disputes | Done |
| 3 | AI agent (Gemini + Vercel AI SDK) | Done |
| 4 | Scorer, cited drafter, citation checker | Done |
| 5 | PDF evidence packet | Done |
| 6 | Seller dashboard (AG Grid Community) | Done |
| 7 | Submit to PayPal and track outcomes | Done |
| 8 | Deploy to Render | Done: https://dispute-defense-agent.onrender.com (password protected; see [DEPLOY.md](DEPLOY.md)) |
| 9 | README, Devpost, demo video | Next |

## Setup

Needs Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

1. **PayPal sandbox app:** at [developer.paypal.com](https://developer.paypal.com), open Apps & Credentials, switch to **Sandbox**, and create an app. Copy its client ID and secret. In the app's features, make sure **Disputes** is enabled.
2. **Sandbox accounts:** under Testing Tools > Sandbox Accounts you need one **Business** account (the seller, linked to your app) and one **Personal** account (the buyer). PayPal creates one of each by default.
3. **Gemini key:** at [aistudio.google.com](https://aistudio.google.com), choose Get API key. The free tier is enough. Check the current free Flash model name and set `GEMINI_MODEL`.
4. **Webhook ID:** can wait until you set up the tunnel (below).

## Phase 0: test the sandbox first

These five scripts answer the questions the whole demo depends on. Every response is saved in `spike-results/`.

**1. Check the keys**

```bash
npm run spike:keys
```

**2. Make a test payment** (opens nothing; it prints a link to approve as the sandbox *buyer*)

```bash
npm run spike:payment -- 120.00 "Hand-block printed scarf"
```

Then log in to [sandbox.paypal.com](https://www.sandbox.paypal.com) as the **personal buyer** account and open a dispute on that payment in the Resolution Center. Make **3 or 4** payments and disputes, because each test below uses one up.

**3. Look at the disputes and what PayPal allows on each**

```bash
npm run spike:inspect
```

```bash
npm run spike:inspect -- PP-D-XXXXX
```

**4. Test the evidence upload** (unknown #1)

```bash
npm run spike:evidence -- PP-D-XXXXX tracking
```

```bash
npm run spike:evidence -- PP-D-XXXXX file
```

**5. Test offers, accepting, and the sandbox decision** (unknown #3)

```bash
npm run spike:action -- PP-D-XXXXX offer 20.00
```

```bash
npm run spike:action -- PP-D-XXXXX win
```

Other actions: `accept`, `message`, `escalate`, `require-seller-evidence`, `require-buyer-evidence`, `lose`. If `win` is refused, try `escalate` or `require-seller-evidence` first, then `win`; the inspect script shows which actions PayPal allows at each stage.

**Record what worked** (which evidence call, which file part name, which steps led to `win`). Phase 7 depends on it.

## Webhooks (local)

PayPal needs a public URL to reach your laptop. Cloudflare's quick tunnel is free and needs no account:

```bash
npm run dev
```

```bash
npx cloudflared tunnel --url http://localhost:3000
```

In the sandbox app's Webhooks section, add `https://<tunnel-host>/api/webhooks/paypal`, subscribe to `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.UPDATED` and `CUSTOMER.DISPUTE.RESOLVED`, and copy the webhook ID into `PAYPAL_WEBHOOK_ID`. Received events show on the home page at `http://localhost:3000`.

The quick tunnel's URL changes each time it starts, so update the webhook URL when it does.

## Demo data and evidence

The app starts with three demo disputes from "Asha's Handmade Store", built to land in the three recommendation bands:

| Dispute | Claim | Evidence | Expected call |
|---|---|---|---|
| DEMO-1001 scarf, $120 | Item not received | Tracked, delivered to the matching postcode, buyer wrote "Got it, love it!" | Contest |
| DEMO-1002 sweater, $80 | Not as described (colour) | Listing says navy, policy warns shades vary, buyer says it looks black | Offer |
| DEMO-1003 mug, $40 | Item not received | No tracking at all | Accept |

Each fact is saved as an evidence record with an ID such as `TRK-001` or `MSG-003`, which the drafted response must cite. Collecting again keeps the same IDs. Carrier tracking is mocked, because the sandbox has no carrier data.

```bash
npm run db:reset
```

```bash
npm run collect
```

```bash
npm run sync
```

`db:reset` rebuilds the database with the demo disputes, `collect` gathers evidence and prints every record, and `sync` imports real disputes from the sandbox seller account (needs the PayPal keys). With the webhook set up, new sandbox disputes are imported automatically.

## The AI agent (Phase 3)

```bash
npm run agent -- DEMO-1002
```

Or click **Run the agent** on a dispute's page. For each dispute it:

1. **Understands** the claim: a one-sentence summary and the key question the evidence must answer.
2. **Gathers evidence** with tool calls it chooses itself (payment, order, tracking, listing, photos, messages, policy, and PayPal status for real disputes). A rules-based safety net fetches anything the claim type needs that the agent skipped.
3. **Reads the messages** for statements such as "Got it, love it!". Every finding must quote its message word for word, or it is dropped.
4. **Compares photos** with Gemini vision for "not as described" claims, noting lighting and camera effects.

All tools only read; nothing is sent to PayPal. If every AI model is unavailable, each step falls back to fixed rules and says so.

**Free-tier notes:** each Gemini model has its own free quota. `GEMINI_MODEL` is the main model and `GEMINI_FALLBACK_MODELS` are tried in order when it is busy or over quota; a model that just failed is skipped for 5 minutes. A run takes 20 seconds to 2 minutes depending on how busy the free models are, so run the agent on the demo disputes before presenting. The sweater photos are generated placeholders (`npm run demo:photos`); real phone photos work better on video.

PayPal's Agent Toolkit (`@paypal/agent-toolkit` 1.11) targets AI SDK v4 and pulls in packages with high-severity advisories, so this project implements its dispute tools directly on the PayPal REST API instead.

## Score, draft and citation check (Phase 4)

After the agent gathers evidence, three more steps run (also on their own with `npm run draft -- DEMO-1001`, which needs no evidence gathering):

1. **Score (rules, not AI).** Each rule adds or removes points and names the records behind it. 70 or more: contest. 40 to 69: offer a partial refund (15 to 30% of the amount, set by the score). Under 40: accept. Seller tips come from what was missing, such as "Add tracking to every order".
2. **Draft (AI).** Gemini writes the response as sentences, each listing the evidence IDs it relies on: a response to PayPal for a contest or concession, or a message to the buyer for an offer.
3. **Citation check (code).** Every sentence must cite a real record, and every date, amount, tracking number and postcode in it must appear in the records it cites. A failed draft goes back to the AI with the exact problems, up to 3 times; sentences that still fail are removed. If no AI model is available, a fixed template writes the draft from the evidence facts, and it always passes.

On a dispute's page, **Edit and check** lets you change the draft and re-run the check. Adding "The buyer is a known scammer." is blocked because no record supports it. Nothing is sent to PayPal until Phase 7.

| Demo dispute | Score | Recommendation |
|---|---|---|
| DEMO-1001 scarf | 80 | Contest |
| DEMO-1002 sweater | 55 | Offer $20.00 (25%) |
| DEMO-1003 mug | 0 | Accept, with the tip to add tracking |

```bash
npm test
```

Runs the unit tests for the scorer and the citation checker (no database or AI needed).

## Evidence PDF (Phase 5)

The file sent to PayPal with a contested dispute. Open it from a dispute's page (**View the evidence PDF**), or build it with:

```bash
npm run packet -- DEMO-1001
```

Files are written to `data/packets/`. Page 1 has the dispute details, the seller's cited statement and an index with page numbers. Each record follows in its own section: payment, order, carrier scan history, delivery facts, listing, photos and messages. Only records cited in the statement or behind the score are included (plus payment and order); scores, AI notes and model names never are. Built with pdf-lib, US Letter, well under PayPal's 10 MB per-file limit (the sweater packet with two photos is about 0.8 MB).

## Dashboard and approval (Phase 6)

The home page is the **dispute inbox**, built on **AG Grid Community** (MIT; no enterprise modules). It shows summary numbers (open disputes, needing approval, due within 3 days, amount in dispute, the agent's recommendations), and a grid sorted by deadline with the recommendation, status and citation-check result for each dispute. Search, sort and filter work on every column, and clicking a row opens the dispute. The inbox refreshes every 5 seconds from `/api/disputes`, so disputes imported by the webhook appear without reloading. The grid's colours follow the app's light and dark mode.

On each dispute, **Your decision** gives the seller three choices:

- **Approve and submit:** two clicks (with a confirmation). Only possible when the draft passes the citation check at that moment; the server checks again on approval.
- **Edit:** in "Edit and check", **Save edits** saves the text only if it passes the citation check. Editing an approved draft sends it back for approval.
- **Handle it myself:** the agent will not send anything.

An approval or "handle it myself" can be undone until something is sent. Sending to PayPal is Phase 7.

## Sending to PayPal and outcomes (Phase 7)

**Approve and submit** now sends the response:

| Recommendation | PayPal call | What is sent |
|---|---|---|
| Contest | `POST /v1/customer/disputes/{id}/provide-evidence` | Multipart: JSON `input` with the cited statement and tracking, plus the evidence PDF as `evidence_file` (format confirmed in the sandbox) |
| Offer | `POST .../make-offer` | `REFUND` of the scored amount, with the message to the buyer (citation tags removed) |
| Accept | `POST .../accept-claim` | The concession note |

Each approval gets one fixed `PayPal-Request-Id`, so pressing send twice can never submit twice. If PayPal refuses, the approval stays, the exact error is shown, and **Try sending again** is available. Demo disputes are never sent: the page shows the exact request a real dispute would get.

PayPal's later decisions arrive by webhook or with **Check PayPal for updates** (inbox) / **Refresh from PayPal** (dispute page). A resolved dispute's outcome is saved against the evidence that was used; the inbox shows **Results so far** and a **What evidence wins** table (measured results only, with simulated demo decisions labelled).

**Sandbox controls** on each dispute: escalate an inquiry to a claim, and trigger PayPal's decision (seller wins / buyer wins) once the claim is under review. On demo disputes the decision is simulated and labelled.

**How PayPal sandbox disputes move** (seen on 12 Nov 2026, details in `PHASE0-FINDINGS.md`): a new dispute sits in PayPal review for a while; evidence in the *inquiry* stage goes to the buyer; escalating turns it into a *claim* (`CHARGEBACK` stage) after PayPal processes it; evidence on the claim puts it under PayPal review, where the sandbox decision becomes possible after another processing delay. Prepare the live demo dispute a day early.

```bash
npm run demo:reset
```

Puts the demo disputes back to "needs your approval" (keeps the agent's work, uses no AI quota), for rehearsing.

```bash
npm run spike:wait-decision -- PP-R-XXXX
```

Retries the sandbox "seller wins" decision every 2 minutes for up to 30 minutes.

## Project layout

```
app/
  page.tsx, inbox.tsx          dispute inbox: KPI row and AG Grid, live refresh
  disputes/[id]/page.tsx       one dispute: recommendation, draft, decision, agent results, evidence, timeline
  api/disputes/route.ts        inbox data as JSON (polled by the dashboard)
  api/webhooks/paypal/route.ts webhook receiver with signature check; imports dispute events
  api/health/route.ts          liveness check for Render
lib/
  db/                          SQLite (data/app.db): disputes, evidence, timeline events
  seed/                        demo store (orders, listings, messages, shipments) and seeding
  sources/                     where seller facts come from: demo store export or PayPal
  carrier/mock.ts              mocked carrier tracking
  evidence/collect.ts          turns facts into citable evidence records
  agent/                       AI agent: summary, tool-calling gatherer, message reader, photo comparison
  case/                        rule-based score, AI draft with retries, citation checker, template fallback, approval rules
  dashboard.ts                 inbox rows and summary numbers
  submit/                      sending approved responses to PayPal; outcomes and the evidence playbook
  llm/                         Gemini models with busy/quota fallback
  claims.ts                    PayPal reason code -> claim type, name/email masking, dates
  paypal/import.ts             imports sandbox disputes (sync and webhook)
  paypal/client.ts             token cache, sandbox-only request helper, idempotency keys
  paypal/disputes.ts           list, get, provide-evidence, make-offer, accept-claim, send-message, sandbox controls
  paypal/orders.ts             test payments
  paypal/webhooks.ts           signature verification
  llm/gemini.ts                Gemini key check
  pdf/packet.ts                evidence packet PDF (cover, statement, index, record sections)
  pdf/layout.ts                small pdf-lib layout engine: wrapping, tables, images, page breaks
  pdf/sample-evidence.ts       test evidence PDF for the Phase 0 upload test
scripts/spike/                 Phase 0 sandbox tests
```

## Safety

- The PayPal client refuses any host other than `api-m.sandbox.paypal.com`.
- Every POST carries a unique `PayPal-Request-Id`, so a retry never submits twice.
- Webhooks are verified with PayPal before they are trusted. `WEBHOOK_SKIP_VERIFY` works only outside production.
- `.env`, `data/` and `spike-results/` are git-ignored.
