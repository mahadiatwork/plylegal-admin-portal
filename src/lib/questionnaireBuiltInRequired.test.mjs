import assert from "node:assert/strict";
import test from "node:test";
import { questionnaireBuiltInPages } from "./questionnaireBuiltInPages.js";

function page(route) {
  const match = questionnaireBuiltInPages.find((candidate) => candidate.route === route);
  assert.ok(match, `missing generated page ${route}`);
  return match;
}

function question(container, answerKey) {
  const match = container.questions?.find((candidate) => candidate.answerKey === answerKey)
    || container.metadata?.fields?.find((candidate) => candidate.answerKey === answerKey);
  assert.ok(match, `missing generated question ${answerKey}`);
  return match;
}

test("generated fields preserve direct static Zod required and optional wrappers", () => {
  const travel = page("/intake/temporary-work/all-applicants/travel-history");

  assert.equal(question(travel, "has_travel_history").required, true);
  assert.equal(question(travel, "travel_history").required, false);
});

test("generated repeater rows preserve their dialog schema requirements", () => {
  const travel = page("/intake/temporary-work/all-applicants/travel-history");
  const row = question(travel, "travel_history");

  for (const answerKey of [
    "applicant_ids",
    "country",
    "reason_for_visit",
    "legal_status",
    "date_arrived_day",
    "date_arrived_month",
    "date_arrived_year",
  ]) {
    assert.equal(question(row, answerKey).required, true, `${answerKey} should remain required`);
  }
  for (const answerKey of [
    "other_reason_details",
    "departure_day",
    "departure_month",
    "departure_year",
  ]) {
    assert.equal(question(row, answerKey).required, false, `${answerKey} should remain optional`);
  }
});

test("collection and checkbox requirements match the dynamic renderer's value semantics", () => {
  const education = page("/intake/partner/main-applicant/education");
  const witnesses = page("/intake/partner/relationships/supporting-witnesses");
  const languages = page("/intake/protection/all-applicants/languages");
  const applicants = question(languages, "applicants");
  const languageRows = question(applicants, "languages");

  assert.equal(question(education, "education_history").required, false, "a bare array may be empty");
  assert.equal(question(witnesses, "supporting_witnesses").required, true, "a positive array minimum is required");
  for (const answerKey of ["speak", "read", "write"]) {
    assert.equal(question(languageRows, answerKey).required, false, "a false boolean still satisfies z.boolean()");
  }
});

test("fallback default values stay optional while real nested schemas remain authoritative", () => {
  const skills = page("/intake/temporary-work/main-applicant/skills");
  const registrations = question(skills, "registrations");

  // The page-level shape is inferred from defaultValues and is not validation evidence.
  assert.equal(question(skills, "has_occupational_registration").required, false);
  assert.equal(registrations.required, false);

  // The repeater dialog has its own real Zod schema, so its field wrappers are safe to infer.
  assert.equal(question(registrations, "authority").required, true);
  assert.equal(question(registrations, "english_requirement_details").required, false);
  assert.equal(question(registrations, "expiry_date_day").required, false);
});

test("nested other-name rows distinguish required identity fields from optional evidence", () => {
  const otherDetails = page("/intake/temporary-work/spouse-partner/other-details");
  const otherNames = question(otherDetails, "other_names");

  assert.equal(question(otherDetails, "has_other_names").required, true);
  assert.equal(otherNames.required, false);
  assert.equal(question(otherNames, "family_name").required, true);
  assert.equal(question(otherNames, "given_names").required, true);
  assert.equal(question(otherNames, "reason_for_change").required, true);
  assert.equal(question(otherNames, "evidence_type").required, false);
});
