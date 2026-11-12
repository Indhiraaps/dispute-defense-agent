import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** A one-page placeholder evidence PDF, used by the Phase 0 upload test. */
export async function buildSampleEvidencePdf(disputeId: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.09, 0.13, 0.17);

  page.drawText("Seller evidence (sandbox test)", { x: 50, y: 780, size: 20, font: bold, color: ink });
  const lines = [
    `Dispute: ${disputeId}`,
    `Generated: ${new Date().toISOString()}`,
    "",
    "[TRK-001] Shipped via FedEx, tracking 122533485, on 3 Nov.",
    "[TRK-002] Carrier shows delivered to the buyer's address on 6 Nov.",
    "[MSG-003] Buyer wrote: \"got the package, thanks\" on 7 Nov.",
    "",
    "This file was generated to test the PayPal sandbox provide-evidence upload.",
  ];
  lines.forEach((text, i) => page.drawText(text, { x: 50, y: 740 - i * 20, size: 12, font, color: ink }));
  return doc.save();
}
