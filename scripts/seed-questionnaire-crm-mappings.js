import { writeFile } from "node:fs/promises";
import { describeCrmSeedPlan, seedDefinitionCrmMappings } from "../src/lib/questionnaireCrmSeed.js";
import { getCrmCoverageSummary } from "../src/lib/questionnaireCrmContract.js";

const write = process.argv.includes("--write");

async function main() {
  const { db, initResult } = await import("../src/lib/firebase-admin.js");
  if (!db) {
    console.error(initResult?.error || "Database not initialized");
    process.exit(1);
  }
  const snapshot = await db.collection("questionnaireDefinitions").get();
  const report = [];
  for (const doc of snapshot.docs) {
    const definition = { id: doc.id, ...doc.data() };
    if (!["draft", "active"].includes(definition.status)) continue;
    report.push(...describeCrmSeedPlan(definition));
    if (!write) continue;
    const seeded = seedDefinitionCrmMappings(definition);
    const coverage = getCrmCoverageSummary(seeded);
    const backupPath = `C:\\Users\\ADMINI~1\\AppData\\Local\\Temp\\kilo\\crm-seed-${definition.id}-${Date.now()}.json`;
    await writeFile(backupPath, JSON.stringify(definition), "utf8");
    const nextRevision = Number(definition.revision || 0) + 1;
    await db.collection("questionnaireDefinitions").doc(definition.id).set({
      ...seeded,
      revision: nextRevision,
      updatedAt: new Date().toISOString(),
    });
    console.error(`wrote ${definition.id} revision ${nextRevision} coverage=${JSON.stringify(coverage)} backup=${backupPath}`);
  }
  console.log(JSON.stringify(report, null, 2));
  if (!write) console.error(`dry-run ${report.length} questions; pass --write to apply`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
