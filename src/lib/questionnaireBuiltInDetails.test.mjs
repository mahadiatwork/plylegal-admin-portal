import assert from "node:assert/strict";
import test from "node:test";
import { applyQuestionnaireBuiltInDetails } from "./questionnaireBuiltInDetails.js";
import { isQuestionVisible } from "./questionnaireAnswerModel.js";

const pages = applyQuestionnaireBuiltInDetails([
  { id: "main", route: "/intake/temporary-work/main-applicant/details", questions: [] },
  { id: "spouse", route: "/intake/temporary-work/spouse-partner/details", questions: [] },
  { id: "child", route: "/intake/temporary-work/children/child-profile/details", questions: [] },
]);

test("482/186 Details match shipped client labels/order/groups and exclude old requester fields", () => {
  const [main, spouse, child] = pages;
  assert.deepEqual(main.questions.map((question) => question.answerKey), ["family_name", "given_names", "gender", "birth", "marital_status", "marital_status_date", "country_of_birth", "city_of_birth", "state_of_birth", "citizenship_of_passport_country", "citizenship_other_than_birth", "citizenships"]);
  assert.deepEqual(child.questions.map((question) => question.answerKey), main.questions.map((question) => question.answerKey));
  assert.equal(spouse.questions.at(-1).answerKey, "preferred_names");
  assert.equal(main.questions[0].metadata.group, "Personal Information");
  assert.equal(main.questions[6].metadata.group, "Birthplace Information");
  assert.equal(main.questions[9].label, "Is this applicant a citizen of their country of passport?");
  assert.equal(main.questions[10].label, "Is this applicant a citizen of any other country?");
  assert.ok(main.metadata.hiddenAnswerKeys.includes("completing_family_name"));
  assert.equal(main.questions.some((question) => question.answerKey.startsWith("completing_")), false);
  assert.equal(main.questions[3].type, "dateParts");
  assert.deepEqual(main.questions[3].parts, { day: "birth_day", month: "birth_month", year: "birth_year" });
});

test("marital dates and other citizenships obey the client's visible branches", () => {
  const maritalDate = pages[0].questions.find((question) => question.answerKey === "marital_status_date");
  const citizenships = pages[0].questions.find((question) => question.answerKey === "citizenships");
  assert.equal(isQuestionVisible(maritalDate, { marital_status: "Never Married" }), false);
  assert.equal(isQuestionVisible(maritalDate, {}), false);
  assert.equal(isQuestionVisible(maritalDate, { marital_status: "Married" }), true);
  assert.equal(maritalDate.metadata.labelByValue.labels.Divorced, "Date of Divorce");
  assert.equal(isQuestionVisible(citizenships, { citizenship_other_than_birth: "no" }), false);
  assert.equal(isQuestionVisible(citizenships, { citizenship_other_than_birth: "yes" }), true);
  const ceased = citizenships.metadata.fields.find((question) => question.answerKey === "date_ceased");
  assert.equal(isQuestionVisible(ceased, { still_citizen: "yes" }), false);
  assert.equal(isQuestionVisible(ceased, { still_citizen: "no" }), true);
});

test("partner/protection shared Details include full fields and the actual dependent relationship branch", () => {
  for (const visaType of ["partner", "protection"]) {
    const [spouse, child] = applyQuestionnaireBuiltInDetails([
      { id: `${visaType}-spouse`, route: `/intake/${visaType}/spouse-partner/details` },
      { id: `${visaType}-child`, route: `/intake/${visaType}/children/child-profile/details` },
    ]);
    assert.ok(spouse.questions.find((question) => question.answerKey === "birth"));
    assert.ok(spouse.questions.find((question) => question.answerKey === "citizenships"));
    assert.equal(spouse.questions.at(-1).answerKey, "preferred_names");
    const relationship = child.questions.at(-1);
    assert.equal(relationship.answerKey, "relationship_to_spouse");
    assert.equal(relationship.metadata.requiresSpouse, true);
  }
});
