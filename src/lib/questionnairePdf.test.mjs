import assert from "node:assert/strict";
import test from "node:test";
import {
  createQuestionnairePdf,
  createQuestionnairePdfBytes,
  getQuestionnairePdfMetadata,
} from "./questionnairePdf.js";

const application = { type: "Protection Visa (Subclass 866)", reference: "Jane Doe - Protection Visa" };
const questionnaire = {
  profiles: [{ id: "main", relationship: "main_applicant", given_names: "Jane", family_name: "Doe" }],
};
const definition = { visaType: "protection" };

test("PDF metadata uses the main applicant and a safe attachment filename", () => {
  assert.deepEqual(getQuestionnairePdfMetadata({ application, questionnaire, definition }), {
    applicantName: "Jane Doe",
    applicationType: "Protection Visa (Subclass 866)",
    eyebrow: "PROTECTION VISA / SUBCLASS 866",
    filename: "Jane-Doe-questionnaire-answers.pdf",
    utf8Filename: "Jane Doe-questionnaire-answers.pdf",
    title: "Questionnaire answers - Jane Doe",
  });
});

test("PDF metadata provides unique ASCII fallbacks and Unicode download names", () => {
  const chinese = getQuestionnairePdfMetadata({
    application: { id: "application-100", type: "Partner" },
    questionnaire: {
      profiles: [{ id: "main", relationship: "main_applicant", given_names: "张", family_name: "伟" }],
    },
  });
  const arabic = getQuestionnairePdfMetadata({
    application: { id: "application-200", type: "Partner" },
    questionnaire: {
      profiles: [{ id: "main", relationship: "main_applicant", given_names: "محمد", family_name: "علي" }],
    },
  });
  assert.equal(chinese.filename, "application-100-questionnaire-answers.pdf");
  assert.equal(chinese.utf8Filename, "张 伟-questionnaire-answers.pdf");
  assert.equal(arabic.filename, "application-200-questionnaire-answers.pdf");
  assert.equal(arabic.utf8Filename, "محمد علي-questionnaire-answers.pdf");
});

test("PDF metadata uses the current Skills in Demand label for legacy 482 matters", () => {
  const metadata = getQuestionnairePdfMetadata({
    application: { type: "Temporary Work (Subclass 482)", applicantName: "Alex Doe" },
    questionnaire: { visaContext: "482" },
    definition: { visaType: "temporary-work", visaContext: "482" },
  });
  assert.equal(metadata.applicationType, "Skills in Demand (subclass 482)");
  assert.equal(metadata.eyebrow, "SKILLS IN DEMAND / SUBCLASS 482");
});

test("questionnaire PDF embeds a multilingual font for recorded Unicode text", () => {
  const unicodeQuestionnaire = {
    profiles: [{ id: "main", relationship: "main_applicant", given_names: "张伟", family_name: "محمد" }],
  };
  const groups = [{
    key: "profile:main",
    title: "张伟 محمد",
    subtitle: "Main Applicant",
    type: "applicant",
    sections: [{
      key: "details",
      title: "Details",
      answers: [{
        question: "Preferred script",
        answer: "中文 / العربية / Русский",
      }, {
        question: "Optional symbol",
        answer: "😀",
      }],
    }],
  }];

  const { document } = createQuestionnairePdf({
    application: { id: "application-300", type: "Partner" },
    questionnaire: unicodeQuestionnaire,
    groups,
  });
  assert.deepEqual(document.getFontList().PlyLegalQuestionnaireUnicode, ["normal"]);
  assert.match(document.internal.pages[1].join(" "), /U\+1F600/);

  const { bytes } = createQuestionnairePdfBytes({
    application: { id: "application-300", type: "Partner" },
    questionnaire: unicodeQuestionnaire,
    groups,
  });
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("ascii"), "%PDF-");
  assert.ok(bytes.byteLength < 1_000_000, "the embedded font should be subset in the PDF");
});

test("questionnaire PDF bytes are valid and paginate long answer tables", () => {
  const answers = Array.from({ length: 70 }, (_, index) => ({
    question: `Question ${index + 1} with enough wording to exercise the wrapped table layout`,
    answer: index % 2 ? "No" : "A recorded answer",
  }));
  const groups = [{
    key: "profile:main",
    title: "Jane Doe",
    subtitle: "Main Applicant",
    type: "applicant",
    sections: [{ key: "details", title: "Details", answers }],
  }];

  const { document } = createQuestionnairePdf({ application, questionnaire, definition, groups });
  assert.ok(document.getNumberOfPages() > 1);
  assert.ok(document.getNumberOfPages() <= 4);
  assert.match(document.internal.pages[1].join(" "), /Question 1/);
  assert.match(document.internal.pages[2].join(" "), /APPLICANT 01 \/ CONTINUED/);
  assert.match(document.internal.pages[2].join(" "), /Jane Doe \/ Details/);

  const { bytes, metadata } = createQuestionnairePdfBytes({ application, questionnaire, definition, groups });
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("ascii"), "%PDF-");
  assert.match(Buffer.from(bytes.subarray(-16)).toString("ascii"), /%%EOF/);
  assert.equal(metadata.filename, "Jane-Doe-questionnaire-answers.pdf");
});

test("section headings stay with their first table row near a page boundary", () => {
  const rows = (prefix, length) => Array.from({ length }, (_, index) => ({
    question: `${prefix} question ${index + 1}`,
    answer: "Recorded answer",
  }));
  const groups = [{
    key: "profile:main",
    title: "Jane Doe",
    subtitle: "Main Applicant",
    type: "applicant",
    sections: [
      { key: "first", title: "First section", answers: rows("First", 5) },
      { key: "second", title: "Second section", answers: rows("Second", 28) },
    ],
  }];

  const { document } = createQuestionnairePdf({ application, questionnaire, definition, groups });
  const pages = document.internal.pages.slice(1).map((page) => page.join(" "));
  const headingPage = pages.find((page) => page.includes("Second section"));
  assert.ok(headingPage);
  assert.match(headingPage, /Second question 1/);
});
