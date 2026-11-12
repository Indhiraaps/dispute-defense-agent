# Phase 0 findings (PayPal sandbox)

Raw responses for each step are in `spike-results/`.

## Confirmed working (12 Nov 2026)

| What | Result |
|---|---|
| Sandbox login (OAuth token) | Works. Token includes `disputes/read-seller` and `disputes/update-seller`. |
| Test payment (Orders v2, capture) | Works with **US** sandbox accounts. Transaction `6KE15608DJ4170943`, $120.00. |
| Buyer opens a dispute in the sandbox Resolution Center | Works. Dispute `PP-R-IVY-10200275`, item not received. |
| Get dispute by ID | Works. Returns reason, amount, item name, buyer name, buyer message. |
| Import into the app + evidence collection | Works: PAY-001, ORD-001, MSG-001, POL-001. |
| Gemini free tier | Works, but the newest model is often busy (503). Retries plus backup models handle it. |

## Problems found and how they were handled

1. **Indian sandbox accounts can't pay each other.** Checkout said the seller "doesn't accept payments in your currency". Fix: create a **US Business** and a **US Personal** sandbox account and an app linked to the US business account.
2. **Gemini `gemini-2.5-flash` is retired for new users.** Main model is now `gemini-3.8-flash`, with `gemini-3.5-flash` and `gemini-flash-latest` as backups.
3. **The dispute list API doesn't show the new dispute yet** (`GET /v1/customer/disputes` returned none, even filtered by transaction or start time), but **get by ID works**. So the webhook (which carries the ID) is the main way in, and `npm run sync` also refreshes known disputes by ID.
4. **New dispute went straight to `UNDER_REVIEW` / `UNDER_PAYPAL_REVIEW` (stage INQUIRY)** with no seller actions in its links. All of these were refused with `ACTION_NOT_ALLOWED_IN_CURRENT_DISPUTE_STATE`:
   - `require-evidence` (SELLER_EVIDENCE), HTTP 400
   - `provide-evidence` (tracking only), HTTP **422**, meaning the multipart request was understood and only the dispute state blocked it
   - `adjudicate` (SELLER_FAVOR), HTTP 400

   PayPal's docs say `require-evidence` needs status UNDER_REVIEW **and** a `require_evidence` link in the dispute's links; this dispute has only `self`. PayPal's developer docs site was down (502) when checked.

## Update, later the same day

`PP-R-IVY-10200275` moved by itself from `UNDER_REVIEW` to **`WAITING_FOR_SELLER_RESPONSE` (`REQUIRED_ACTION`)**, with a seller deadline of 2 Dec 2026 (20 days after opening). Its links now allow **`accept_claim`, `provide_evidence`, `send_message`, `escalate` and `make_offer`**. So a new sandbox dispute sits in PayPal review for a while (hours, not minutes) before the seller can act. For the demo, open sandbox disputes the day before.

## Phase 7 tests on PP-R-IVY-10200275 (12 Nov 2026, evening)

| Step | Result |
|---|---|
| `provide-evidence` with tracking info **and a PDF** | **HTTP 200.** Multipart form: JSON part `input`, file part **`evidence_file`** (first name tried). PayPal stored `PROOF_OF_FULFILLMENT` with document `evidence.pdf`. |
| Status after evidence (inquiry stage) | `WAITING_FOR_BUYER_RESPONSE`: in an **inquiry**, the seller's evidence goes to the **buyer**, not to a PayPal decision. |
| `adjudicate` (SELLER_FAVOR) on that status | Refused: `ACTION_NOT_ALLOWED_IN_CURRENT_DISPUTE_STATE`. |
| `escalate` by the seller | **HTTP 200.** Status `UNDER_REVIEW` / `UNDER_PAYPAL_REVIEW`, stage still `INQUIRY` right after. |
| `adjudicate` straight after escalation | Refused again, same error. PayPal probably needs time to turn the inquiry into a claim (as with the first review delay). Re-check later. |

So: **open question 1 is answered** (evidence + PDF upload works). For a live "seller wins" moment, the dispute must reach the claim stage first: open the demo dispute a day early, submit evidence, escalate, and let PayPal process it before presenting.

## Still open

- How to get a sandbox dispute into **WAITING_FOR_SELLER_RESPONSE** (needed for provide-evidence, make-offer, accept-claim). Next tries: re-check this dispute later; open a second dispute as "not as described"; check the docs' sandbox-only "create dispute" action once the site is back.
- Exact file part name for evidence uploads (needs a dispute that accepts evidence).
- Whether `adjudicate` works once a dispute reaches the right state.

**Demo fallback if these stay blocked:** the three demo disputes run the full agent flow locally, and the PayPal submission step shows the exact request and PayPal's real response, including a refusal.
