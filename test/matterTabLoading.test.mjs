import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("the shared matter-tab loader fills the panel and exposes an accessible wave status", async () => {
  const [component, styles] = await Promise.all([
    read("src/components/matter/MatterTabLoadingState.jsx"),
    read("src/app/globals.css"),
  ]);

  assert.match(component, /role="status"/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /aria-atomic="true"/);
  assert.match(component, /Loading data…/);
  assert.match(component, /100vh - var\(--matter-header-height/);
  assert.equal((component.match(/matter-tab-loading-wave/g) || []).length, 1);
  assert.match(styles, /@keyframes matter-tab-loading-wave/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.matter-tab-loading-wave,[\s\S]*?\.matter-tab-loading-surface[\s\S]*?animation: none/);
});

test("all three matter tabs replace their data area with the shared loading state", async () => {
  const [answers, resources, sharedResources, builder] = await Promise.all([
    read("src/app/matter/[matterId]/questionnaire/page.js"),
    read("src/app/matter/[matterId]/resources/page.js"),
    read("src/components/admin/AdminResourceTemplatesManager.jsx"),
    read("src/components/admin/AdminQuestionnaireBuilder.jsx"),
  ]);

  assert.match(
    answers,
    /if \(isLoading\)[\s\S]*?<MatterTabLoadingState label="Loading client answers data…"/,
  );
  assert.match(
    resources,
    /isIndividualLoading \? \([\s\S]*?<MatterTabLoadingState label="Loading resources data…"/,
  );
  assert.match(
    resources,
    /isIndividualLoading[\s\S]*?\? "Loading…"[\s\S]*?: individualResources\.length/,
  );
  assert.match(
    sharedResources,
    /if \(isLoading\)[\s\S]*?<MatterTabLoadingState label="Loading resources data…"/,
  );
  assert.match(
    builder,
    /embeddedInMatter && isLoading[\s\S]*?<MatterTabLoadingState label="Loading questionnaire builder data…"/,
  );
});
