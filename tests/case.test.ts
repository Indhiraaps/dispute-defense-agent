/**
 * Unit tests for the rule-based scorer and the citation checker.
 * Pure functions with hand-made evidence, so no database or AI is needed.
 *   npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Analysis } from "../lib/agent/types";
import { checkDraft, splitSentences } from "../lib/case/check";
import { assemble, templateDraft } from "../lib/case/draft";
import { businessDaysBetween, scoreCase } from "../lib/case/score";
import { selectRecords } from "../lib/pdf/packet";
import type { DisputeRow, EvidenceRecord, Facts } from "../lib/types";

const ev = (id: string, kind: EvidenceRecord["kind"], text: string, facts: Facts): EvidenceRecord => ({
  id,
  disputeId: "T",
  kind,
  sourceRef: id,
  source: "test",
  title: id,
  text,
  facts,
  collectedAt: "2026-11-12T00:00:00Z",
});

const dispute = (over: Partial<DisputeRow>): DisputeRow => ({
  id: "T",
  source: "demo",
  claimType: "INR",
  reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
  buyerClaim: "",
  paypalStatus: "",
  stage: "",
  amount: "80.00",
  currency: "USD",
  itemName: "Item",
  buyerName: "",
  buyerCountry: "",
  transactionId: "",
  orderId: "",
  openedAt: "2026-11-10T00:00:00Z",
  sellerDueAt: null,
  state: "NEW",
  outcome: null,
  updatedAt: "",
  ...over,
});

const analysis = (over: Partial<Analysis>): Analysis => ({
  disputeId: "T",
  summary: null,
  steps: [],
  gatheringNote: "",
  messageFindings: [],
  rejectedFindings: 0,
  photoFinding: null,
  models: {},
  updatedAt: "",
  ...over,
});

const PAY = ev("PAY-001", "payment", "PayPal payment 5TY82917JD440813K of 120.00 USD on 28 Oct 2026.", {
  transaction_id: "5TY82917JD440813K",
  amount: "120.00",
  currency: "USD",
  paid_at: "2026-10-28",
});
const ORD = ev("ORD-001", "order", "Order AHS-2041: 1 × scarf. Ship to Berlin 10115, Germany. Marked shipped on 30 Oct 2026.", {
  order_id: "AHS-2041",
  ship_to_postal_code: "10115",
  shipped_at: "2026-10-30",
  paid_at: "2026-10-28",
});
const TRK = ev("TRK-001", "tracking", "DHL Express tracking 4719336502, picked up in Jaipur on 30 Oct 2026, addressed to Berlin 10115.", {
  tracking_number: "4719336502",
  picked_up_at: "2026-10-30",
  address_match: true,
});
const DLV = ev("DLV-001", "delivery", "DHL Express shows the parcel delivered in Berlin 10115 on 4 Nov 2026. No signature or delivery photo recorded.", {
  delivered: true,
  delivered_at: "2026-11-04",
  signed_by: null,
  delivery_photo: false,
});
const MSG = ev("MSG-001", "message", 'Buyer wrote on 5 Nov 2026: "Got it, love it! The colours are even nicer in person."', {
  from: "buyer",
  date: "2026-11-05",
  text: "Got it, love it! The colours are even nicer in person.",
});
const POL = ev("POL-001", "policy", "Shop policy: colour can vary slightly. Orders ship within 3 business days.", { handling_days: 3 });

describe("scorer", () => {
  it("counts business days, skipping weekends", () => {
    assert.equal(businessDaysBetween("2026-10-28", "2026-10-30"), 2); // Wed -> Fri
    assert.equal(businessDaysBetween("2026-10-30", "2026-11-02"), 1); // Fri -> Mon
  });

  it("contests a tracked, delivered parcel the buyer acknowledged (scarf)", () => {
    const s = scoreCase(dispute({}), [PAY, ORD, TRK, DLV, MSG, POL], analysis({
      messageFindings: [{ evidenceId: "MSG-001", signal: "BUYER_CONFIRMS_RECEIPT", quote: "Got it", explanation: "" }],
    }));
    assert.equal(s.score, 80);
    assert.equal(s.band, "CONTEST");
    assert.deepEqual(s.rules.find((r) => r.id === "buyer_ack")?.cites, ["MSG-001"]);
  });

  it("accepts when there is no tracking (mug)", () => {
    const s = scoreCase(dispute({ amount: "40.00" }), [PAY, ORD, POL], analysis({}));
    assert.equal(s.band, "ACCEPT");
    assert.equal(s.score, 0);
    assert.ok(s.advice.some((a) => a.includes("tracking")));
  });

  it("offers a bounded partial refund on a mixed 'not as described' case (sweater)", () => {
    const LST = ev("LST-001", "listing", "Listing: merino sweater, naturally dyed navy. Natural dyes mean the shade can vary slightly.", { color: "navy" });
    const IMG1 = ev("IMG-001", "photo", "Listing photo.", { who: "listing" });
    const IMG2 = ev("IMG-002", "photo", "Buyer's photo.", { who: "buyer" });
    const s = scoreCase(
      dispute({ claimType: "SNAD", buyerClaim: "The colour is wrong. The listing says navy but the sweater is black." }),
      [PAY, LST, IMG1, IMG2, POL],
      analysis({
        photoFinding: { attribute: "colour", listingShows: "", buyerPhotoShows: "", verdict: "consistent", factors: "", confidence: 0.88, citedIds: ["IMG-001", "IMG-002"] },
      }),
    );
    assert.equal(s.score, 55);
    assert.equal(s.band, "OFFER");
    assert.deepEqual(s.offer, { percent: 25, amount: "20.00", currency: "USD" });
  });

  it("drops a case when the seller admits a mistake", () => {
    const s = scoreCase(dispute({}), [PAY, ORD, TRK, DLV, MSG, POL], analysis({
      messageFindings: [{ evidenceId: "MSG-001", signal: "SELLER_ADMITS_FAULT", quote: "x", explanation: "" }],
    }));
    assert.equal(s.score, 20); // 70 - 50
    assert.equal(s.band, "ACCEPT");
  });
});

describe("citation checker", () => {
  const evidence = [PAY, ORD, TRK, DLV, MSG, POL];

  it("passes a fully cited draft", () => {
    const r = checkDraft(
      'The parcel was sent with tracking 4719336502 on 30 Oct 2026 [TRK-001]. It was delivered in Berlin 10115 on 4 Nov 2026 [DLV-001]. The buyer wrote "Got it, love it!" on 5 Nov 2026 [MSG-001]. Thank you for reviewing this case.',
      evidence,
    );
    assert.equal(r.ok, true, JSON.stringify(r.problems));
    assert.equal(r.sentences, 4);
  });

  it("blocks an invented claim with no source", () => {
    const r = checkDraft("It was delivered on 4 Nov 2026 [DLV-001]. The buyer is a known scammer.", evidence);
    assert.equal(r.ok, false);
    assert.equal(r.problems[0].sentence, 2);
  });

  it("blocks a wrong date, a wrong number and a made-up ID", () => {
    assert.equal(checkDraft("Delivered on 9 Nov 2026 [DLV-001].", evidence).ok, false);
    assert.equal(checkDraft("Tracking 4719336599 [TRK-001].", evidence).ok, false);
    assert.equal(checkDraft("The buyer signed for it [DLV-009].", evidence).ok, false);
  });

  it("blocks a true number cited to the wrong record", () => {
    assert.equal(checkDraft("Tracking 4719336502 [PAY-001].", evidence).ok, false);
  });

  it("allows the offer amount it was given", () => {
    const text = "We can refund 20.00 USD, which is 25% of the payment [PAY-001].";
    assert.equal(checkDraft(text, evidence).ok, false);
    assert.equal(checkDraft(text, evidence, { allowedTokens: ["20.00", "25"] }).ok, true);
  });

  it("enforces the word limit", () => {
    const long = Array(40).fill("Delivered on 4 Nov 2026 [DLV-001].").join(" ");
    assert.equal(checkDraft(long, evidence, { maxWords: 150 }).ok, false);
  });

  it("keeps quotes whole and moves trailing citations back", () => {
    assert.deepEqual(splitSentences('Buyer wrote "Got it, love it! Thanks." [MSG-001] Next one [PAY-001].'), [
      'Buyer wrote "Got it, love it! Thanks." [MSG-001]',
      "Next one [PAY-001].",
    ]);
  });

  it("assembles sentences with citations before the full stop", () => {
    assert.equal(assemble([{ text: "Delivered on 4 Nov 2026.", cites: ["DLV-001"] }]), "Delivered on 4 Nov 2026 [DLV-001].");
    // The citation never goes inside a quotation.
    const quoted = assemble([{ text: 'The buyer wrote "Got it, love it!"', cites: ["MSG-001"] }, { text: "Next.", cites: ["PAY-001"] }]);
    assert.equal(quoted, 'The buyer wrote "Got it, love it!" [MSG-001] Next [PAY-001].');
    assert.equal(checkDraft('The buyer wrote "Got it, love it!" on 5 Nov 2026. [MSG-001] Paid 120.00 USD [PAY-001].', evidence).ok, true);
  });

  it("template drafts always pass the checker", () => {
    for (const [band, offer] of [["CONTEST", null], ["OFFER", { percent: 25, amount: "20.00", currency: "USD" }], ["ACCEPT", null]] as const) {
      const score = scoreCase(dispute({}), evidence, analysis({
        messageFindings: [{ evidenceId: "MSG-001", signal: "BUYER_CONFIRMS_RECEIPT", quote: "Got it", explanation: "" }],
      }));
      const text = templateDraft(dispute({}), evidence, { ...score, band, offer });
      const r = checkDraft(text, evidence, { allowedTokens: offer ? ["20.00", "25"] : [] });
      assert.equal(r.ok, true, `${band}: ${JSON.stringify(r.problems)}\n${text}`);
    }
  });
});

describe("evidence packet", () => {
  it("includes every cited record plus payment and order, and nothing else", () => {
    const extra = ev("LST-001", "listing", "Listing.", {});
    const picked = selectRecords([PAY, ORD, TRK, DLV, MSG, POL, extra], "Delivered on 4 Nov 2026 [DLV-001]. Got it [MSG-001].", ["TRK-001"]);
    assert.deepEqual(
      picked.map((e) => e.id),
      ["PAY-001", "ORD-001", "TRK-001", "DLV-001", "MSG-001"],
    );
  });
});

describe("submission", () => {
  it("removes citations from text sent to the buyer, keeping punctuation tidy", async () => {
    const { stripCitations } = await import("../lib/submit/submit");
    assert.equal(
      stripCitations('Our dyes vary slightly [POL-001]. We offer 20.00 USD [PAY-001]. The buyer wrote "Got it!" [MSG-001]'),
      'Our dyes vary slightly. We offer 20.00 USD. The buyer wrote "Got it!"',
    );
  });

  it("classifies PayPal outcome codes", async () => {
    const { outcomeKind } = await import("../lib/submit/outcomes");
    assert.equal(outcomeKind("RESOLVED_SELLER_FAVOUR"), "won");
    assert.equal(outcomeKind("RESOLVED_BUYER_FAVOUR"), "lost");
    assert.equal(outcomeKind("CANCELED_BY_BUYER"), "won");
    assert.equal(outcomeKind("ACCEPTED"), "conceded");
    assert.equal(outcomeKind("DEMO_SELLER_FAVOUR"), "won");
  });
});
