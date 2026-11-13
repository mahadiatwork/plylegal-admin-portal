import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const adminContractPath = path.resolve(testDirectory, "../src/lib/questionnaireStarterTemplates.js");
const clientContractPath = path.resolve(testDirectory, "../../plylegal-client-portal/src/lib/questionnaires/temporaryWork482.definition.js");

test("admin Character is generated from the client portal's canonical contract", {
  skip: !existsSync(clientContractPath) && "client portal checkout is not available",
}, () => {
  const generated = readFileSync(adminContractPath, "utf8")
    .replace(/^\/\/ Generated from the client portal's canonical temporary-work Character contract\.\r?\n\/\/ Regenerate with scripts\/extract-questionnaire-built-ins\.cjs; do not maintain a second declaration inventory here\.\r?\n/, "");
  const canonical = readFileSync(clientContractPath, "utf8");
  assert.equal(generated, canonical);
});
