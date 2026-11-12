# Dispute Defense Agent

**Tagline (Devpost "elevator pitch", max 200 characters):**
PayPal's AI toolkit can accept a dispute but can't fight one. This agent builds a cited case, tells sellers when not to fight, and submits only after they approve.

**Try it:** https://dispute-defense-agent.onrender.com (password in the submission notes; the free server takes about a minute to wake up)
**Code:** https://github.com/Indhiraaps/dispute-defense-agent (MIT licence)

*The demo video was recorded automatically from the running app, with text-to-speech narration.*

---

## Inspiration

When a buyer opens a PayPal dispute, a small seller has a short window to answer, or loses by default. To answer well they have to find the order, the tracking, the delivery proof, the listing and the messages, turn it all into evidence PayPal accepts, and decide whether fighting is even worth it. Many sellers, especially small cross-border shops, just give up.

PayPal's own Agent Toolkit exposes three dispute tools: list, get and **accept**. An AI agent built on it today can give up on a dispute, but it can't defend one. The Disputes REST API can (`provide-evidence`, `make-offer`, `escalate`), so we built the agent that uses it, honestly and with a human in control.

## What it does

For each dispute, the agent:

1. **Understands the claim:** a one-line summary and the one question the evidence must answer ("Was the parcel delivered to the buyer's address?").
2. **Gathers evidence by itself:** a tool-calling agent decides which records to fetch for this claim type (payment, order, carrier tracking, listing, photos, messages, shop policy, PayPal status). Each fact becomes a record with an ID, such as `TRK-001` or `MSG-001`.
3. **Reads the messages:** finds statements that matter, like the buyer writing "Got it, love it!". Every finding must quote the message word for word, or it is thrown out.
4. **Compares photos with vision:** for "not as described" claims, it compares the listing photo with the buyer's photo and says whether lighting could explain the difference.
5. **Scores the case with fixed rules, not AI:** every point is tied to a record ("+30 Carrier shows delivered [DLV-001]"). 70 or more: **contest**. 40 to 69: **offer a partial refund**. Under 40: **accept**, with advice like "Add tracking to every order".
6. **Drafts the response:** a statement to PayPal or a polite offer to the buyer, where every sentence cites its evidence.
7. **Checks every citation in code:** each sentence must cite a real record, and every date, amount, tracking number and postcode must match that record. Type "The buyer is a known scammer." into the draft and it is **blocked**: there is no record to cite.
8. **Builds an evidence PDF:** a cover page, the cited statement, a page-numbered index, then one section per record (carrier scan history, delivery facts, messages, photos).
9. **Waits for the seller:** Approve (two clicks, only if the citation check passes), Edit (saved only if it still passes), or Handle it myself.
10. **Submits to PayPal and tracks the outcome:** `provide-evidence` with the PDF, `make-offer` or `accept-claim`, with one fixed `PayPal-Request-Id` per approval so a retry never double-submits. PayPal's decision comes back through signature-verified webhooks or a sync, and feeds a "what evidence wins" playbook.

The seller sees all of it in a dispute inbox built on AG Grid, with deadline countdowns, recommendations and live updates.

## How we built it

- **Next.js 16** (App Router, server actions) on **Render**'s free tier, with a Blueprint (`render.yaml`).
- **PayPal REST APIs, sandbox:** Disputes v1 (`get`, `list`, `provide-evidence` as multipart with the PDF, `make-offer`, `accept-claim`, `escalate`, and the sandbox-only `adjudicate`), Orders v2 for test payments, and Webhooks with signature verification (`verify-webhook-signature`) for `CUSTOMER.DISPUTE.CREATED / UPDATED / RESOLVED`.
- **Gemini (free tier) through the Vercel AI SDK v7:** tool calling for the gathering agent, structured output for summaries, message findings and drafts, and vision for photos. Free models get busy, so every call has a time limit and falls back through several models; if all are down, each step falls back to rules or a template and says so on screen.
- **SQLite** (`better-sqlite3`) for disputes, evidence, analysis, drafts, submissions and outcomes.
- **pdf-lib** for the evidence packet, with a small layout engine (wrapping, tables, images, keep-together page breaks).
- **AG Grid Community** for the inbox, themed to follow light and dark mode.
- **17 unit tests** for the scorer, the citation checker, the PDF record selection and the submission rules.

Everything is free: Gemini free tier, PayPal sandbox, Render free plan, open-source libraries.

## Where the AI is, and where it isn't

| Task | Who does it | Why |
|---|---|---|
| Summarising the claim, choosing what evidence to fetch | AI agent | Varies by claim; reasoning about relevance |
| Finding key statements in messages | AI, quotes verified by code | Reading language is what LLMs are good at |
| Comparing photos | AI vision | Lighting and camera effects need judgment |
| Writing the response | AI, every citation verified by code | Saves the seller the writing |
| Scoring the case | **Rules** | Must be consistent and explainable |
| Deciding to submit | **The seller** | Money and reputation are at stake |
| Calling PayPal | **Code** | Deterministic and auditable |

## Challenges we ran into

- **The PayPal sandbox's dispute lifecycle is slow and stateful.** We tested it for real: a new dispute sat in PayPal review for a few hours before the seller could respond. Evidence in the *inquiry* stage goes to the buyer, not to a decision. The seller had to escalate to a *claim*, submit evidence again, and wait about 30 minutes until PayPal added the `adjudicate` action. We documented every state change and made the app show sandbox controls only when PayPal actually allows them.
- **Unconfirmed API details.** The multipart format for `provide-evidence` wasn't clear from the docs. We tested it in the sandbox before building on it: a JSON `input` part plus the PDF as `evidence_file`.
- **Indian sandbox accounts couldn't pay each other**, so testing moved to US sandbox accounts.
- **Free AI quotas.** Several Gemini models ran out of quota during development. We built model fallback with cooldowns, a rules safety net for gathering, and a template drafter that writes from the evidence facts and always passes the citation check.
- **A wiped disk on every restart (Render free plan).** The app ships a snapshot of the agent's finished work and re-imports real PayPal disputes on startup.

## Accomplishments we're proud of

- **The full loop works against the real PayPal sandbox:** a sandbox buyer opened a dispute, the agent gathered and cited the evidence, we submitted the evidence PDF, escalated to a claim, and PayPal resolved it **`RESOLVED_SELLER_FAVOUR`**. The app recorded it as a win.
- **The citation checker.** The AI cannot put a fact in front of PayPal that the seller's records don't support, and wrong dates, numbers and IDs are caught, not just missing citations.
- **It tells sellers when not to fight.** Of the three demo disputes, the agent contests one, offers a partial refund on one, and recommends accepting one, with the reason.

## What we learned

- Agents are most trustworthy when the AI does the language work and code does the money and the facts.
- Test the real API early. Half our design decisions came from what the sandbox actually did, not what we expected.

## What's next

- Publish the new dispute tools (`provide-evidence`, `make-offer`, `escalate`) as an **MCP server**, so any agent built on PayPal's toolkit can defend disputes, not only accept them.
- Real carrier tracking APIs and PayPal's Shipment Tracking, and **prevention**: push tracking to PayPal when an order ships, before any claim arrives.
- Store connectors (Shopify, Etsy) for listings and messages, and multi-language buyer messages for cross-border sellers.
- A pilot with real sellers to **measure** win rates and time saved. We don't claim a win-rate improvement we haven't measured.

## Honest limits

- PayPal **sandbox** only. Carrier tracking in the demo is **mocked** (the sandbox has no carrier data), and the demo sweater photos are generated placeholders.
- Demo disputes are never sent to PayPal; their decisions are simulated and labelled as such. The real sandbox dispute went through PayPal's actual flow.
- Measured results so far: one real sandbox dispute, resolved in the seller's favour. That's a working loop, not a win rate.

## Built with

`nextjs` `typescript` `react` `paypal-rest-api` `paypal-disputes-api` `paypal-webhooks` `gemini` `vercel-ai-sdk` `sqlite` `pdf-lib` `ag-grid` `render`
