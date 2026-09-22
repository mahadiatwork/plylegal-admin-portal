import assert from "node:assert/strict";
import test from "node:test";
import { applyQuestionnaireBuiltInConditionalRules } from "./questionnaireBuiltInConditionalRules.js";
import { questionnaireBuiltInPages } from "./questionnaireBuiltInPages.js";

function transformedPage(route) {
  const source = questionnaireBuiltInPages.find((page) => page.route === route);
  assert.ok(source, `missing generated page ${route}`);
  return applyQuestionnaireBuiltInConditionalRules([structuredClone(source)])[0];
}

function question(container, answerKey) {
  for (const candidate of container.questions || container.metadata?.fields || []) {
    if (candidate.answerKey === answerKey) return candidate;
    const nested = question(candidate, answerKey);
    if (nested) return nested;
  }
  return null;
}

test("travel history preserves reviewed conditional display and row requirements", () => {
  const temporary = transformedPage("/intake/temporary-work/all-applicants/travel-history");
  const partner = transformedPage("/intake/partner/all-applicants/travel-history");

  assert.equal(question(temporary, "has_travel_history").type, "yesNo");
  assert.deepEqual(question(temporary, "travel_history").visibleIf, [
    { field: "has_travel_history", op: "equals", value: "yes" },
  ]);
  assert.equal(question(temporary, "travel_history").required, true);

  assert.equal(question(partner, "has_travel_history").type, "yesNo");
  assert.deepEqual(question(partner, "travel_history").visibleIf, [
    { field: "has_travel_history", op: "equals", value: "yes" },
  ]);
  assert.equal(question(partner, "travel_history").required, false);
});

test("reviewed partner refinements become conditional required repeaters", () => {
  const cases = [
    ["/intake/partner/main-applicant/education", "education_history", "has_secondary_education", "yes"],
    ["/intake/partner/main-applicant/family", "children", "has_children", "Yes"],
    ["/intake/partner/family-sponsor/previous-sponsorship", "previous_sponsorships", "has_previous_sponsorship", "Yes"],
    ["/intake/partner/family-sponsor/travel", "travel_history", "has_travel_history", "Yes"],
  ];

  for (const [route, target, source, value] of cases) {
    const field = question(transformedPage(route), target);
    assert.equal(field.required, true, `${route}:${target} should require at least one row`);
    assert.deepEqual(field.visibleIf, [{ field: source, op: "equals", value }]);
  }
});

test("protection travel preserves submit-time history and city requirements", () => {
  const page = transformedPage("/intake/protection/all-applicants/travel-history");
  assert.equal(question(page, "main_applicant_travel_history").required, true);
  assert.equal(question(page, "arrival_city").required, true);
});
