/**
 * Builds the evidence PDF for one dispute, or every dispute with a draft,
 * into data/packets/.
 *   npm run packet -- DEMO-1001
 *   npm run packet
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { heading, info, ok, run } from "./spike/_shared";
import { getCaseFile, listDisputes } from "../lib/db/repo";
import { buildEvidencePacket } from "../lib/pdf/packet";

run(async () => {
  const only = process.argv[2];
  const ids = only ? [only] : listDisputes().filter((d) => getCaseFile(d.id)).map((d) => d.id);
  const dir = path.join(process.cwd(), "data", "packets");
  mkdirSync(dir, { recursive: true });
  for (const id of ids) {
    const p = await buildEvidencePacket(id);
    const file = path.join(dir, p.filename);
    writeFileSync(file, p.bytes);
    heading(id);
    ok(`${path.relative(process.cwd(), file)}: ${p.pages} page(s), ${(p.bytes.length / 1024).toFixed(0)} KB`);
    info(`Records: ${p.includedIds.join(", ")}`);
  }
});
