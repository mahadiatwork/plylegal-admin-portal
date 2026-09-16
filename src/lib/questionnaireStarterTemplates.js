// Starter copied from the client portal's bundled 482 Character questionnaire.
// Keep routes and answer keys aligned with temporaryWork482.definition.js in that portal.
const YES_NO_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const CHARACTER_QUESTIONS = [
  {
    key: "char_q01",
    label: "Has any applicant ever been charged with any offence that is currently awaiting legal action?",
  },
  {
    key: "char_q02",
    label: "Has any applicant ever been convicted of an offence in any country (including any conviction which is now removed from official records)?",
  },
  {
    key: "char_q03",
    label: "Has any applicant ever been the subject of a domestic violence or family violence order, or any other order, of a tribunal or court or other similar authority, for the personal protection of another person?",
  },
  {
    key: "char_q04",
    label: "Has any applicant ever been the subject of an arrest warrant or Interpol notice?",
  },
  {
    key: "char_q05",
    label: "Has any applicant ever been found guilty of a sexually based offence involving a child (including where no conviction was recorded)?",
  },
  {
    key: "char_q06",
    label: "Has any applicant ever been named on a sex offender register?",
  },
  {
    key: "char_q07",
    label: "Has any applicant ever been acquitted of any offence on the grounds of unsoundness of mind or insanity?",
  },
  {
    key: "char_q08",
    label: "Has any applicant ever been found by a court not fit to plead?",
  },
  {
    key: "char_q09",
    label: "Has any applicant ever been directly or indirectly involved in, or associated with, activities which would represent a risk to national security in Australia or any other country?",
  },
  {
    key: "char_q10",
    label: "Has any applicant ever been charged with, or indicted for: genocide, war crimes, crimes against humanity, torture, slavery, or any other crime that is otherwise of a serious international concern?",
  },
  {
    key: "char_q11",
    label: "Has any applicant ever been associated with a person, group or organisation that has been or is involved in criminal conduct?",
  },
  {
    key: "char_q12",
    label: "Has any applicant ever been associated with an organisation engaged in violence or engaged in acts of violence (including war, insurgency, freedom fighting, terrorism, protest) either overseas or in Australia?",
  },
  {
    key: "char_q13",
    label: "Has any applicant ever served in a military force, police force, state sponsored / private militia or intelligence agency (including secret police)?",
  },
  {
    key: "char_q14",
    label: "Has any applicant ever undergone any military/paramilitary training, been trained in weapons/explosives or in the manufacture of chemical/biological products?",
  },
  {
    key: "char_q15",
    label: "Has any applicant ever been involved in people smuggling or people trafficking offences?",
  },
  {
    key: "char_q16",
    label: "Has any applicant ever been removed, deported or excluded from any country (including Australia)?",
  },
  {
    key: "char_q17",
    label: "Has any applicant ever overstayed a visa in any country (including Australia)?",
  },
  {
    key: "char_q18",
    label: "Has any applicant ever had any outstanding debts to the Australian Government or any public authority in Australia?",
  },
];

function makeCharacterQuestion(question, index) {
  const displayNumber = String(index + 1).padStart(2, "0");
  return {
    id: question.key,
    answerKey: question.key,
    label: question.label,
    type: "yesNo",
    required: true,
    defaultValue: "no",
    options: YES_NO_OPTIONS,
    followUps: [
      {
        id: `${question.key}_applicant_name`,
        answerKey: `${question.key}_applicant_name`,
        label: "Which applicant does this declaration apply to?",
        type: "select",
        required: false,
        optionsSource: "applicants",
        placeholder: "Choose Applicant",
        visibleIf: [{ field: question.key, op: "equals", value: "yes" }],
      },
      {
        id: `${question.key}_details`,
        answerKey: `${question.key}_details`,
        label: "Give details",
        type: "textarea",
        required: false,
        rows: 4,
        placeholder: "Please provide full details as requested in the instructions above...",
        visibleIf: [{ field: question.key, op: "equals", value: "yes" }],
      },
    ],
    metadata: {
      displayNumber,
    },
  };
}

export const temporaryWork482Definition = {
  id: "temporary-work-482-v1",
  visaType: "temporary-work",
  visaContext: "482",
  title: "Skills in Demand Visa Questionnaire",
  version: "1.0.0",
  status: "active",
  schemaVersion: 1,
  revision: 0,
  pages: [
    {
      id: "all-applicants-character",
      route: "/intake/temporary-work/all-applicants/character",
      title: "Character",
      sectionKey: "temporary_work_character",
      completionKey: "temporary-work/all-applicants/character",
      scope: "shared",
      order: 140,
      introBlocks: [
        {
          type: "paragraph",
          text: "If the applicant answers 'Yes' to any of the character declarations they must give all relevant details. For combined applications, state which applicant the declaration applies to.",
        },
        {
          type: "list",
          lead: "If the matter relates to a criminal conviction, provide:",
          items: [
            "the date and nature of the offence",
            "full details of the sentence",
            "dates of any period of imprisonment or other detention.",
          ],
        },
      ],
      questions: CHARACTER_QUESTIONS.map(makeCharacterQuestion),
    },
  ],
};

export const questionnaireDefinitions = [temporaryWork482Definition];

