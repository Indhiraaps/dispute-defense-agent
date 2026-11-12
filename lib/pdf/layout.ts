import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts, type RGB } from "pdf-lib";

/**
 * A small top-to-bottom layout engine on pdf-lib: wrapped text, key/value
 * tables, images and automatic page breaks. US Letter, because the PayPal
 * sandbox seller is a US account.
 */

export const PAGE = { width: 612, height: 792, margin: 54, footer: 36 } as const;
export const INK = rgb(0.09, 0.13, 0.17);
export const MUTED = rgb(0.36, 0.41, 0.47);
export const LINE = rgb(0.85, 0.88, 0.91);
export const ACCENT = rgb(0.05, 0.42, 0.36);
export const SHADE = rgb(0.95, 0.96, 0.97);

const FALLBACKS: Record<string, string> = { "→": "->", "←": "<-", "✓": "v", "✗": "x", "≥": ">=", "≤": "<=", "…": "..." };

export class Layout {
  doc!: PDFDocument;
  regular!: PDFFont;
  bold!: PDFFont;
  page!: PDFPage;
  y = 0;

  static async create(title: string): Promise<Layout> {
    const l = new Layout();
    l.doc = await PDFDocument.create();
    l.doc.setTitle(title);
    l.doc.setProducer("Dispute Defense Agent");
    l.doc.setCreator("Dispute Defense Agent");
    l.regular = await l.doc.embedFont(StandardFonts.Helvetica);
    l.bold = await l.doc.embedFont(StandardFonts.HelveticaBold);
    l.newPage();
    return l;
  }

  get contentWidth() {
    return PAGE.width - PAGE.margin * 2;
  }

  get pageNumber() {
    return this.doc.getPages().indexOf(this.page) + 1;
  }

  newPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }

  /** Starts a new page if fewer than `height` points are left above the footer. */
  ensure(height: number) {
    if (this.y - height < PAGE.margin + PAGE.footer) this.newPage();
  }

  gap(h: number) {
    this.y -= h;
  }

  /** Replaces characters the standard PDF fonts cannot draw. */
  safe(text: string, font = this.regular): string {
    let out = "";
    for (const ch of text.replace(/\s+/g, " ")) {
      const mapped = FALLBACKS[ch] ?? ch;
      try {
        font.encodeText(mapped);
        out += mapped;
      } catch {
        out += "?";
      }
    }
    return out;
  }

  wrap(text: string, size: number, width: number, font = this.regular): string[] {
    const words = this.safe(text, font).split(" ");
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else {
        if (line) lines.push(line);
        // A single word longer than the line is split by characters.
        let rest = w;
        while (font.widthOfTextAtSize(rest, size) > width) {
          let cut = rest.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  text(text: string, opts: { size?: number; font?: PDFFont; color?: RGB; x?: number; width?: number; lineGap?: number } = {}) {
    const size = opts.size ?? 10.5;
    const font = opts.font ?? this.regular;
    const x = opts.x ?? PAGE.margin;
    const width = opts.width ?? this.contentWidth - (x - PAGE.margin);
    const lh = size * (opts.lineGap ?? 1.35);
    for (const line of this.wrap(text, size, width, font)) {
      this.ensure(lh);
      this.y -= lh;
      this.page.drawText(line, { x, y: this.y + (lh - size) / 2, size, font, color: opts.color ?? INK });
    }
  }

  heading(text: string, size = 15) {
    this.ensure(size * 2.4);
    this.gap(size * 0.6);
    this.text(text, { size, font: this.bold });
    this.gap(4);
  }

  rule(color = LINE) {
    this.ensure(8);
    this.gap(4);
    this.page.drawLine({ start: { x: PAGE.margin, y: this.y }, end: { x: PAGE.width - PAGE.margin, y: this.y }, thickness: 0.75, color });
    this.gap(6);
  }

  /** Two-column key/value table. */
  table(rows: [string, string][], opts: { keyWidth?: number; size?: number } = {}) {
    const size = opts.size ?? 9.5;
    const kw = opts.keyWidth ?? 150;
    const vw = this.contentWidth - kw - 8;
    for (const [k, v] of rows) {
      const lines = this.wrap(v || "-", size, vw);
      const lh = size * 1.4;
      const h = lines.length * lh + 6;
      this.ensure(h);
      this.page.drawRectangle({ x: PAGE.margin, y: this.y - h, width: this.contentWidth, height: h, color: SHADE });
      this.page.drawText(this.safe(k, this.bold), { x: PAGE.margin + 6, y: this.y - lh + 1, size, font: this.bold, color: MUTED });
      lines.forEach((line, i) =>
        this.page.drawText(line, { x: PAGE.margin + kw, y: this.y - lh * (i + 1) + 1, size, font: this.regular, color: INK }),
      );
      this.y -= h + 2;
    }
  }

  /** A filled bar with the record ID and title, like a tab in a binder. */
  recordHeader(id: string, title: string) {
    this.ensure(70); // keep the header with at least a few lines of its record
    this.gap(10);
    const h = 22;
    this.page.drawRectangle({ x: PAGE.margin, y: this.y - h, width: this.contentWidth, height: h, color: ACCENT });
    this.page.drawText(id, { x: PAGE.margin + 8, y: this.y - 15, size: 11, font: this.bold, color: rgb(1, 1, 1) });
    const titleX = PAGE.margin + 8 + this.bold.widthOfTextAtSize(id, 11) + 12;
    const maxW = PAGE.width - PAGE.margin - titleX - 8;
    const [line] = this.wrap(title, 10.5, maxW);
    this.page.drawText(line ?? "", { x: titleX, y: this.y - 15, size: 10.5, font: this.regular, color: rgb(1, 1, 1) });
    this.y -= h + 6;
  }

  async image(bytes: Uint8Array, kind: "png" | "jpg", maxWidth: number, maxHeight: number) {
    const img = kind === "png" ? await this.doc.embedPng(bytes) : await this.doc.embedJpg(bytes);
    const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    this.ensure(h + 8);
    this.y -= h;
    this.page.drawImage(img, { x: PAGE.margin, y: this.y, width: w, height: h });
    this.page.drawRectangle({ x: PAGE.margin, y: this.y, width: w, height: h, borderColor: LINE, borderWidth: 0.75 });
    this.gap(8);
  }

  /** Draws the footer on every page once the document is complete. */
  footers(left: string) {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      const y = PAGE.margin - 22;
      p.drawLine({ start: { x: PAGE.margin, y: y + 12 }, end: { x: PAGE.width - PAGE.margin, y: y + 12 }, thickness: 0.5, color: LINE });
      p.drawText(this.safe(left), { x: PAGE.margin, y, size: 8, font: this.regular, color: MUTED });
      const right = `Page ${i + 1} of ${pages.length}`;
      p.drawText(right, { x: PAGE.width - PAGE.margin - this.regular.widthOfTextAtSize(right, 8), y, size: 8, font: this.regular, color: MUTED });
    });
  }
}
