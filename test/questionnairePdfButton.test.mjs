import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("questionnaire action is a single direct PDF download", async () => {
  const component = await readFile("src/components/QuestionnairePdfLink.jsx", "utf8");
  assert.match(component, /\/api\/matter\/\$\{encodeURIComponent\(matterId\)\}\/questionnaire\/pdf/);
  assert.match(component, /\bdownload\b/);
  assert.match(component, />\s*Download PDF\s*</);
  assert.doesNotMatch(component, /View all Q&A|Save PDF|target="_blank"|questionnaire\/answers/);
});

test("legacy questionnaire screen no longer renders the old print export controls", async () => {
  const page = await readFile("src/app/matter/[matterId]/questionnaire/page.js", "utf8");
  assert.doesNotMatch(page, /Include notes in PDF|handleDownloadPDF|PrintQARenderer/);
  assert.match(page, /<QuestionnairePdfLink matterId=/);
});
