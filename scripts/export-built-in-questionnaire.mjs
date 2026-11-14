/* Export a built-in questionnaire definition as JSON for Client Portal parity tests.
 *
 * Usage:
 *   node scripts/export-built-in-questionnaire.mjs [visaType] [visaContext] [outFile]
 *   node scripts/export-built-in-questionnaire.mjs temporary-work 482
 *
 * Default output: ../plylegal-client-portal/e2e/fixtures/<definition-id>.json
 * The Client Portal e2e harness injects this JSON in localStorage mode only, so the
 * exact admin catalog can be rendered without touching Firebase.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getBuiltInQuestionnaireDefinition } from "../src/lib/questionnaireBuiltIns.js";
import { normalizeQuestionnaireDefinition } from "../src/lib/questionnaireDefinitions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const [visaType = "temporary-work", visaContext = "482", outFile] = process.argv.slice(2);

const builtIn = getBuiltInQuestionnaireDefinition({ visaType, visaContext });
const definition = normalizeQuestionnaireDefinition({ ...builtIn, status: "active", revision: 1 });
const target = outFile
  ? path.resolve(outFile)
  : path.resolve(__dirname, "../../plylegal-client-portal/e2e/fixtures", `${definition.id}.json`);

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(definition, null, 2)}\n`);
console.log(`Exported ${definition.id} (${definition.pages.length} pages) to ${target}`);
