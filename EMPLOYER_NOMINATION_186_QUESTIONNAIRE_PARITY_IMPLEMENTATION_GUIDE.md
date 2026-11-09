# Employer Nomination (Subclass 186) Questionnaire Parity Implementation Guide

**Status:** Ready for implementation  
**Audit date:** 9 November 2026  
**Admin repository:** `F:\Work Projects\ply-legal-admin-portal`  
**Client repository:** `F:\Work Projects\plylegal-client-portal`  
**Companion guides:** `SKILLS_IN_DEMAND_482_QUESTIONNAIRE_PARITY_IMPLEMENTATION_GUIDE.md`, `PROTECTION_866_QUESTIONNAIRE_PARITY_IMPLEMENTATION_GUIDE.md`  
**Current implementation notes:** `EXCLUSIONS.md` in both repositories

## 1. Outcome

Make the Admin Portal questionnaire builder a complete and trustworthy editor for every active Employer Nomination subclass 186 questionnaire page rendered by the Client Portal.

The implementation must:

1. Preserve the current **new/proposed Client-style builder layout**. Extend that layout; do not replace or redesign it.
2. Represent all 28 active 186 content-page templates, including the five-page spouse journey.
3. Represent every active top-level question, fixed record group, repeater, popup field, option, condition, validation rule, and profile-scoped answer path.
4. Make all safe client-facing content editable: titles, introductions, paragraphs, lists, section headings, labels, help text, placeholders, option labels, table headings, popup titles and descriptions, empty states, action labels, counters, and validation messages.
5. Preserve exact client ordering, grouping, requiredness, conditional visibility, option values, answer paths, row presentation, and completion behavior.
6. Preserve the 186-only behavior: ten-year employment wording, the Australia-only `visa_held` field, and spouse Education and Language pages.
7. Reuse genuinely shared 482/186 infrastructure without importing 482-specific behavior into 186.
8. Keep 482 and 186 definitions isolated even though they share `/intake/temporary-work/*` routes and React source files.
9. Preserve stable page IDs, question IDs, `answerKey` values, routes, section keys, completion keys, profile IDs, and existing saved-answer paths.
10. Never expose an admin edit that the active client renderer cannot consume.
11. Never promote an incomplete legacy page to the dynamic renderer merely because missing copy was added.
12. Protect saved questionnaires and administrator-edited wording during catalog upgrades.
13. Prove parity with an automated audit, paired 482/186 regression tests, and desktop/mobile visual evidence.

This is not only a spouse-page patch. Employment, Spouse Education, and Spouse Language are the first three 186 acceptance fixtures, but every shared and profile-dependent page must pass the same audit.

## 2. Relationship to the current 482 and 866 work

The worktrees already contain in-progress shared infrastructure and a partial 482 implementation. Read both repositories' `EXCLUSIONS.md` files before starting 186 work.

At this audit point, the 482 work has added:

- `src/lib/questionnaireBuiltInRecordEnrichment.js` for visa-neutral date grouping, country sources, and repeater presentation fallback;
- `src/lib/questionnaireBuiltInTemporaryWork482Enrichment.js` for selected 482 pages;
- `scripts/audit-temporary-work-482-parity.mjs`;
- recursive proposed-builder controls and schema validation;
- legacy-copy support for `RepeaterTable` chrome;
- full nested-copy consumption only for the Skills dialogs;
- a Path B decision for Visas: the unmounted nested history dialog remains inactive and its ghost catalog node is removed while saved `history` data is preserved.

The current 482 implementation is not a complete shared temporary-work implementation. Its exclusions explicitly leave Health, Education, Language, Identity, Other Names, Details, non-migrating pages, Child Custody, residence coverage metadata, Character synchronization, workflow pages, migration/versioning, and most legacy dialog copy consumers unfinished.

For 186:

1. Reuse the visa-neutral record/schema/builder work.
2. Extract truly identical temporary-work page reconciliation from the 482-specific module into a neutral shared module.
3. Keep 482 overrides in a 482 layer.
4. Add a dedicated 186 override layer.
5. Complete shared pages for both contexts rather than making 186 the only corrected definition.
6. Do not call `applyQuestionnaireBuiltInTemporaryWork482Enrichment()` for 186: it hardcodes five-year employment copy and removes `visa_held`.
7. Re-run both audits after every shared change.

The target architecture should be conceptually:

```text
generated temporary-work pages
        |
        v
shared temporary-work reconciliation
        |
        +--> 482 context overrides
        |
        +--> 186 context overrides
        |
        v
shared details/identity/choices/conditions
        |
        v
date/country/presentation finalization
```

Do not duplicate hundreds of lines of 482 enrichment under a new 186 filename. Parameterize behavior only where the rendered contract is actually shared.

## 3. Confirmed architecture and root causes

### 3.1 The 186 built-in currently receives no temporary-work parity enrichment

`src/lib/questionnaireBuiltIns.js` currently builds `built-in-temporary-work-186` by cloning every generated `/intake/temporary-work/` page, applying the older shared Details, Identity, Character, Choices, and Conditional Rules enrichers, and appending the Character page.

Only `visaContext === "482"` receives:

- `applyQuestionnaireBuiltInTemporaryWork482Enrichment()`;
- `finalizeTemporaryWork482Enrichment()`;
- `applyRepeaterPresentationFallback()`.

As a result, 186 still has raw extractor output for all 27 legacy pages. It contains generic date/country fields, missing popup presentation, storage-only fields presented as normal questions, a ghost Visas history record, and page titles such as `Employment` instead of their rendered client titles.

### 3.2 Shared source files do not imply identical context behavior

The client uses the same page component for many 482 and 186 routes, but reads `draftStore.visaContext` to change behavior.

Confirmed 186 differences are:

| Concern | 186 behavior | 482 behavior |
| --- | --- | --- |
| Employment history heading/help | Previous 10 years | Previous 5 years |
| `visa_held` nested employment field | Visible and required when country is Australia | Absent |
| Spouse Other Names | Active | Active |
| Spouse Education | Active | Excluded |
| Spouse Language | Active | Excluded |
| Spouse route count | Five | Three |

The catalog must encode these differences. Presentation-time filtering alone is unsafe because a later dynamic promotion could expose or hide the wrong fields.

### 3.3 The extractor sees syntax, not the mounted experience

`scripts/extract-questionnaire-built-ins.cjs` remains a starting point rather than the authority. It does not reliably capture:

- ordered body paragraphs and lists;
- popup headings and descriptions;
- table columns and row formatting;
- shared component defaults;
- group semantics for date parts and addresses;
- applicant, country, language, and qualification option sources;
- derived and context-dependent conditions;
- cross-field/cross-row completion rules;
- profile-scoped storage fallback behavior;
- whether a locally declared component is actually mounted.

The Visas page demonstrates the final issue. Its source declares a full `VisaDialog`, but the active rendered page never mounts it. The raw 186 catalog still reports the declared nested history as active. The 482 implementation chose Path B and removed this ghost from its catalog. Apply the same active-UI decision to 186 unless product explicitly reopens and implements Visa history for both contexts.

### 3.4 The proposed builder and client legacy-copy bridge are only partially complete

The proposed layout now has shared nested/presentation editing work in progress. The client `RepeaterTable` can consume presentation chrome, but only the Skills dialogs currently consume all nested editable labels, placeholders, and popup sections.

For 186, the bridge must also support:

- the Employment popup and its conditional Australia-only field;
- Spouse Education's long scrollable popup;
- both Spouse Language popup types;
- the remaining shared 482/186 dialogs;
- full field-path resolution where labels repeat.

Never claim an admin field is editable until its legacy client component reads the corresponding copy path.

### 3.5 Static route arrays omit an active spouse page

`EMPLOYER_NOMINATION_ROUTES` lists spouse Details, Identity, Education, and Language, but omits Other Names. `EMPLOYER_NOMINATION_SPOUSE_PROFILE_SUBPAGES` and `getDynamicTemporaryWorkRoutes("186")` correctly include:

1. Details
2. Other Names
3. Identity
4. Education
5. Language

The dynamic route builder is the authoritative journey contract. Static-array-only tests will miss an active route.

### 3.6 Character is sourced from a 482-named definition for both contexts

`src/lib/questionnaireBuiltIns.js` appends a Character page cloned from `temporaryWork482Definition` for both 482 and 186. The client also maintains `src/lib/questionnaires/temporaryWork482.definition.js`.

The content may intentionally be shared, but the naming and duplicate maintenance conceal that contract. Create a context-neutral temporary-work Character fixture or generation step and test it against both 482 and 186. Do not change persisted question IDs merely to rename the module.

### 3.7 Product naming is inconsistent

Current strings include:

- `Employer Nomination Visa (186)`;
- `Employer Nomination Visa (Subclass 186)`;
- `Employer Nomination (subclass 186)`;
- `Employer Nomination Scheme (Subclass 186)`.

Obtain a product/legal decision for the canonical display name. Apply it consistently to new UI copy, PDFs, headers, selectors, and built-in titles while preserving stable definition IDs and the `visaContext: "186"` selector. Treat this as a copy migration, not an excuse to rename persisted keys.

## 4. Non-negotiable guardrails

- Read both repositories' `AGENTS.md` files before editing.
- This project uses a breaking-change version of Next.js. Read the relevant guide under `node_modules/next/dist/docs/` before changing Next.js code.
- Read both `EXCLUSIONS.md` files and the current diffs before touching overlapping code.
- Run `git status --short` in both repositories before and after every logical phase.
- Preserve all current user and coding-agent changes.
- Do not hand-edit `src/lib/questionnaireBuiltInPages.js`; regenerate it.
- Do not call the 482-specific enrichment for 186.
- Do not copy five-year employment wording into 186.
- Do not remove or globally hide `visa_held`; it is active for 186 Australian rows.
- Do not show `visa_held` for a non-Australian row.
- Do not add Spouse Education or Language to 482 while sharing code.
- Do not omit Spouse Other Names from 186 because the static route array omits it.
- Do not merge day/month/year answer keys.
- Do not turn a fixed object group into an Add/Edit list.
- Do not duplicate long country or language lists into saved definitions when an allowlisted source can be used.
- Do not treat source-declared but unmounted components as active UI.
- Do not invent an employment no-gap/continuous-coverage rule. The current 186 client enforces row completeness and ten-year wording, not continuous coverage.
- Do not weaken submit completion to make a dynamic page appear complete.
- Do not silently correct copy, requiredness, or legal wording without a recorded product decision.
- Do not overwrite administrator-edited copy during catalog migration.
- Do not publish directly to a live definition during development. Use a Test copy.
- Do not consider a popup checked until its entire scrollable contents have been inspected at desktop and mobile widths.

## 5. Source-of-truth hierarchy

When evidence conflicts, use this order:

1. **`getDynamicTemporaryWorkRoutes("186")`** determines the active profile-dependent journey.
2. **Actually rendered Client Portal JSX under a 186 draft context** determines active fields, copy, ordering, controls, and conditions.
3. **Client schemas, submit handlers, `submitCompletion.js`, and residence coverage logic** determine validation and completion.
4. **Draft-store reads/writes and registered field paths** determine persisted answer paths and legacy fallbacks.
5. **Shared UI primitives** determine default table, dialog, action, and empty-state content.
6. **Screenshots and E2E behavior** confirm presentation and context branching.
7. **Unmounted source components** are product evidence, not active questionnaire content.
8. **The admin built-in definition** is extraction output to reconcile, not the authority.

For every route, record the source file, route constructor, storage section, profile scope, completion key, visa-context rule, and shared components before editing its catalog entry.

## 6. Current 186 baseline snapshot

The current built-in definition reports:

| Measure | Current value |
| --- | ---: |
| Definition ID | `built-in-temporary-work-186` |
| Content-page templates | 28 |
| Legacy-rendered pages | 27 |
| Dynamic pages | 1 |
| Top-level question nodes | 182 |
| Nested/follow-up nodes | 349 |
| Total question nodes | 531 |
| Extracted repeater/record nodes | 43 |
| Captured descriptions/help strings | 6 |
| Conditional nodes | 100 |
| Captured placeholders | 72 |
| Pages with no captured intro | 1 |
| Record nodes marked `collection: "object"` | 4 |
| Nested repeaters | 2 |

Current type counts:

| Type | Count |
| --- | ---: |
| `text` | 259 |
| `radio` | 5 |
| `dateParts` | 28 |
| `select` | 69 |
| `yesNo` | 88 |
| `repeater` | 43 |
| `textarea` | 39 |

A simple key heuristic finds approximately 84 date-like fields and 35 country/nationality-like fields still represented as generic text. Treat these as audit leads, not a target count.

The final node/repeater counts should change when date parts are grouped and the inactive Visas history node is removed. Explain every count change with a semantic manifest diff. Do not compare 186 directly with the already-enriched 482 node count; compare stable paths and context rules.

## 7. Scope reconciliation

### 7.1 Active 186 content templates

**Main Applicant — eight pages**

1. Details
2. Other Names
3. Identity
4. Contact Details
5. Employment
6. Education
7. Skills
8. Language

**Spouse/Partner — five pages**

1. Details
2. Other Names (`other-details` route)
3. Identity
4. Education
5. Language

**Dependent Child — four reusable templates**

1. Details
2. Other Names
3. Identity
4. Custody

**Non-migrating family member — six reusable templates**

1. Details
2. Passport
3. Identity Documents
4. Other Names
5. Citizenship
6. Health

**All Applicants — five pages**

1. Visas
2. Travel History
3. Countries of Residence
4. Health
5. Character

### 7.2 Workflow pages

These are active user-facing screens but are excluded by the content-page extractor:

- Getting Started (`/start`)
- Included Applicants (`/profile`)
- Other Family/non-migrating index
- Children index, which is reachable from the sidebar but omitted from linear navigation
- Review and Submit (`/submit`)

The 482 work currently classifies these as locked workflow pages. For 186, explicitly confirm that decision or provide a dedicated workflow-copy editor. Do not silently omit them while claiming complete parity.

### 7.3 Inactive temporary-work source files

Audit and classify these without automatically adding them:

- `app/intake/temporary-work/all-applicants/addresses/page.js`
- `app/intake/temporary-work/all-applicants/contact-details/page.js`
- `app/intake/temporary-work/dependents/page.js`
- `app/intake/temporary-work/relationships/page.js`
- `app/intake/temporary-work/main-applicant/details-other/page.js`

Unlike 482, spouse Education and Language are active 186 routes and must not appear in this exclusion list.

### 7.4 Dynamic 186 journey order

`getDynamicTemporaryWorkRoutes("186")` constructs:

1. Start
2. Profile
3. Main Applicant Details, Other Names, Identity, Contact Details
4. Other Family index
5. Six pages for each non-migrating member
6. Main Applicant Employment, Education, Skills, Language
7. Five spouse pages when a spouse profile exists
8. Four pages for each dependent child
9. Five All Applicants pages
10. Submit

The Children index is a sidebar-only exception. Test zero, one, and multiple spouse/child/non-migrating scenarios, including path and `profileId` query parameters.

## 8. Acceptance fixture A — 186 Employment

Employment is the primary context-bound fixture.

### 8.1 Page and current-employment block

Preserve:

- title `Main Applicant's Employment`;
- intro `In this section, provide details about the main applicant's employment history.`;
- question `Are you currently Employed in a paid position?`;
- Yes/No values and current default behavior.

When currently employed, the client collects:

- Employer/Organization Name;
- Position/Occupation;
- Country through the shared country source;
- Employment Type: Full-time, Part-time, Contract, Self-Employed;
- Date Started as day/month/year selects;
- Current Workplace Address with `Street, City, State, Postcode` placeholder;
- Current Duties / Notes with a 300-character maximum and visible counter.

`still_working` and `current_end_date_day/month/year` are compatibility/storage fields. Keep them round-trippable, but lock or hide them in the normal admin content editor.

### 8.2 Ten-year history content

The 186 client renders:

- heading `Employment History (last 10 years)`;
- help `Enter details of your employment history for the previous 10 years`.

Do not use 482's five-year wording or 866's since-birth/no-gap wording.

The current client does not enforce continuous ten-year coverage in `submitCompletion.js`. Do not attach a `continuousHistoryCoverage` validator merely because another enrichment contains one. If product wants real coverage enforcement, treat that as a separate behavior change with legal/product approval and client implementation.

### 8.3 Employment History popup

Preserve these active fields and conditions:

| Field/group | Client behavior |
| --- | --- |
| `is_current_employment` | Yes/No |
| Date From day/month/year | Required grouped selects |
| Date To day/month/year | Optional/ongoing grouped selects |
| `status` | Required select |
| `position_type` | Full-time, Part-time, Casual |
| `position` | Visible/relevant for employed statuses; required by completion for Employed/Self-Employed |
| `employer` | Required by completion for Employed/Self-Employed |
| `employer_address` | Workplace Address, active placeholder |
| `country` | Required country select |
| `visa_held` | **186 only; visible when Country = Australia; required by completion then** |
| `city` | City/Town |
| `duties` | Textarea, maximum 300 characters and counter |
| `is_related_to_nominated_position` | Yes/No |

The `visa_held` label and placeholder are:

- `What visa(s) were held during this period?`
- `e.g., Employer Nomination (subclass 186)`

Encode both its context and its country condition in the definition:

```js
visaContexts: ["186"],
visibleIf: [{ field: "country", op: "equals", value: "Australia" }]
```

Add a reviewed conditional-required validator matching `submitCompletion.js`. Do not rely only on `questionnaireClientPresentation.js` to infer the condition.

Status options are:

- Employed
- Student
- Retired
- Self-Employed
- Unemployed
- Work Experience/Internships
- Unpaid Employment/Volunteer

Table columns remain:

- Date From
- Date To
- Status
- Position
- Employer
- Duties
- Country

The table does not need a Visa Held column merely because the popup contains the field.

### 8.4 Employment validation and persistence

Preserve the existing completion contract:

- the current-employment question must be answered;
- current employer, position, country, start date, employment type, and address are required when currently employed;
- at least one history row is required when not currently employed;
- each row requires Date From, status, and country;
- Employed and Self-Employed rows require position and employer;
- an Australian 186 row requires `visa_held`;
- non-Australian rows do not require or display `visa_held`;
- 482 rows never display or require it;
- existing stored rows with `visa_held` continue to round-trip.

### 8.5 Employment acceptance test

A passing fixture must prove:

1. The admin proposed layout shows ten-year heading/help.
2. The popup exposes every active field in order.
3. Date groups retain their individual storage keys.
4. Country = Australia reveals `visa_held` and makes it completion-required.
5. Another country hides the field without destroying an existing compatibility value unexpectedly.
6. The 482 catalog and client never expose the field.
7. Table formatting shows grouped dates and `Ongoing` safely.
8. Copy-only edits are consumed by the legacy client.
9. Existing 186 answers load, edit, save, and complete.

## 9. Acceptance fixture B — Spouse/Partner Education

This page is active only for a 186 spouse profile.

### 9.1 Route, title, storage, and completion

- Route: `/intake/temporary-work/spouse-partner/education?profileId={spouseId}`
- Title: `Spouse/Partner's Education`
- Intro: `In this section, provide details about the spouse/partner's education history.`
- Profile storage: `profiles_data[profileId].education`
- Legacy fallback: `temporary_work_spouse_education`
- Profile completion key: `temporary-work/spouse-partner/education__{profileId}`

Preserve the fallback while ensuring new profile-scoped data takes priority.

### 9.2 Top-level question and condition

Question:

`Have you ever undertaken or enrolled in any studies or training at secondary level or above? (including: high school, college/vocational schools, university, research/thesis, specialised training, skill/trade qualifications)?`

The Education History record is visible only when Yes. Completion requires an answer; when Yes, at least one complete row is required.

### 9.3 Education History popup

Preserve these 18 stored fields and visual grouping:

| Key/group | Label/behavior |
| --- | --- |
| `date_from_day/month/year` | Date From, required grouped selects |
| `date_to_day/month/year` | Date To (leave blank if ongoing), optional grouped selects |
| `qualification` | Qualification Type/Course Type, required select |
| `is_highest_qualification` | Is this your highest level of qualification?, required Yes/No |
| `course_name` | Course Name or Research Description, required |
| `course_language` | Course Language, required select |
| `course_status` | Course Status, required select |
| `institution` | Institution Name, required |
| `country` | Country, required country select |
| `institution_address` | Address (including Street Number and Name), required |
| `institution_suburb` | Suburb/Town/City, required |
| `institution_state` | State, required |
| `institution_postcode` | Postcode, required |
| `certificate_number` | Compatibility/optional field; verify whether rendered before exposing |

The popup contains the internal heading `Institution Details` and uses a scrollable `max-h-[70vh]` body. Preserve accessible dialog scrolling and visible footer actions.

Qualification values are:

- Secondary
- Diploma/Certificate
- Bachelor's
- Master's
- Doctorate/PhD
- Other

Course Status values are:

- Completed
- Current/Ongoing
- Deferred
- Withdrawn

Course Language uses the current reviewed option set. Country must use the shared country option source rather than another copied list.

Table columns are:

- Institution
- Qualification
- Course Name
- Year Started
- Country

Capture popup placeholders:

- Choose Day / Choose Month / Choose Year
- Choose Type
- Choose Language
- Choose Status
- Choose Country

Capture all current required messages, including date parts, qualification, course fields, institution details, and address fields.

### 9.4 Education completion contract

`submitCompletion.js` requires every Yes-row to contain:

- Date From day/month/year;
- qualification;
- highest-qualification answer;
- course name;
- course language;
- course status;
- institution;
- country;
- institution address;
- suburb/town/city;
- state;
- postcode.

Date To and certificate number are not required by current completion logic. Do not make them required silently.

### 9.5 Education acceptance test

Prove:

1. The route appears only for a 186 spouse.
2. The admin shows the exact page title, intro, top question, condition, and all nested fields.
3. The 18 stored keys remain stable.
4. Date and option sources preview correctly.
5. Table/popup/action copy is editable and consumed by the legacy client.
6. Profile storage wins over legacy fallback.
7. An incomplete Yes-row blocks completion.
8. 482 routes and definitions remain unchanged and exclude this page.

## 10. Acceptance fixture C — Spouse/Partner Language

This page is also active only for a 186 spouse profile.

### 10.1 Route, title, storage, and completion

- Route: `/intake/temporary-work/spouse-partner/language?profileId={spouseId}`
- Title: `Spouse/Partner's Language`
- Intro: `In this section, provide details about the spouse/partner's language proficiency.`
- Profile storage: `profiles_data[profileId].language`
- Legacy fallback: `temporary_work_spouse_language`
- Profile completion key: `temporary-work/spouse-partner/language__{profileId}`

### 10.2 Main-language question and Languages Used popup

Top question:

`Is the English language your main language?`

When No, show `Languages Used` and require at least one complete row.

Row fields:

| Key | Label/control |
| --- | --- |
| `language` | Language, required select from `COMMON_LANGUAGES` |
| `proficiency` | Proficiency, required select |
| `is_main_language` | Is this your main language?, required Yes/No, default No |

Proficiency values are Basic, Intermediate, Proficient, and Fluent/Native.

Table columns are Language, Proficiency, and Main Language?. Use an allowlisted Yes/No formatter rather than executable JSON.

Placeholders are `Choose Language` and `Choose Proficiency`. Preserve Language and Proficiency required messages.

### 10.3 English test question and popup

Top question:

`Have you undertaken any English language test within the last 36 months?`

When Yes, show `English Test Results` and require complete rows containing:

| Key/group | Label/behavior |
| --- | --- |
| `test_type` | Test Type, required select |
| `date_day/month/year` | Date, required grouped selects |
| `location` | Location/Test Centre, required |
| `reference_number` | Reference/Registration Number, required |
| `overall_score` | Overall Score, required |
| `listening` | Listening, optional |
| `reading` | Reading, optional |
| `writing` | Writing, optional |
| `speaking` | Speaking, optional |

Test Type values are:

- IELTS Academic
- IELTS General
- PTE Academic
- TOEFL iBT
- OET
- Other

The optional scores are grouped under `Sub-scores (optional)`.

Table columns are Date, Test Type, Location, Reference Number, and Overall Score. Use a safe grouped-date formatter with the three source keys.

### 10.4 English-medium study question

Question:

`Has the applicant studied in a secondary and / or tertiary institution where the instruction was in English?`

When Yes, require `studied_in_english_details` at completion. Preserve:

- label `Please provide details (institution name, course, years attended)`;
- placeholder `e.g. University of Melbourne – Bachelor of Commerce, 2018–2021`;
- four-row textarea presentation.

### 10.5 Language acceptance test

Prove:

1. The route appears only for a 186 spouse.
2. All three top-level questions and both repeaters are present.
3. Both popup schemas, option sets, placeholders, validation messages, and table columns match.
4. Conditional details and completion logic match `submitCompletion.js`.
5. Profile storage and legacy fallback round-trip.
6. Editable copy reaches both legacy dialogs.
7. 482 does not gain the page.

## 11. Acceptance fixture D — Shared temporary-work parity

The other 26 pages are shared in source or template shape, but they still require 186 verification.

### 11.1 Shared-page relationship table

| Page group | Expected relationship to 482 | 186-specific check |
| --- | --- | --- |
| Main Details/Other/Identity/Contact | Same rendered contract | Context remains 186 through navigation and save |
| Main Employment | Shared base | Ten years and Australia-only `visa_held` |
| Main Education/Skills/Language | Same rendered contract | Copy/options/completion still tested under 186 |
| Spouse Details/Other/Identity | Same profile template | Five-page spouse order and profile paths |
| Spouse Education/Language | 186-only | Full fixtures in Sections 9–10 |
| Child templates | Same | Profile-scoped routes and completion under 186 |
| Non-migrating templates | Same | Six pages and context preservation |
| All Applicants | Same active UI | Shared copy, validation, and Path B Visas decision |
| Character | Intended shared dynamic contract | Remove 482-named source ambiguity |

### 11.2 Visas Path B must be consistent

The current active Visas page renders only:

- the Australian visa-grant-number question;
- applicant selection;
- Australian Visa Grant Number;
- add/delete grant-record actions;
- the no-applicants message.

The declared `VisaDialog` is unmounted. The 482 work chose Path B:

- do not activate the dialog;
- remove its ghost nested `history` question from the active catalog;
- preserve each stored row's `history` property for compatibility.

Apply the same decision to 186. If product reopens Path A, implement the history UI for both contexts before exposing any of its fields in admin.

### 11.3 Shared enrichment must remain symmetric

When a shared correction is made—such as Travel intro lists, Contact fixed-object presentation, Health popup headings, or Character synchronization—add a test against both definitions. A shared page should not be correct in 482 and raw in 186.

## 12. Complete 28-page audit matrix

These counts describe the current raw 186 definition. `Nested` includes popup fields and follow-ups. `Records` includes repeaters, fixed objects represented as repeaters, nested arrays, and multi-select arrays.

| Scope/page | Top | Nested | Records | Conditions | Help | Intro | Priority checks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Main — Details | 12 | 6 | 1 | 4 | 2 | 1 | Citizenship popup and page title |
| Main — Other Names | 2 | 12 | 1 | 1 | 0 | 1 | Popup fields and direct applicant wording |
| Main — Identity | 11 | 36 | 5 | 11 | 0 | 1 | Passports, IDs, country sources |
| Main — Contact Details | 7 | 5 | 1 | 0 | 0 | 1 | Fixed address object and migration fallback |
| Main — Employment | 15 | 17 | 1 | 9 | 0 | 1 | Ten years and `visa_held` condition |
| Main — Education | 2 | 18 | 1 | 1 | 0 | 1 | Shared education contract |
| Main — Skills | 4 | 25 | 2 | 3 | 0 | 1 | Reuse complete Skills fixture |
| Main — Language | 6 | 14 | 2 | 3 | 0 | 1 | Shared language contract |
| Spouse — Details | 13 | 6 | 1 | 4 | 2 | 1 | Profile title and citizenship popup |
| Spouse — Other Names | 4 | 12 | 1 | 1 | 0 | 1 | Static route omission |
| Spouse — Identity | 5 | 23 | 3 | 3 | 0 | 1 | Passport and identity popup parity |
| Spouse — Education | 2 | 18 | 1 | 1 | 0 | 1 | 186-only fixture |
| Spouse — Language | 6 | 14 | 2 | 3 | 0 | 1 | 186-only fixture |
| Child — Details | 12 | 6 | 1 | 4 | 2 | 1 | Per-child title and citizenship popup |
| Child — Other Names | 2 | 12 | 1 | 0 | 0 | 1 | Profile paths and popup copy |
| Child — Identity | 7 | 23 | 3 | 4 | 0 | 1 | Passport and identity popup parity |
| Child — Custody | 7 | 0 | 0 | 0 | 0 | 0 | Missing captured intro and legal copy |
| Non-migrating — Details | 9 | 0 | 0 | 0 | 0 | 1 | Template interpolation |
| Non-migrating — Passport | 7 | 0 | 0 | 0 | 0 | 1 | Passport controls and validation |
| Non-migrating — Identity Documents | 2 | 0 | 0 | 0 | 0 | 1 | Control semantics |
| Non-migrating — Other Names | 1 | 3 | 1 | 0 | 0 | 1 | Repeater and profile paths |
| Non-migrating — Citizenship | 2 | 0 | 0 | 0 | 0 | 1 | Country source |
| Non-migrating — Health | 1 | 0 | 0 | 0 | 0 | 1 | Page-specific question |
| All — Visas | 2 | 4 | 2 | 0 | 0 | 1 | Apply Path B and preserve storage |
| All — Travel History | 2 | 12 | 2 | 2 | 0 | 2 | Full intro/list, multi-applicant selector |
| All — Countries of Residence | 1 | 13 | 1 | 0 | 0 | 1 | Coverage validator and empty state |
| All — Health | 20 | 34 | 10 | 10 | 0 | 1 | Ten distinct popup contracts |
| All — Character | 18 | 36 | 0 | 36 | 0 | 2 | Shared dynamic source contract |

Matching counts are not sufficient. Verify copy, option values, grouping, conditions, persistence, and completion for every row.

## 13. Complete record/repeater inventory

The current extractor reports 43 record-style nodes. Classify each as `array`, `fixed-object`, `nested-array`, or `multi-select-array`.

### 13.1 Main Applicant — 14

| Page | Record key | Current fields | Key checks |
| --- | --- | ---: | --- |
| Details | `citizenships` | 6 | Country/date semantics and help |
| Other Names | `other_names` | 12 | Popup copy/options |
| Identity | `passports` | 12 | Passport validation and country |
| Identity | `national_id_card` | 6 | Gate and document fields |
| Identity | `other_identity_documents` | 5 | Document type/options |
| Identity | `citizenships` | 10 | Acquisition/renunciation conditions |
| Identity | `pr_countries` | 3 | Country and residence rights |
| Contact Details | `residential_address` | 5 | **Fixed object**, not an Add/Edit list |
| Employment | `employment_history` | 17 | Ten-year content and `visa_held` |
| Education | `education_history` | 18 | Date groups and options |
| Skills | `registrations` | 13 | Conditional English details |
| Skills | `assessments` | 12 | Conditional outcome date |
| Language | `languages` | 3 | Common language source and Yes/No formatter |
| Language | `english_tests` | 11 | Test options/date/scores |

### 13.2 Spouse/Partner — eight

| Page | Record key | Current fields | Key checks |
| --- | --- | ---: | --- |
| Details | `citizenships` | 6 | Profile path and country source |
| Other Names | `other_names` | 12 | Active route and direct wording |
| Identity | `passports` | 12 | Profile storage |
| Identity | `national_id_card` | 6 | Gate and validation |
| Identity | `other_identity_documents` | 5 | Options and popup copy |
| Education | `education_history` | 18 | 186-only, full Section 9 fixture |
| Language | `languages` | 3 | 186-only, full Section 10 fixture |
| Language | `english_tests` | 11 | 186-only, full Section 10 fixture |

### 13.3 Dependent Child — five templates

| Page | Record key | Fields |
| --- | --- | ---: |
| Details | `citizenships` | 6 |
| Other Names | `other_names` | 12 |
| Identity | `passports` | 12 |
| Identity | `national_id_card` | 6 |
| Identity | `other_identity_documents` | 5 |

### 13.4 Non-migrating member — one template

| Page | Record key | Fields |
| --- | --- | ---: |
| Other Names | `other_names` | 3 |

### 13.5 All Applicants — 15 current nodes

| Page | Record key | Current fields | Key checks |
| --- | --- | ---: | --- |
| Visas | `visa_grant_entries` | 3 | Applicant/grant fields; compatibility history property |
| Visas | `history` | 1 generic field | Ghost node to remove under Path B |
| Travel | `travel_history` | 11 | Popup schema and date formatting |
| Travel | `applicant_ids` | 1 | Multi-applicant selector, not normal repeater |
| Countries | `residence_records` | 13 | Cross-row coverage |
| Health | `health_examinations` | 6 | Correct popup title and applicant source |
| Health | `visited_outside_details` | 8 | Country/date details |
| Health | `hospital_details` | 3 | Correct hospital-specific presentation |
| Health | `healthcare_work_details` | 3 | Correct healthcare-work presentation |
| Health | `aged_care_work_details` | 3 | Correct aged-care presentation |
| Health | `childcare_work_details` | 2 | Correct childcare presentation |
| Health | `classroom_work_details` | 2 | Correct classroom presentation |
| Health | `tuberculosis_details` | 2 | Applicant and TB details |
| Health | `health_conditions_details` | 3 | Applicant, condition, details |
| Health | `medical_assistance_details` | 2 | Applicant and assistance details |

After Path B, the active semantic record count is expected to drop by one. Preserve the `history` storage property without representing an unmounted UI as a question.

## 14. Shared high-risk page contracts

### 14.1 Skills

The complete 482 Skills fixture applies to 186 unchanged. Reuse the reconciled schema for:

- Occupational Registrations/Licences/Memberships;
- conditional English requirement details;
- country and issue/expiry dates;
- Skills Assessments;
- assessment type and outcome options;
- Pending versus completed outcome-date validation;
- both table/popup presentation contracts.

Add a paired definition test proving identical semantic field paths for Skills in 482 and 186.

### 14.2 Contact Details

`residential_address` is a fixed object, not a repeating list. Preserve Contact Information, Emergency Contact, Usual Country of Residence, and Residential Address groups.

Preserve the migration fallback from `temporary_work_addresses.address_history[0]`. Add the same regression under 186 context.

### 14.3 Travel History

Preserve the full question and explanatory content, including travel for:

- work, study, or training;
- business;
- holiday/leisure;
- military deployment;
- visits back to the applicant's own country.

Preserve under-16 guidance, multi-applicant selection, country, reason, conditional other reason, legal status, arrival date, and departure date.

Do not store computed `arrival_display`/`departure_display` fields. Use source keys and allowlisted formatters.

### 14.4 Countries of Residence

Preserve applicant selection, dates, address fields, and the exact empty state `No countries of residence added yet`.

Attach the reviewed `residenceHistoryCoverage` validator so coverage is checked based on age, the last ten years, or since age 16, through today. This rule already exists in client completion logic and applies to 186.

### 14.5 Health

The raw definition still applies the first health question's wording to multiple record nodes. Reconcile all ten conditional detail records independently. Each needs:

- the exact opening question;
- actual section/popup title;
- correct applicant option source;
- nested fields and options;
- table columns and formatters;
- full chrome copy;
- completion rules.

Make the shared Health correction affect both 482 and 186.

### 14.6 Character

Character contains 18 required Yes/No declarations, defaulting to No, with two follow-ups for every Yes:

- applicant select;
- `Give details` textarea.

Preserve both intro blocks and `char_q01` through `char_q18`. The current follow-ups remain `required: false` despite copy instructing users to give all relevant details. Treat any change as an explicit legal/product decision.

Create one shared source contract for both contexts and preserve compatibility with `allApplicantsParity.js`.

## 15. Required parity manifest

Create a deterministic machine-readable fixture, for example:

`scripts/fixtures/temporary-work-186-parity.json`

### 15.1 Definition fields

- definition ID/title;
- `visaType: "temporary-work"`;
- `visaContext: "186"` and `visaContexts: ["186"]`;
- schema/catalog version;
- expected renderer per page;
- canonical display-name decision;
- fixture checksum/version.

### 15.2 Page fields

- stable ID;
- route or route template;
- source file;
- scope and profile role;
- active contexts;
- title/template and interpolation tokens;
- ordered intro blocks;
- section key;
- completion key/template;
- storage path and legacy fallback;
- renderer;
- route prerequisites.

### 15.3 Question fields

- ID and `answerKey`;
- field path and persisted path;
- label/display label;
- type/presentation control;
- required/default/read-only/storage-only status;
- placeholder/help/prefix/suffix/rows/max length;
- option values/labels or allowlisted source;
- visibility conditions;
- context restrictions;
- validator IDs, parameters, and messages;
- original legacy-copy baseline.

### 15.4 Record/popup fields

- collection kind;
- nested field order/groups;
- popup titles/descriptions/section headings;
- add/edit/delete/cancel/confirm/empty copy;
- desktop/mobile table columns;
- source keys and formatter IDs;
- minimum rows;
- collection validators;
- nested collection path;
- profile-scoped path and fallback.

### 15.5 Audit statuses

Use explicit statuses:

- `matched`;
- `missing-admin`;
- `missing-client-consumer`;
- `wrong-copy`;
- `wrong-type`;
- `wrong-options`;
- `wrong-condition`;
- `wrong-requiredness`;
- `wrong-validation`;
- `wrong-context`;
- `wrong-storage-path`;
- `inactive-source`;
- `workflow-locked-with-approval`.

The audit must exit non-zero for every unresolved active mismatch.

## 16. Metadata and runtime requirements

### 16.1 Context-aware shared enrichment

Prefer a shared API such as:

```js
applyQuestionnaireBuiltInTemporaryWorkEnrichment(pages, {
  visaContext: "186",
  employmentHistoryYears: 10,
  includeAustralianVisaHeld: true,
  includeSpouseEducation: true,
  includeSpouseLanguage: true,
});
```

This is illustrative, not a mandate for the exact signature. The implementation must make context differences explicit and testable. Do not use scattered string replacements after a 482 definition is built.

### 16.2 Field groups without storage changes

Use metadata to group date parts while preserving three stored keys. Apply the same approach to address groups, score groups, and popup sections.

### 16.3 Allowlisted sources

Support reviewed sources for:

- countries;
- applicants;
- profiles by role;
- common languages;
- qualification/course types;
- day/month/year ranges;
- English test types;
- Skills assessment types/outcomes.

Validate source IDs and parameters in both admin and client. Never execute arbitrary source names from saved JSON.

### 16.4 Safe formatters

Required allowlisted formatters include:

- grouped date;
- grouped date or `Ongoing`;
- year from grouped date;
- applicant name(s) from IDs;
- Yes/No;
- comma-separated labels.

Formatter inputs must resolve to actual row keys. Retain compatibility aliases if already-saved definitions use older formatter IDs.

### 16.5 Declarative validation

Use reviewed IDs/parameters for:

- required complete date;
- optional date all-or-none;
- end date not before start date;
- required when another field equals a value;
- required when status belongs to a set;
- required for 186 + Australia;
- minimum one row when Yes;
- residence-history coverage;
- max length and email format.

Do not serialize JavaScript functions into questionnaire JSON.

### 16.6 Presentation model

Every active record needs one schema consumed by admin preview, legacy copy, and dynamic rendering:

- `collection` kind;
- `fields`;
- `presentation.addLabel`;
- add/edit dialog titles;
- dialog subtitle and sections;
- empty copy;
- columns with source keys/formatters;
- action labels;
- cancel/confirm labels.

Fixed objects must not expose add/delete actions.

## 17. Step-by-step implementation plan

### Step 0 — Freeze and document the baseline

1. Read both `AGENTS.md` files.
2. Read relevant Next.js 16 documentation under `node_modules/next/dist/docs/`.
3. Read the 482/866 guides and both `EXCLUSIONS.md` files.
4. Run `git status --short` in both repositories.
5. Review every current diff in files 186 work will touch.
6. Export the current 186 built-in definition.
7. Record the current `QUESTIONNAIRE_LEGACY_CATALOG_VERSION`; it is 3 at this audit but may change.
8. Create a Test copy of the 186 questionnaire.
9. Create profile scenarios: main only; main + spouse; main + child; main + non-migrating; combined profiles.
10. Capture every route and fully opened popup at desktop/mobile widths.

Exit condition: a reproducible pre-change snapshot exists without changing production definitions.

### Step 1 — Build the 186 audit first

Create `scripts/audit-temporary-work-186-parity.mjs` or equivalent.

The audit must:

1. load `getBuiltInQuestionnaireDefinition({ visaType: "temporary-work", visaContext: "186" })`;
2. compare active routes from `getDynamicTemporaryWorkRoutes("186")` with the manifest;
3. distinguish workflow routes and inactive source files;
4. recursively inspect questions, follow-ups, fields, and nested collections;
5. detect missing/extra pages, fields, copy, options, conditions, validations, and presentation;
6. detect generic date/country controls without reviewed metadata;
7. assert five spouse pages;
8. assert ten-year Employment copy;
9. assert `visa_held` is 186-only, Australia-only, and conditionally required;
10. assert Visas Path B while preserving compatibility storage;
11. validate all column/formatter source keys;
12. compare shared semantic paths against 482 and report unexplained divergence;
13. emit JSON and Markdown;
14. exit non-zero until all active mismatches are resolved.

Do not design the audit to pass the current catalog. Design it to encode the rendered contract.

### Step 2 — Reconcile routes and naming

1. Make the dynamic route builder the tested authority.
2. Fix or document the static route omission of spouse Other Names.
3. Assert Education and Language are present only in the 186 spouse subpage list.
4. Assert all child/non-migrating templates and workflow exceptions.
5. Test zero/one/multiple dynamic profiles.
6. Classify inactive source files.
7. Record the workflow-copy decision.
8. Obtain the canonical 186 display-name decision and add a copy-migration plan.

Exit condition: routes, admin inventory, naming, and the manifest agree.

### Step 3 — Refactor shared temporary-work reconciliation

1. Identify every context-neutral function in the current 482 enrichment.
2. Move shared Skills, Contact, Visas Path B, Travel, date/country finalization, and presentation logic to a neutral temporary-work module.
3. Complete the shared pages still listed in `EXCLUSIONS.md`.
4. Keep five-year copy and `visa_held` removal in the 482 override.
5. Add ten-year copy, `visa_held`, and spouse-only pages in the 186 override.
6. Use the neutral record enrichment module for generic mechanics.
7. Avoid importing a Protection-named helper except through compatibility aliases.
8. Add paired tests so shared changes affect both contexts.

Exit condition: shared semantics have one implementation and context differences are explicit overlays.

### Step 4 — Improve extraction and regenerate

Improve the extractor only for reliably generic patterns:

1. ordered intro paragraphs/lists;
2. mounted `RepeaterTable` presentation props;
3. explicit shared-component fields;
4. date group metadata with stable keys;
5. reviewed option-source IDs;
6. fixed object groups;
7. mounted-component detection;
8. statically resolvable context guards.

Keep product/runtime knowledge in enrichment:

- 186/482 context differences;
- profile title interpolation;
- storage fallbacks;
- derived conditions;
- cross-row validators;
- row formatters;
- popup copy assembled through composition.

Regenerate `questionnaireBuiltInPages.js`. Never patch it by hand.

Exit condition: regeneration plus shared/context enrichment produces the manifest deterministically.

### Step 5 — Finish proposed-builder editing in the current design

1. Recursively expose nested fields/follow-ups.
2. Show full field paths.
3. Distinguish arrays, fixed objects, nested arrays, and multi-select arrays.
4. Edit popup title/subtitle/sections and chrome.
5. Edit table labels while source keys stay controlled.
6. Preview allowlisted formatters.
7. Edit option labels without silently changing values.
8. Display conditions and `visaContexts` plainly.
9. Expose approved validation messages/parameters.
10. Lock storage-only compatibility fields.
11. Warn when edits promote a legacy page.
12. Block promotion until the structural parity gate passes.
13. Preserve the current layout's typography, spacing, cards, responsive behavior, and save model.

Add focused component tests for 186 Employment, Spouse Education, and Spouse Language.

Exit condition: every manifest node is editable or explicitly locked for a valid reason.

### Step 6 — Complete legacy client copy consumption

1. Pass stable full `fieldName` paths to every relevant `RepeaterTable` and dialog.
2. Resolve copy by path before legacy label fallback.
3. Consume columns, popup titles, sections, empty text, and action labels.
4. Consume nested labels, help, placeholders, and option labels.
5. Support fixed groups without record actions.
6. Support ordered intro paragraphs/lists.
7. Support safe person-name interpolation.
8. Preserve stored values/validation for copy-only edits.
9. Add collision tests for repeated labels.
10. Implement and test consumers for Employment, Education, and both Language dialogs.

Exit condition: every editable legacy-copy value has a runtime consumer.

### Step 7 — Implement the three 186 fixtures

1. Reconcile Employment exactly as Section 8.
2. Reconcile Spouse Education exactly as Section 9.
3. Reconcile Spouse Language exactly as Section 10.
4. Run the 186 audit after each fixture.
5. Run paired 482 regression tests.
6. Compare admin preview against the rendered 186 client at desktop/mobile widths.

Exit condition: all fixture acceptance tests pass without 482 leakage.

### Step 8 — Reconcile every remaining page

Recommended sequence:

1. Shared Skills and Contact.
2. Visas Path B.
3. Travel and Countries of Residence.
4. Health's ten detail records.
5. Main Education and Language.
6. Details/Other Names/Identity for main/spouse/child.
7. Six non-migrating templates.
8. Child Custody.
9. Character source contract.
10. Workflow pages.

After every page, update the manifest, run both audits, run focused tests, and record approved deviations.

Exit condition: no active 186 node has an unresolved status.

### Step 9 — Gate structural edits and dynamic promotion

Before a legacy page becomes dynamic, prove:

1. all visible blocks/fields exist;
2. profile storage/fallback paths match;
3. defaults/normalization match;
4. options and values match;
5. context and visibility conditions match;
6. requiredness and validators match;
7. completion/navigation match;
8. record types and presentation match;
9. legacy answers round-trip;
10. desktop/mobile/accessibility pass;
11. 482/186 paired regressions pass.

Until then, permit only legacy-safe copy edits.

Exit condition: renderer changes are explicit and per-page tested.

### Step 10 — Upgrade saved definitions safely

1. Re-read the catalog version after shared work merges.
2. Coordinate a single version bump; do not blindly increment 3 if another migration already did so.
3. Merge by stable IDs/paths.
4. Add missing baseline fields/metadata.
5. Preserve administrator-edited copy/options/presentation.
6. Preserve intentional custom deletions and additions.
7. Preserve revisions/status/publication history.
8. Make migration idempotent.
9. Test pre-migration, partially edited, and already-upgraded 186 fixtures.
10. Produce a dry-run report.

Exit condition: rerunning the migration yields no changes and loses no admin content.

### Step 11 — Verify and roll out

1. Run all tests in Section 20.
2. Require zero unresolved 186 audit issues.
3. Require the 482 audit to remain clean relative to its completed scope.
4. Test all profile scenarios.
5. Compare 186 and 482 side by side.
6. Test existing and blank drafts.
7. Test desktop/mobile and full popup scroll.
8. Test keyboard/focus/labels/errors.
9. Publish a Test copy.
10. Obtain product/legal copy approval.
11. Promote through the controlled publication flow with rollback instructions.

Exit condition: Section 21's Definition of Done is fully evidenced.

## 18. Per-page checking worksheet

### Route and identity

- [ ] Active in `getDynamicTemporaryWorkRoutes("186")`
- [ ] Correct route/profile query
- [ ] Correct page ID/scope
- [ ] Correct storage path/fallback
- [ ] Correct completion key
- [ ] Correct `visaContexts`
- [ ] Correct renderer

### Page content

- [ ] Title/interpolation
- [ ] Intro paragraphs/lists
- [ ] Section headings
- [ ] Guidance/warnings/notes
- [ ] Empty/no-applicant states
- [ ] Workflow/navigation copy where in scope

### Questions

- [ ] Stable ID/`answerKey`
- [ ] Full persisted path
- [ ] Label/display label
- [ ] Type/control
- [ ] Required/default state
- [ ] Placeholder/help/rows/max length
- [ ] Options values/labels/source
- [ ] Visibility/context conditions
- [ ] Validation/message
- [ ] Storage-only/computed status

### Records and popups

- [ ] Collection kind
- [ ] Add label/title
- [ ] Edit title
- [ ] Popup descriptions/sections
- [ ] Nested field order
- [ ] Nested conditions/validation
- [ ] Columns/mobile labels
- [ ] Formatter/source keys
- [ ] Empty/action/cancel/confirm copy
- [ ] Minimum rows/collection validators
- [ ] Profile path/fallback

### Compatibility

- [ ] Existing answer loads
- [ ] Round-trip preserves compatibility keys
- [ ] Copy-only edit preserves values
- [ ] Completion matches legacy
- [ ] Migration is idempotent
- [ ] Paired 482 regression passes

### Admin behavior

- [ ] Proposed layout exposes all safe content
- [ ] Preview matches 186 client
- [ ] Context-specific fields are clearly marked
- [ ] Fixed groups are not repeaters
- [ ] Full paths prevent collisions
- [ ] Structural warning/gate is correct
- [ ] Save/reload and catalog upgrade preserve edits

## 19. File-by-file implementation map

### 19.1 Admin Portal

| File/area | Required work |
| --- | --- |
| `src/components/admin/AdminQuestionnaireBuilder.jsx` | Finish nested/presentation/context/validation editing in the proposed layout |
| `src/lib/questionnaireDefinitions.js` | Validate record kinds, sources, formatters, validators, contexts, and nested paths |
| `src/lib/questionnaireBuiltIns.js` | Add shared + 186 enrichment and coordinated migration/versioning |
| `src/lib/questionnaireBuiltInPages.js` | Regenerate only |
| `src/lib/questionnaireBuiltInRecordEnrichment.js` | Reuse neutral mechanics and compatibility aliases |
| `src/lib/questionnaireBuiltInTemporaryWork482Enrichment.js` | Reduce to true 482 overrides after shared extraction |
| new neutral temporary-work enrichment | Shared page contracts for both contexts |
| new `questionnaireBuiltInTemporaryWork186Enrichment.js` | Ten-year Employment, `visa_held`, spouse Education/Language |
| `src/lib/questionnaireStarterTemplates.js` | Replace 482-only Character maintenance with shared contract safely |
| `src/lib/questionnaireClientPresentation.js` | Retain safe preview grouping but stop using inference as catalog correctness |
| `scripts/extract-questionnaire-built-ins.cjs` | Improve reliable extraction and mounted-component filtering |
| `scripts/audit-temporary-work-186-parity.mjs` | New exhaustive audit |
| `test/questionnaireBuiltInTemporaryWork186.test.mjs` | New 186 catalog/fixture/context tests |
| catalog migration tests | Preservation/idempotence/context isolation |

Use the final shared module names chosen by the implementation. The architectural separation matters more than these suggested names.

### 19.2 Client Portal

| File/area | Required work |
| --- | --- |
| `src/lib/routes.js` | Dynamic 186 route contract and static Other Names reconciliation |
| `src/lib/submitCompletion.js` | Treat as authority; add 186 fixture tests before changes |
| `src/components/RepeaterTable.jsx` | Complete path-aware presentation copy |
| `src/lib/questionnaires/legacyCopy.js` | Resolve nested copy/presentation by stable full paths |
| questionnaire renderer components | Support approved groups/sources/formatters/validators |
| `app/intake/temporary-work/main-applicant/employment/page.js` | Ten-year/Australia visa fixture and legacy-copy consumers |
| `app/intake/temporary-work/spouse-partner/education/page.js` | Full nested/presentation copy consumer and profile storage fixture |
| `app/intake/temporary-work/spouse-partner/language/page.js` | Both dialogs and conditional copy consumer |
| shared temporary-work route files | Complete page-by-page shared parity |
| `src/lib/questionnaires/temporaryWork482.definition.js` | Replace duplicate/named Character maintenance with shared contract safely |
| `e2e/questionnaire-186.spec.js` | Extend popup, context, storage, and validation coverage |

## 20. Verification requirements

### 20.1 Admin tests

Add tests proving:

- exactly 28 active content templates;
- 27 legacy and one dynamic page until deliberate promotion;
- five spouse pages including Other Names;
- all 43 current record nodes are classified or intentionally removed;
- ten-year Employment copy;
- Australia-only conditional/required `visa_held`;
- 482 exclusion of `visa_held`;
- complete Spouse Education schema/presentation;
- complete Spouse Language schemas/presentation;
- shared Skills parity with 482;
- Contact fixed-object behavior;
- Visas Path B and compatibility property;
- Travel intro/list and multi-applicant selector;
- residence coverage validator;
- ten distinct Health presentation contracts;
- exact shared Character contract;
- valid option sources/formatters/validators/interpolation tokens;
- no unresolved table source keys;
- no active generic date/country control without reviewed metadata;
- migration preserves overrides and is idempotent;
- proposed builder edits all fixture content.

Suggested commands, adjusted to current scripts:

```powershell
node scripts/audit-temporary-work-186-parity.mjs
node scripts/audit-temporary-work-482-parity.mjs
node --test test/questionnaireBuiltInTemporaryWork186.test.mjs
node --test "test/questionnaire*.test.mjs" "src/lib/questionnaire*.test.mjs"
npm run lint
npm run build
```

### 20.2 Client tests

Add or extend tests for:

- dynamic 186 routes under every profile scenario;
- five spouse pages and no fallback to `/applications/482/`;
- ten-year Employment heading/help;
- `visa_held` Australia visibility and submit completion;
- non-Australia and 482 exclusion;
- Spouse Education popup fields/options/validation/storage;
- Spouse Language's two repeaters and details condition;
- path-aware legacy copy for all three fixtures;
- shared page parity and Visas Path B;
- residence coverage boundaries;
- Health detail records;
- Character source synchronization;
- old saved answers and legacy fallbacks;
- publication revision selection.

Existing suites to extend:

- `e2e/questionnaire-186.spec.js`
- `e2e/questionnaire-482.spec.js`
- `e2e/main-applicant-identity-parity.spec.js`
- `test/questionnaireLegacyCopy.test.js`
- `test/questionnaireRepeaters.test.js`
- `test/allApplicantsParity.test.js`
- completion/validation/profile tests

Suggested commands:

```powershell
npm test
npm run check
npm run build
npx playwright test e2e/questionnaire-186.spec.js
npx playwright test e2e/questionnaire-482.spec.js
```

### 20.3 End-to-end matrix

| Scenario | Required evidence |
| --- | --- |
| Main only | 16-section flow, ten-year Employment, no spouse routes |
| Main + spouse | All five spouse pages and profile-scoped persistence |
| Main + child | Child templates and sidebar index exception |
| Main + non-migrating | All six templates after Other Family |
| Combined profiles | 31-section completion and no route/path collision |
| Australian employment row | `visa_held` visible/required/saved |
| Non-Australian employment row | `visa_held` hidden/not required |
| Same row under 482 | `visa_held` absent |
| Existing legacy spouse data | Fallback loads and profile save migrates safely |
| Copy-only publication | Legacy client consumes all edited fixture copy |
| Structural Test copy | Deliberate promotion passes full behavior gate |
| Desktop/mobile | Full popup scroll, footer, responsive tables |

## 21. Definition of Done

The 186 work is complete only when:

1. The 186 parity audit reports zero unresolved active mismatches.
2. All 28 content templates are represented and verified.
3. Workflow pages are editable or explicitly locked with approval.
4. Every active top-level/nested field appears exactly once.
5. Every record is correctly classified.
6. All safe copy has a tested admin edit path or approved lock.
7. Employment has ten-year content and no invented coverage rule.
8. `visa_held` is 186-only, Australia-only, conditionally required, and persisted.
9. Spouse Education passes its full fixture.
10. Spouse Language passes its full fixture.
11. Spouse Other Names is in the active route/catalog contract.
12. Shared pages are semantically aligned with 482 except documented context differences.
13. Visas follows the shared Path B decision without losing stored compatibility data.
14. Contact is a fixed object.
15. Travel includes all guidance and correct selectors/date presentation.
16. Residence coverage validation is preserved.
17. All ten Health detail records are accurate.
18. Character has one tested shared source contract.
19. Legacy copy resolves by stable full path.
20. Structural edits cannot activate incomplete dynamic pages.
21. Existing answers/completion round-trip without data loss.
22. Catalog migration preserves admin edits and is idempotent.
23. 482, 866, and Partner regressions pass.
24. Desktop/mobile/accessibility checks pass.
25. A Test copy is approved before production promotion.
26. The PR includes route, schema, screenshot, migration, test, and rollback evidence.

## 22. PR evidence checklist

- [ ] Before/after worktree status for both repositories
- [ ] Next.js 16 guide paths read
- [ ] Both `EXCLUSIONS.md` files reviewed and updated
- [ ] Baseline/final 186 audit reports
- [ ] Final 482 regression audit report
- [ ] Manifest diff with every count/path change explained
- [ ] Active/workflow/inactive file classification
- [ ] Canonical 186 display-name decision
- [ ] Employment desktop/mobile screenshots, including Australia `visa_held`
- [ ] Spouse Education full popup screenshots
- [ ] Spouse Language both popup screenshots
- [ ] Visas Path B evidence
- [ ] Travel/Residence/Health evidence
- [ ] Character shared-contract test
- [ ] Existing-answer/profile-fallback round-trip evidence
- [ ] Catalog migration dry-run/idempotence evidence
- [ ] Admin/client test outputs
- [ ] 186/482 paired regression outputs
- [ ] Publication and rollback steps

Do not close the work with “186 is the same as 482 plus two pages.” The ten-year Employment rules, conditional Australian visa field, five-page spouse journey, profile-scoped persistence, and all shared parity gaps must be proven independently.
