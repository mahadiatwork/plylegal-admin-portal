import assert from "node:assert/strict";
import test from "node:test";
import { getBuiltInQuestionnaireDefinition } from "./questionnaireBuiltIns.js";
import { buildQuestionnaireAnswerGroups, calculateQuestionnaireAnswerProgress, isQuestionnaireAnswerSectionComplete } from "./questionnaireAnswerModel.js";

function bySection(groups, id, suffix) {
  return groups.find((group) => group.key === `profile:${id}`).items.find((item) => item.page.route.endsWith(`/${suffix}`));
}
const questionnaire = {
  started: true,
  profiles: [
    { id: "main", relationship: "main_applicant", given_names: "Alex", family_name: "Main" },
    { id: "spouse", relationship: "spouse", given_names: "Sam", family_name: "Spouse" },
    { id: "child-a", relationship: "child", given_names: "First", family_name: "Child" },
    { id: "child-b", relationship: "child", given_names: "Second", family_name: "Child" },
  ],
  profiles_data: {
    main: { details: { country_of_birth: "Australia", marital_status: "Married", marital_status_date_day: "1", marital_status_date_month: "2", marital_status_date_year: "2000", count: 0 } },
    spouse: { details: { country_of_birth: "Canada", citizenship_other_than_birth: "no", flag: false }, identity: { has_passport: "no" } },
    "child-a": { details: { country_of_birth: "Australia" }, custody: { under_18: true, primary_custody: { has: false, details: "Court order" }, other_person_rights: { has: false }, travel_impediments: { has: false } } },
    "child-b": { details: { country_of_birth: "Canada" }, custody: { under_18: false } },
  },
  non_migrating_members: [{ id: "parent", relationship: "parent", passport: { family_name: "Family", given_names: "Other" }, citizenship: { has_other: "no", countries: [] } }],
};

for (const audience of [{ visaType: "temporary-work", visaContext: "482", total: 33 }, { visaType: "temporary-work", visaContext: "186", total: 35 }, { visaType: "partner", total: 50 }, { visaType: "protection", total: 36 }]) {
  test(`${audience.visaContext || audience.visaType} bundled catalog preserves every person's real Details/Custody and scoped completion`, () => {
    const definition = getBuiltInQuestionnaireDefinition(audience);
    const groups = buildQuestionnaireAnswerGroups(definition, questionnaire);
    assert.equal(groups.filter((group) => group.type === "applicant").length, 4);
    assert.equal(bySection(groups, "main", "details").data.country_of_birth, "Australia");
    assert.equal(bySection(groups, "spouse", "details").data.country_of_birth, "Canada");
    assert.equal(bySection(groups, "main", "details").data.count, 0);
    assert.equal(bySection(groups, "spouse", "details").data.flag, false);
    assert.equal(bySection(groups, "child-a", "details").data.country_of_birth, "Australia");
    assert.equal(bySection(groups, "child-b", "details").data.country_of_birth, "Canada");
    assert.equal(bySection(groups, "child-a", "custody").data.primary_custody_has, "no");
    assert.equal(bySection(groups, "child-a", "custody").data.primary_custody_details, "Court order");
    assert.equal(bySection(groups, "child-b", "custody").data.under_18, "no");
    assert.ok(groups.find((group) => group.key === "nonMigrating:parent"));
    if (audience.visaType !== "temporary-work") {
      const relationship = bySection(groups, "child-a", "details").page.questions.find((question) => question.answerKey === "relationship_to_spouse");
      assert.equal(relationship.label, "This person is Sam Spouse's:");
      const withoutSpouse = buildQuestionnaireAnswerGroups(definition, { ...questionnaire, profiles: questionnaire.profiles.filter((profile) => profile.relationship !== "spouse") });
      assert.equal(bySection(withoutSpouse, "child-a", "details").page.questions.some((question) => question.answerKey === "relationship_to_spouse"), false);
    }
    const prefix = audience.visaType;
    const completion = { [`${prefix}/children/child-a/custody__child-a`]: true };
    assert.equal(isQuestionnaireAnswerSectionComplete(bySection(groups, "child-a", "custody"), completion), true);
    assert.equal(isQuestionnaireAnswerSectionComplete(bySection(groups, "child-b", "custody"), completion), false);
    assert.deepEqual(calculateQuestionnaireAnswerProgress(groups, completion), { completedSections: 1, totalSections: audience.total, percentage: Math.round(100 / audience.total) });
  });
}
