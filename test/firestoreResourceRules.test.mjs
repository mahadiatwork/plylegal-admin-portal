import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("admin deployments preserve authenticated active Resource Centre reads", async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");

  assert.match(rules, /match \/resources\/\{resourceId\}/);
  assert.match(rules, /match \/applications\/\{appId\}\/resources\/\{resourceId\}/);
  assert.match(rules, /match \/applications\/\{appId\}\/data\/\{document=\*\*\}/);
  assert.doesNotMatch(rules, /match \/applications\/\{appId\}\/\{document=\*\*\}/);
  assert.match(rules, /match \/resourceTemplates\/\{visaSlug\}/);
  assert.match(rules, /match \/items\/\{itemId\}/);
  assert.match(rules, /request\.auth != null[\s\S]*resource\.data\.status == "active"/);
  assert.match(
    rules,
    /get\(\/databases\/\$\(database\)\/documents\/resourceTemplates\/\$\(visaSlug\)\)\.data\.status == "active"/
  );
  assert.match(
    rules,
    /match \/applications\/\{appId\}\/resources\/\{resourceId\} \{[\s\S]*?allow write: if false;/
  );
});
