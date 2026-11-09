# Skills in Demand Visa (Subclass 482) Questionnaire Parity Implementation Guide

**Status:** Ready for implementation  
**Audit date:** 9 November 2026  
**Admin repository:** `F:\Work Projects\ply-legal-admin-portal`  
**Client repository:** `F:\Work Projects\plylegal-client-portal`  
**Companion guide:** `PROTECTION_866_QUESTIONNAIRE_PARITY_IMPLEMENTATION_GUIDE.md`

## 1. Outcome

Make the Admin Portal questionnaire builder a complete and trustworthy editor for every active Skills in Demand Visa (subclass 482) questionnaire page rendered by the Client Portal.

The implementation must:

1. Preserve the current **new/proposed Client-style builder layout**. Extend that layout; do not replace or redesign it.
2. Represent every active 482 page, top-level question, fixed record group, repeater, nested record, popup field, option, condition, and validation rule.
3. Make all client-facing content editable where the runtime can safely consume it: titles, introductions, paragraphs, lists, labels, help text, placeholders, headings, table columns, popup titles and subtitles, empty states, action labels, character counters, and validation messages.
4. Preserve exact client ordering, grouping, requiredness, conditions, option values, answer paths, row presentation, and completion behavior.
5. Keep subclass 482 behavior separate from subclass 186 even though both use `/intake/temporary-work/*` source files.
6. Preserve stable page IDs, question IDs, `answerKey` values, routes, section keys, completion keys, and existing saved-answer paths.
7. Never show a field as editable in the admin if the active client renderer cannot consume the edit.
8. Never promote an incomplete legacy page to the dynamic renderer merely because missing copy was added.
9. Protect saved questionnaires and administrator-edited wording during the built-in catalog upgrade.
10. Prove parity for all 26 active content-page templates, all 40 extracted record/repeater structures, all workflow pages in scope, and all profile-dependent route variants.

This is not a Skills-page-only patch. Skills is the first acceptance fixture because it exercises two complex popup schemas. Employment and Visas are additional mandatory fixtures because they expose 482/186 context leakage and dead-code extraction respectively.

## 2. Relationship to the ongoing 866 work

The current worktrees already contain in-progress 866 and shared questionnaire infrastructure changes. The 482 implementation must build on those changes instead of recreating them.

At the time of this audit, shared work includes or is expected to include:

- nested field editing in the proposed builder;
- repeater presentation controls;
- client legacy-copy support in `RepeaterTable`;
- schema allowlists for option sources, interpolation tokens, presentation metadata, and validator IDs;
- catalog enrichment and catalog-version migration logic.

Before starting 482 implementation:

1. Run `git status --short` in both repositories.
2. Re-read all current diffs; do not assume the companion 866 guide reflects the latest implementation.
3. Identify which changes are genuinely visa-neutral and finish or extract those into neutral modules.
4. Keep 866-specific copy, validators, and formatters in 866-specific enrichment.
5. Add 482-specific enrichment in a separate module.
6. Re-run the 482 baseline after the shared changes land because the counts in this guide are an audit snapshot, not immutable targets.

Do not import reusable 482 behavior from a file named for Protection. For example, date grouping, country option sources, repeater presentation, and safe formatter lookup belong in a neutral questionnaire module. Preserve compatibility aliases if an already-saved definition refers to a Protection-named formatter ID.

## 3. Confirmed architecture and root causes

### 3.1 The 482 built-in is mostly a generated legacy catalog

`src/lib/questionnaireBuiltIns.js` currently builds `built-in-temporary-work-482` by:

1. cloning generated pages from `src/lib/questionnaireBuiltInPages.js` whose routes start with `/intake/temporary-work/`;
2. excluding spouse Education and Language when `visaContext === "482"`;
3. applying shared Details, Identity, Character, Choices, and Conditional Rules enrichers;
4. appending a separately authored dynamic Character page from `src/lib/questionnaireStarterTemplates.js`.

The result currently has 25 pages with `metadata.renderer: "legacy"` and one dynamic Character page.

This split matters:

- Legacy pages render their original hard-coded React page inside `QuestionnaireCopyProvider`.
- Dynamic pages render entirely from the admin definition through `DynamicQuestionnairePage`.
- Copy-only edits can remain safe on a legacy page only when the relevant client component reads the copy context.
- Structural edits require a page-by-page dynamic parity gate.

### 3.2 The extractor sees source syntax, not the actual rendered experience

`scripts/extract-questionnaire-built-ins.cjs` extracts a useful first draft but cannot infer the full UI contract. It currently misses or simplifies:

- paragraphs and lists outside its recognised `CardHeader` pattern;
- popup headings and section descriptions;
- table columns and row formatting;
- shared component defaults and component-provided options;
- grouped date semantics;
- country, language, qualification, applicant, and profile option sources;
- conditions expressed through derived booleans, functions, or set membership;
- passthrough schemas;
- cross-field, cross-row, and date-range validation;
- profile-dependent title interpolation;
- whether a locally declared component is actually mounted.

The last point creates a concrete 482 defect: `all-applicants/visas/page.js` declares a large `VisaDialog`, but the active page never renders it. The extractor still discovers its schema and creates a misleading nested `history` field. AST presence is not proof that content is active.

### 3.3 The new builder historically exposed only the outer repeater

The proposed builder originally exposed the outer question title, help text, type, placeholder, required flag, and direct options, but not all nested `metadata.fields` or presentation metadata. The current worktree contains changes in this area; verify them rather than reimplementing them.

For 482, recursive editing must handle:

- a normal repeating list;
- a fixed object/record group represented by the extractor as a repeater;
- nested arrays, such as a visa record containing history rows;
- a multi-applicant selector stored as an array;
- grouped date parts that retain separate stored keys;
- conditional fields inside popup dialogs;
- context restrictions such as 186-only fields.

### 3.4 Subclasses 482 and 186 share source but not behavior

Most temporary-work pages are shared at the route and source-file level. A field appearing in a shared source file does not mean it belongs in both built-in definitions.

Confirmed differences include:

| Concern | Subclass 482 | Subclass 186 |
| --- | --- | --- |
| Main employment history period | Previous 5 years | Previous 10 years |
| Employment `visa_held` | Must not appear | Appears for Australian history rows |
| Spouse Other Names | Active | Active |
| Spouse Education | Excluded | Active |
| Spouse Language | Excluded | Active |
| Character route | Active | Active through shared temporary-work journey |

Presentation-time hiding is not enough. A 186-only field must be absent from or explicitly context-restricted in the 482 catalog so a later dynamic promotion cannot expose it.

### 3.5 Static route declarations do not describe the full profile-dependent journey

`TEMPORARY_WORK_VISA_ROUTES` omits spouse Other Names, while `TEMPORARY_WORK_482_SPOUSE_PROFILE_SUBPAGES` and `getDynamicTemporaryWorkRoutes()` include it. Children and non-migrating members are also expanded from live profile data.

The dynamic route builder is therefore the authoritative journey contract. Tests that inspect only the static array will miss active pages.

### 3.6 Character has two maintained definitions

The 482 Character content exists in both:

- Client: `src/lib/questionnaires/temporaryWork482.definition.js`
- Admin: `src/lib/questionnaireStarterTemplates.js`

Both currently describe 18 declarations. They can drift silently. Add a shared fixture, generation step, or cross-repository contract test so route, IDs, copy, options, and follow-ups cannot diverge.

## 4. Non-negotiable guardrails

- Read both repositories' `AGENTS.md` files before editing.
- This repository uses a breaking-change version of Next.js. Before changing Next.js code, read the relevant documentation under `node_modules/next/dist/docs/`.
- Run `git status --short` in both repositories before and after every logical phase.
- Preserve all existing user changes and the in-progress 866/shared infrastructure work.
- Do not hand-edit `src/lib/questionnaireBuiltInPages.js`; it is generated.
- Do not change stable IDs, `answerKey` values, routes, section keys, completion keys, or storage paths to make labels cleaner.
- Do not duplicate large country, language, or qualification lists into every definition. Use reviewed, allowlisted option sources.
- Do not treat source-declared but unmounted components as active UI.
- Do not add inactive routes to the live journey without a product decision.
- Do not treat a fixed object group as an add/delete list.
- Do not merge day, month, and year storage keys into one field.
- Do not rename persisted option values when only the display label needs editing.
- Do not copy the 866 instruction “since birth” or its no-gap rule into 482 employment. The current 482 requirement is the previous five years.
- Do not leak 186-only fields or pages into 482.
- Do not weaken client completion or validation logic to make a dynamic page pass.
- Do not overwrite administrator-edited copy during catalog migration.
- Do not publish directly to a production questionnaire during development. Use a test copy and controlled promotion.
- Do not consider a popup audited until its complete scrollable content has been checked at desktop and mobile widths.

## 5. Source-of-truth hierarchy

When evidence conflicts, use this order:

1. **Dynamic route construction** in `plylegal-client-portal/src/lib/routes.js` determines the current 482 journey.
2. **Actually rendered Client Portal JSX** determines active copy, fields, order, controls, and conditions.
3. **Page schemas, submit handlers, and completion logic** determine validation and requiredness.
4. **Draft-store reads/writes and field registration paths** determine persisted answer paths.
5. **Shared UI primitives** determine default table, popup, action, and empty-state copy.
6. **Screenshots** confirm presentation, but do not enumerate hidden or conditional content.
7. **Unmounted/dead source components** are product evidence, not active questionnaire content.
8. **The admin built-in JSON** is an extraction result to reconcile, not the authority.

For each route, capture the client source file, route constructor, storage section, completion key, profile scope, visa-context rule, and shared components before editing the catalog.

## 6. Baseline audit snapshot

The current 482 built-in contains:

| Measure | Current value |
| --- | ---: |
| Content-page templates | 26 |
| Legacy-rendered pages | 25 |
| Dynamic pages | 1 |
| Top-level question nodes | 174 |
| Nested/follow-up nodes | 317 |
| Total question nodes | 491 |
| Extracted repeater/record nodes | 40 |
| Captured descriptions/help strings | 6 |
| Conditional nodes | 96 |
| Captured placeholders | 72 |
| Pages with no captured intro | 1 |
| Generic text fields that appear to be date fragments | 63 |
| Generic text fields that appear to be country/nationality controls | 34 |
| Extracted record nodes marked `collection: "object"` | 4 |
| Nested repeaters | 2 |

Current type counts:

| Type | Count |
| --- | ---: |
| `dateParts` | 28 |
| `radio` | 5 |
| `repeater` | 40 |
| `select` | 63 |
| `text` | 235 |
| `textarea` | 38 |
| `yesNo` | 82 |

These are diagnostic counts, not acceptance targets. Counts may change when false-positive repeaters are removed, date parts gain presentation metadata, or missing active fields are added. Every intentional count change must be explained by a manifest diff.

The low help-text count is a clear warning: the rendered client contains substantially more explanatory and popup copy than the catalog captures.

## 7. Scope reconciliation

### 7.1 Active 482 content-page templates

The active templates are grouped by profile scope. The actual linear order is profile-dependent.

**Main Applicant — eight pages**

1. Details
2. Other Names
3. Identity
4. Contact Details
5. Employment
6. Education
7. Skills
8. Language

**Spouse/Partner — three pages**

1. Details
2. Other Names (`other-details` route)
3. Identity

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

### 7.2 Workflow pages excluded by the current extractor

These pages are part of the user experience even though they are not among the 26 content templates:

- Getting Started (`/start`)
- Included Applicants (`/profile`)
- Other Family/non-migrating index
- Children index, which is sidebar-reachable but intentionally omitted from the linear flow
- Review and Submit (`/submit`)

For each workflow page, choose and document one of two supported outcomes:

1. expose its safe content in a dedicated workflow-content editor; or
2. mark it as a reviewed, locked product page with a documented reason.

Do not silently omit workflow copy while claiming complete 482 parity.

### 7.3 Existing files that are not active 482 content routes

Audit and explicitly classify these files; do not automatically add them:

- `app/intake/temporary-work/all-applicants/addresses/page.js`
- `app/intake/temporary-work/all-applicants/contact-details/page.js`
- `app/intake/temporary-work/dependents/page.js`
- `app/intake/temporary-work/relationships/page.js`
- `app/intake/temporary-work/main-applicant/details-other/page.js`
- `app/intake/temporary-work/spouse-partner/education/page.js` — 186-only
- `app/intake/temporary-work/spouse-partner/language/page.js` — 186-only

Record one status for every file: `active-482`, `workflow-482`, `186-only`, `legacy-inactive`, or `dead-code-pending-removal`.

### 7.4 Actual dynamic journey order

`getDynamicTemporaryWorkRoutes("482")` currently builds the journey as follows:

1. Start
2. Profile
3. Main Applicant Details, Other Names, Identity, Contact Details
4. Other Family index
5. Six pages for each non-migrating member
6. Main Applicant Employment, Education, Skills, Language
7. Three spouse pages when a spouse profile exists
8. Four pages for each dependent child
9. Five All Applicants pages
10. Submit

The Children index is a sidebar-only exception. Route tests must cover zero, one, and multiple spouse/child/non-migrating profiles and must compare path plus profile query parameters.

## 8. Acceptance fixture A — Main Applicant Skills

The Skills page must be the first complete popup-parity fixture.

### 8.1 Page copy and top-level conditions

- Title: `Main Applicant's Skills`
- Intro: `In this section, provide details about the main applicant's professional registrations and skills assessments.`
- Question 1: `Do you hold any Occupational Registrations, Licences or Professional Memberships?`
- Show the `Registrations/Licences` records only when Question 1 is Yes.
- Question 2: `Have you applied for a Skills Assessment from an Australian Skills Assessing body?`
- Show the `Skills Assessments` records only when Question 2 is Yes.

The admin preview and client must agree on the question wording, Yes/No options, default values, requiredness, and conditional visibility.

### 8.2 Registration/Licence popup

Preserve these 13 stored fields and their order:

| Key/group | Client label | Control/condition |
| --- | --- | --- |
| `authority` | Name of Authority granting Licence or Registration or Membership | Required text |
| `title` | Title/Name of Licence or Registration or Membership | Required text |
| `licence_number` | Licence/Registration Number | Required text |
| `english_requirement` | Is there an English Language Requirement associated with obtaining this registration/licence? | Required Yes/No, default No |
| `english_requirement_details` | Enter details of the language requirement | Required when English requirement is Yes |
| `occupation` | Occupation | Required text |
| `country` | Country of Licence or Registration or Membership | Required country select |
| `issue_date_day` | Issue Date — Day | Required grouped select |
| `issue_date_month` | Issue Date — Month | Required grouped select |
| `issue_date_year` | Issue Date — Year | Required grouped select |
| `expiry_date_day` | Expiry Date (If applicable) — Day | Optional grouped select |
| `expiry_date_month` | Expiry Date (If applicable) — Month | Optional grouped select |
| `expiry_date_year` | Expiry Date (If applicable) — Year | Optional grouped select |

Table columns must remain:

- Authority
- Title
- Licence Number
- Year
- Country

Validation copy must include the current required messages for authority, title, licence number, conditional language details, occupation, country, and complete required issue date. Preserve partial-date validation for the optional expiry date.

### 8.3 Skills Assessment popup

Preserve these 12 fields and their order:

| Key/group | Client label | Control/condition |
| --- | --- | --- |
| `assessing_authority` | Assessing Authority | Required text |
| `assessment_type` | Assessment Type | Required select |
| `anzsco_code` | ANZSCO Code | Required text |
| `lodgement_date_day` | Lodgement Date — Day | Required grouped select |
| `lodgement_date_month` | Lodgement Date — Month | Required grouped select |
| `lodgement_date_year` | Lodgement Date — Year | Required grouped select |
| `receipt_number` | Receipt Number | Optional text |
| `outcome` | Outcome | Required select |
| `outcome_date_day` | Outcome Date — Day | Conditionally required as a complete date |
| `outcome_date_month` | Outcome Date — Month | Conditionally required as a complete date |
| `outcome_date_year` | Outcome Date — Year | Conditionally required as a complete date |
| `outcome_reference_number` | Outcome Reference Number | Optional text |

Assessment type options, preserving stored values, are:

- Full Skills Assessment
- Provisional Skills Assessment
- Job Ready Program
- Points Test Advice
- Other

Outcome options are:

- Positive
- Negative
- Unexpected
- Pending
- Other

Popup content must include:

- heading `Skills Assessment`;
- body `Enter details of the Skill Assessment you have applied for`;
- heading `Assessment Outcome`;
- body `Enter details on the outcome of the Skills Assessment`.

The source currently contains the typo `Logement Date` in visible copy. Catalog the current value so parity is measurable, then raise an explicit copy correction for product approval. Do not silently change it during a structural migration.

Table columns must remain:

- Authority
- Type
- ANZSCO
- Outcome

When outcome is `Pending`, an outcome date is not required. For other outcomes, the completion logic requires a complete date. The admin schema and dynamic runtime must reproduce that distinction.

### 8.4 Repeater chrome

Capture and expose the actual add, edit, delete, empty, cancel, and confirm copy. Where the page relies on shared defaults, record those defaults in the parity manifest rather than leaving them implicit:

- Add
- Add Entry / Edit Entry
- No entries added
- Actions
- Edit
- Delete
- Cancel
- Ok

Test both first render and an administrator-edited override.

### 8.5 Skills acceptance test

A passing fixture must prove all of the following:

1. The admin proposed layout shows both top-level questions.
2. Each outer record exposes every nested field in exact order.
3. Both grouped dates retain their three stored keys.
4. Country and option sources preview correctly.
5. Conditional English details and outcome-date rules work.
6. Table/popup/action copy can be edited without changing structural answer paths.
7. Publishing a copy-only edit changes the legacy client text.
8. A structural edit is blocked or deliberately promotes only after the full dynamic parity gate passes.
9. Existing saved rows still load, edit, save, and render.

## 9. Acceptance fixture B — Employment and the 482/186 boundary

### 9.1 Page and current-employment block

Preserve the page title and intro from the active client. When the applicant is currently employed, the client collects:

- employer;
- position;
- country through the country option source;
- employment type: Full-time, Part-time, Contract, Self-Employed;
- Date Started as day/month/year selects;
- workplace address;
- current duties/notes with a 300-character limit and counter.

Storage-only compatibility keys such as `still_working` and the current end-date triplet must not appear as user-facing questions unless product explicitly makes them visible.

### 9.2 482 employment history copy

- Heading: `Employment History (last 5 years)`
- Help: `Enter details of your employment history for the previous 5 years`

Do not use the 866 “since birth” wording or no-gap rule. Do not use the 186 ten-year wording.

### 9.3 Employment History popup

Preserve this active 482 contract:

| Field/group | Behavior |
| --- | --- |
| `is_current_employment` | Yes/No |
| Date From day/month/year | Required grouped selects |
| Date To day/month/year | Optional/ongoing grouped selects with partial-date validation |
| `status` | Required status select |
| `position_type` | Full-time, Part-time, Casual |
| `position` | Shown for Employed/Self-Employed and required by completion logic |
| `employer` | Required for employed statuses |
| workplace address | Text with active placeholder |
| `country` | Required country select |
| `city` | Text |
| duties/notes | Textarea, 300-character limit and counter |
| `is_related_to_nominated_position` | Yes/No |

Status options are:

- Employed
- Student
- Retired
- Self-Employed
- Unemployed
- Work Experience/Internships
- Unpaid Employment/Volunteer

Table columns are:

- Date From
- Date To
- Status
- Position
- Employer
- Duties
- Country

Use allowlisted date formatters for Date From and Date To, including the `Ongoing` display. Prefer context-neutral formatter IDs. If already-persisted definitions use Protection-named IDs, retain backward-compatible aliases.

### 9.4 Context isolation

`visa_held` is a 186-only Australian employment-history field. It is currently masked by client presentation logic for 482, but it remains in the extracted definition. Fix the catalog-level contract:

- remove it from the 482 built-in or mark it with an enforceable `visaContexts: ["186"]` restriction;
- keep it in 186 only when the row country is Australia;
- ensure the admin 482 preview cannot expose it;
- ensure promotion to dynamic rendering cannot expose it;
- add paired 482 and 186 regression tests.

### 9.5 Employment completion behavior

Tests must preserve:

- a required answer to the current-employment question;
- all required current-employment fields when Yes;
- at least one history row when the applicant is not currently employed;
- Date From, status, and country for every history row;
- position and employer for employed/self-employed statuses;
- the 186-only Australian visa-held rule;
- existing saved-answer normalization and storage-only compatibility fields.

## 10. Acceptance fixture C — Visas and dead-code extraction

This page must be resolved before claiming parity because the source, active UI, and extracted catalog currently disagree.

### 10.1 Active rendered page today

The active UI renders:

- page title `All Applicants' Visas`;
- the introductory paragraph about Australian visa grant numbers;
- question `Do any applicants included in this application have an Australian visa grant number?`;
- a Yes/No choice;
- when Yes, one or more visa grant records;
- `Person the visa relates to` using applicant options;
- `Australian Visa Grant Number` with placeholder `e.g. 1234567890`;
- delete-record action;
- `Add Applicant Visa Record` action and its `New` badge;
- the no-applicants message that directs the user to the Application Profile page.

These fields save under `temporary_work_visas.visa_grant_entries[]` with `applicantId`, `grantNumber`, and a compatibility `history` array.

### 10.2 Declared but unmounted VisaDialog

The same file declares a `VisaDialog` with the following intended history fields, but no active JSX mounts that dialog:

- `visa_type`
- `linked_passport`
- `visa_conditions`
- application date day/month/year
- `application_reference_number`
- `outcome`
- granted-only date granted day/month/year
- granted-only expiry date day/month/year
- granted-only `place_of_issue`
- granted-only `visa_number`
- granted-only `cancelled`
- decision date day/month/year when refused, withdrawn, or cancelled
- `decision_details` for the same decision condition

Declared outcome options are Granted, Pending, Refused, and Withdrawn. Declared popup sections include `Visa Application`, `Enter details of the Visa applied for or held by you`, `Application Outcome`, and `Enter details on the outcome of the Visa application`.

The extractor currently reduces the nested history to a generic field and makes it appear active. That is wrong regardless of the intended product decision.

### 10.3 Required product decision

Choose one path and record it in the PR:

**Path A — activate visa history**

1. Wire the declared history table/dialog into each rendered visa grant record.
2. Verify its complete schema, conditions, table columns, copy, and persistence.
3. Model every active nested field in the admin definition.
4. Add nested-repeater admin editing and client rendering tests.
5. Preserve existing empty `history` arrays.

**Path B — keep grant-number-only behavior**

1. Mark `VisaDialog` as dead/inactive and remove or relocate it.
2. Prevent the extractor from cataloguing unmounted components.
3. Remove the ghost nested history question from the active 482 definition while preserving the stored compatibility property.
4. Test that the admin shows exactly the active grant record fields and nothing more.

Do not leave the current hybrid state. Do not make 21 inactive fields editable in admin while the client cannot display or save them through the UI.

## 11. Complete 26-page audit matrix

The following counts describe the current generated definition. `Nested` includes repeater fields and follow-ups. `Records` includes repeaters and fixed object groups discovered as repeaters.

| Scope/page | Top | Nested | Records | Conditions | Captured help/intro | Priority checks |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Main — Details | 12 | 6 | 1 | 4 | 3 | Citizenship popup, person-name title |
| Main — Other Names | 2 | 12 | 1 | 1 | 1 | Other-name reason/options and popup copy |
| Main — Identity | 11 | 36 | 5 | 11 | 1 | Passports, IDs, citizenship/PR countries |
| Main — Contact Details | 7 | 5 | 1 | 0 | 1 | Fixed residential object, migration fallback |
| Main — Employment | 15 | 17 | 1 | 9 | 1 | Five-year copy, dates, 186 leakage |
| Main — Education | 2 | 18 | 1 | 1 | 1 | Qualification/language options, grouped dates |
| Main — Skills | 4 | 25 | 2 | 3 | 1 | Both popup schemas and completion rules |
| Main — Language | 6 | 14 | 2 | 3 | 1 | Languages, English tests, sub-scores |
| Spouse — Details | 13 | 6 | 1 | 4 | 3 | Dynamic person title, citizenship popup |
| Spouse — Other Names | 4 | 12 | 1 | 1 | 1 | Static route omission; dynamic route active |
| Spouse — Identity | 5 | 23 | 3 | 3 | 1 | Passport and identity popup parity |
| Child — Details | 12 | 6 | 1 | 4 | 3 | Template interpolation per child |
| Child — Other Names | 2 | 12 | 1 | 0 | 1 | Profile-scoped storage and popup copy |
| Child — Identity | 7 | 23 | 3 | 4 | 1 | Passport and identity popup parity |
| Child — Custody | 7 | 0 | 0 | 0 | 0 | Missing captured intro; legal/custody copy |
| Non-migrating — Details | 9 | 0 | 0 | 0 | 1 | Template path and profile identity |
| Non-migrating — Passport | 7 | 0 | 0 | 0 | 1 | Passport fields and validation |
| Non-migrating — Identity Documents | 2 | 0 | 0 | 0 | 1 | Control semantics and options |
| Non-migrating — Other Names | 1 | 3 | 1 | 0 | 1 | Repeater and profile path |
| Non-migrating — Citizenship | 2 | 0 | 0 | 0 | 1 | Country source and requiredness |
| Non-migrating — Health | 1 | 0 | 0 | 0 | 1 | Page-specific health question |
| All — Visas | 2 | 4 | 2 | 0 | 1 | Resolve dead `VisaDialog` mismatch |
| All — Travel History | 2 | 12 | 2 | 2 | 2 | Missing list, applicant multi-select, dates |
| All — Countries of Residence | 1 | 13 | 1 | 0 | 1 | Coverage validation and exact empty state |
| All — Health | 20 | 34 | 10 | 10 | 1 | Correct heading per popup; applicant selects |
| All — Character | 18 | 36 | 0 | 36 | 2 | Dual-source drift; dynamic page |

For every row, compare the active client route and catalog side by side. A matching node count does not prove parity; copy, grouping, options, conditions, persistence, and validation must also match.

## 12. Record, repeater, and popup inventory

The current extractor reports 40 record-style nodes. Audit every item and classify it as `array`, `fixed-object`, `nested-array`, or `multi-select-array`.

### 12.1 Main Applicant — 14

| Page | Record key | Current nested field count | Special checks |
| --- | --- | ---: | --- |
| Details | `citizenships` | 6 | Help text, country source, dates/conditions |
| Other Names | `other_names` | 12 | Name types, dates, reason, popup presentation |
| Identity | `passports` | 12 | Passport validation and issuing country |
| Identity | `national_id_card` | 6 | Yes/no gate and document fields |
| Identity | `other_identity_documents` | 5 | Document type/options |
| Identity | `citizenships` | 10 | Acquisition/renunciation conditions |
| Identity | `pr_countries` | 3 | Country and residence rights |
| Contact Details | `residential_address` | 5 | **Fixed object**, not Add/Edit list |
| Employment | `employment_history` | 17 | Five-year context and 186-only exclusion |
| Education | `education_history` | 18 | Date groups and option lists |
| Skills | `registrations` | 13 | Conditional English details |
| Skills | `assessments` | 12 | Conditional outcome date |
| Language | `languages` | 3 | Common languages and Yes/No formatter |
| Language | `english_tests` | 11 | Test options, date, scores and sub-scores |

### 12.2 Spouse/Partner — five

| Page | Record key | Fields |
| --- | --- | ---: |
| Details | `citizenships` | 6 |
| Other Names | `other_names` | 12 |
| Identity | `passports` | 12 |
| Identity | `national_id_card` | 6 |
| Identity | `other_identity_documents` | 5 |

### 12.3 Dependent Child — five reusable templates

| Page | Record key | Fields |
| --- | --- | ---: |
| Details | `citizenships` | 6 |
| Other Names | `other_names` | 12 |
| Identity | `passports` | 12 |
| Identity | `national_id_card` | 6 |
| Identity | `other_identity_documents` | 5 |

### 12.4 Non-migrating member — one reusable template

| Page | Record key | Fields |
| --- | --- | ---: |
| Other Names | `other_names` | 3 |

### 12.5 All Applicants — 15

| Page | Record key | Fields | Special checks |
| --- | --- | ---: | --- |
| Visas | `visa_grant_entries` | 3 | Active array of applicant/grant rows |
| Visas | `history` | currently 1 generic field | Declared but unmounted nested UI; resolve Section 10 |
| Travel | `travel_history` | 11 | Popup schema and row formatting |
| Travel | `applicant_ids` | 1 | Multi-applicant selector, not a normal repeater |
| Countries | `residence_records` | 13 | Coverage across rows and applicants |
| Health | `health_examinations` | 6 | Its own popup title and applicant selector |
| Health | `visited_outside_details` | 8 | Travel/country/date details |
| Health | `hospital_details` | 3 | Applicant, role/context, details |
| Health | `healthcare_work_details` | 3 | Correct work-specific heading |
| Health | `aged_care_work_details` | 3 | Correct aged-care heading |
| Health | `childcare_work_details` | 2 | Correct childcare heading |
| Health | `classroom_work_details` | 2 | Correct classroom heading |
| Health | `tuberculosis_details` | 2 | Applicant and TB details |
| Health | `health_conditions_details` | 3 | Applicant, condition, details |
| Health | `medical_assistance_details` | 2 | Applicant and assistance details |

The Health extractor currently reuses the first health question as the label for several repeaters. Replace each with the actual rendered section/popup heading. Also convert fields such as `applicant_name` from generic text to an allowlisted applicant option source where the client uses applicant selection.

## 13. Other high-risk page contracts

### 13.1 Contact Details is a fixed record group

The client renders one residential-address object, not a list with Add/Edit/Delete actions. Preserve:

- Contact Information heading;
- phone, mobile, and email;
- Emergency Contact heading and name/phone;
- Usual Country of Residence heading and country select;
- Residential Address heading;
- address country, line, suburb, state, and postcode.

Completion requires a valid email, phone or mobile, emergency contact name and phone, usual country, and all required residential fields.

The page migrates a legacy first address row from `temporary_work_addresses.address_history[0]` into the fixed residential object. Preserve that fallback and add a migration regression test.

The admin must visually label this as a fixed group. It must not display a fake Add button just because the extractor currently uses `type: "repeater"` with `metadata.collection: "object"`.

### 13.2 Education

Audit all 18 history fields, including:

- start and end grouped dates;
- qualification and its complete option list;
- highest qualification Yes/No;
- course name;
- language of instruction and its option source;
- course status;
- institution name;
- institution country and address fields;
- suburb/city, state/province, and postcode;
- certificate/document field if active.

Table columns are Institution, Qualification, Course Name, Year Started, and Country. Verify completion against `submitCompletion.js`, not only the popup schema.

### 13.3 Language

When English is not the main language, `languages` collects:

- language from `COMMON_LANGUAGES`;
- proficiency: Basic, Intermediate, Proficient, Fluent/Native;
- `is_main_language` Yes/No.

Its table columns are Language, Proficiency, and Main Language?, with an allowlisted Yes/No formatter.

When the applicant has completed English tests, `english_tests` collects:

- test type: IELTS Academic, IELTS General, PTE Academic, TOEFL iBT, OET, Other;
- required test date day/month/year;
- location;
- reference number;
- required overall score;
- optional Listening, Reading, Writing, and Speaking sub-scores under `Sub-scores (optional)`.

Its table columns are Date, Test Type, Location, Reference Number, and Overall Score.

Also preserve the studied-in-English question and its conditional details.

### 13.4 Travel History

The current extractor misses the explanatory list. Preserve the page question and the list of travel to include:

- work, study or training;
- business;
- holiday/leisure trips;
- military deployment;
- visits back to the applicant's own country.

Preserve the under-16 guidance and the full top-level question rather than the generated shorthand `Has Travel History`.

The popup contains:

- a multi-applicant selector stored in `applicant_ids`;
- country;
- reason;
- conditional other reason;
- legal status;
- arrival date day/month/year;
- departure date day/month/year.

Table columns are Applicant(s), Country, Arrival Date, Departure Date, and Reason for Travel. Do not store computed-only `arrival_display` or `departure_display` keys. Use source keys plus an allowlisted date formatter, or explicitly support safe computed presentation columns.

### 13.5 Countries of Residence

Preserve applicant selection, Date From/To groups, country, address lines, suburb, state, and postcode. Preserve the exact empty state `No countries of residence added yet`.

Completion is not merely “at least one row.” `getResidenceCoverageIssues` verifies history coverage based on age, the last ten years, or since age 16, through today. Model this as a reviewed validator ID with stable parameters and client-side implementation. Do not attempt to serialize arbitrary JavaScript.

### 13.6 Health

The Health page has 20 top-level questions and ten conditional detail records. Audit each question independently. For every conditional record capture:

- the exact question that opens it;
- the actual section label and popup title;
- all applicant selectors and option sources;
- every nested label, help string, placeholder, and option;
- table columns and row formatters;
- add/edit/delete/empty/cancel/confirm copy;
- minimum-row and completion rules.

Do not use one generic “health details” record schema unless the rendered fields are actually identical.

### 13.7 Character

Character is already dynamic and consists of 18 required Yes/No declarations, defaulting to No. Each Yes answer reveals:

- applicant select from `optionsSource: "applicants"`;
- `Give details` textarea.

Preserve both intro blocks: the explanatory paragraph and the criminal-conviction list. Preserve `char_q01` through `char_q18`, their exact labels, display numbers, options, follow-up keys, placeholders, and route.

The current follow-ups are marked `required: false` even though the intro says a Yes answer must provide all relevant details. Treat this as a legal/product decision. Record the current behavior, obtain sign-off, and change requiredness only with an explicit migration and validation test.

`allApplicantsParity.js` also depends on these declarations. Add a regression test before changing their wording or IDs.

## 14. Required parity manifest

Create a machine-readable 482 manifest generated from or checked against the active client. A suggested location is:

`scripts/fixtures/temporary-work-482-parity.json`

The exact location can differ, but the manifest must be reviewable and deterministic.

### 14.1 Definition fields

- definition ID and title;
- `visaType` and `visaContext`;
- schema/catalog version;
- expected renderer by page;
- supported visa contexts;
- route-source version or fixture checksum.

### 14.2 Page fields

- stable page ID;
- route or route template;
- source file;
- scope: main, spouse, child, non-migrating, shared, or workflow;
- active contexts;
- title and title interpolation tokens;
- all intro blocks in order;
- section key;
- completion key/template;
- storage section/path;
- renderer;
- route prerequisites and profile rules.

### 14.3 Question fields

- ID and `answerKey`;
- field path relative to the page and full persisted path;
- label and display label;
- type and presentation control;
- required/default/disabled/read-only state;
- placeholder, help text, prefix/suffix, rows, and max length;
- option values and labels or allowlisted option source;
- ordered visibility conditions;
- validation rule IDs, parameters, and messages;
- whether a value is user-facing, computed, or storage-only;
- active visa contexts;
- legacy-copy key and original baseline.

### 14.4 Record and popup fields

- collection kind: array, fixed object, nested array, or multi-select array;
- nested field order and groups;
- popup add/edit titles and descriptions;
- section headings inside the popup;
- add, edit, delete, cancel, confirm, and empty-state copy;
- desktop and mobile table columns;
- column source keys and allowlisted formatter IDs;
- minimum/maximum rows;
- record-level and collection-level validators;
- conditional nested fields;
- nested collection path.

### 14.5 Audit statuses

Each manifest node should end in one of:

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
- `inactive-source`;
- `workflow-locked-with-approval`.

The audit command must exit non-zero for every unresolved active mismatch.

## 15. Metadata and runtime model

Extend the existing schema; do not introduce a second questionnaire model.

### 15.1 Presentation metadata

A record question needs structured presentation similar to:

```js
metadata: {
  collection: "array", // or "object", "nested-array", "multi-select-array"
  fields: [...],
  presentation: {
    addLabel: "Add",
    addTitle: "Add Entry",
    editTitle: "Edit Entry",
    dialogDescription: "...",
    emptyMessage: "No entries added",
    actionsLabel: "Actions",
    editLabel: "Edit",
    deleteLabel: "Delete",
    cancelLabel: "Cancel",
    confirmLabel: "Ok",
    columns: [
      { key: "authority", label: "Authority" },
      { key: "issue_date_year", label: "Year" }
    ]
  }
}
```

Use the project's final validated shape if current shared work has already established one. The important requirement is that the admin editor, preview, legacy copy overlay, and dynamic client all consume one schema.

### 15.2 Field groups without changing storage

Represent a displayed date group using metadata while retaining separate keys:

```js
metadata: {
  fieldGroup: {
    id: "lodgement_date",
    label: "Lodgement Date",
    kind: "dateParts",
    order: ["day", "month", "year"]
  }
}
```

Do the same for address groups, score groups, and popup sections. Group metadata controls layout and copy; it must not replace persisted keys.

### 15.3 Allowlisted option sources

Support reviewed sources such as:

- countries;
- applicants;
- profiles scoped by role;
- common languages;
- qualification types;
- day/month/year ranges;
- English test types;
- 482 skills assessment types and outcomes.

Never execute an arbitrary option-source string from saved JSON. Validate source IDs and any parameters in both admin and client.

### 15.4 Allowlisted formatters

Required safe formatters include:

- grouped date;
- grouped date or `Ongoing`;
- year from date parts;
- applicant name(s) from IDs;
- Yes/No display;
- comma-separated labels where appropriate.

Formatter metadata must refer only to source keys that exist in the record or to a reviewed computed-column contract. Missing keys must fail schema validation.

### 15.5 Declarative validators

Use stable IDs and parameters for rules such as:

- complete date parts;
- optional date is either blank or complete;
- start date is not after end date;
- conditional required field;
- minimum one row when Yes;
- 482 residence-history coverage;
- Skills outcome date unless Pending;
- employed-status position/employer requirement;
- max length and email format.

Do not serialize functions in questionnaire JSON. The admin can edit approved messages and selected safe parameters, but not arbitrary code.

### 15.6 Context restrictions

Every page, question, nested field, option, and validator that differs between 482 and 186 must support an explicit context rule. Validate that:

- at least one supported context remains;
- a child context cannot exceed its page/definition contexts;
- the client ignores or rejects incompatible nodes;
- the admin preview uses the selected definition context;
- publishing a 482 definition cannot introduce a 186-only field.

## 16. Step-by-step implementation plan

### Step 0 — Freeze and document the baseline

1. Read both `AGENTS.md` files.
2. Read the relevant Next.js 16 documentation under `node_modules/next/dist/docs/`.
3. Run `git status --short` in both repositories and save the output in implementation notes.
4. Review the current 866/shared diffs before editing any overlapping file.
5. Export the current built-in 482 definition to a temporary audit artifact.
6. Record the current `QUESTIONNAIRE_LEGACY_CATALOG_VERSION`; it is 3 at this audit, but may change before implementation.
7. Create a Test copy of the 482 questionnaire and record its revision.
8. Build profile scenarios: main only; main plus spouse; main plus child; main plus non-migrating member; and a combined multi-profile case.
9. Capture desktop and mobile screenshots of every route and every opened popup.

Exit condition: a reproducible pre-change snapshot exists without modifying saved production definitions.

### Step 1 — Add the audit before changing catalog content

Create `scripts/audit-temporary-work-482-parity.mjs` or an equivalently named tool.

The audit must:

1. load `getBuiltInQuestionnaireDefinition({ visaType: "temporary-work", visaContext: "482" })`;
2. compare active routes from `getDynamicTemporaryWorkRoutes("482")` against the page manifest;
3. distinguish workflow routes from content routes;
4. distinguish active rendered components from merely declared source components;
5. recursively walk questions, follow-ups, record fields, and nested collections;
6. report missing/extra pages, questions, fields, intro blocks, options, conditions, validations, and presentation metadata;
7. report generic date/country controls that lack reviewed presentation metadata;
8. report fields with missing or incompatible `visaContexts`;
9. report column keys/formatter inputs that do not resolve;
10. report duplicate IDs and answer paths;
11. output a readable table plus machine-readable JSON;
12. exit non-zero until all active mismatches are resolved.

Add snapshot tests for the baseline report so extractor changes cannot silently alter 482.

### Step 2 — Reconcile routes and scope

1. Make the dynamic route builder the tested authority.
2. Fix or document the static `TEMPORARY_WORK_VISA_ROUTES` omission of spouse Other Names.
3. Assert that spouse Education and Language never enter the 482 catalog or route list.
4. Assert that the child index is sidebar-only but each child template is in the content manifest.
5. Include all six non-migrating templates.
6. Classify all inactive temporary-work page files.
7. Decide how workflow copy is edited or locked.
8. Add route tests for zero/one/multiple dynamic profiles.

Exit condition: route construction, admin page inventory, and the manifest agree for every profile scenario.

### Step 3 — Make shared infrastructure visa-neutral

1. Review the shared nested editor and presentation changes created during 866 work.
2. Move generic date grouping, country conversion, presentation fallback, formatter registration, and schema validation into neutral modules.
3. Keep 866 copy/validation enrichment in the Protection module.
4. Add a dedicated module such as `src/lib/questionnaireBuiltInTemporaryWork482Enrichment.js` for 482-only reconciliation.
5. Where 482 and 186 share exact behavior, use a temporary-work shared helper with explicit context parameters.
6. Preserve compatibility aliases for any persisted formatter or validator IDs already emitted by the shared work.
7. Add unit tests proving the neutral helper does not change unrelated Partner or Protection definitions.

Exit condition: 482 code does not depend on Protection-named implementation details except compatibility aliases.

### Step 4 — Improve extraction, then enrich what static extraction cannot infer

Improve `scripts/extract-questionnaire-built-ins.cjs` only for patterns that are reliably generic:

1. collect ordered intro paragraphs and lists;
2. capture actual mounted `RepeaterTable` presentation props;
3. trace shared component fields where the mapping is explicit;
4. retain separate stored date keys while adding group metadata;
5. attach reviewed option-source IDs;
6. detect fixed object groups;
7. avoid cataloguing unmounted local components;
8. capture context guards where statically resolvable.

Use 482 enrichment for items that require product knowledge or runtime logic:

- profile-dependent title tokens;
- 482/186 context differences;
- cross-row coverage validators;
- derived conditions;
- table source-key/formatter mapping;
- popup copy rendered through complex composition;
- migration/storage-only fields.

Regenerate `questionnaireBuiltInPages.js`; never patch the generated file by hand.

Exit condition: a clean regeneration plus enrichment reproduces the audited manifest deterministically.

### Step 5 — Finish the proposed builder in the existing design

In `AdminQuestionnaireBuilder.jsx` and its extracted components:

1. recursively render `metadata.fields` and follow-ups;
2. show full field paths to disambiguate repeated labels;
3. distinguish array records, fixed object groups, nested arrays, and multi-select arrays;
4. edit popup title, description, internal section headings, and chrome copy;
5. edit table column labels while keeping source keys controlled;
6. edit allowlisted formatter selection and preview its output;
7. edit option labels without silently changing stored values;
8. show visibility and context rules in plain language;
9. expose approved validation messages and safe parameters;
10. display storage-only fields as locked compatibility metadata, not normal questions;
11. warn when a change would promote a legacy page to dynamic rendering;
12. require the structural parity gate before allowing that promotion;
13. preserve the current layout's spacing, typography, cards, responsive behavior, and save model.

Add focused component tests for Skills, Contact Details, Employment, Visas, and Health.

Exit condition: every manifest node has a visible, correctly scoped admin representation, or an explicit locked reason.

### Step 6 — Make every legacy client component consume editable copy

Complete the shared legacy-copy bridge so copy-only edits affect the hard-coded client without changing behavior.

1. Pass a stable `fieldName` or full path into every `RepeaterTable` and dialog.
2. Resolve copy by full path first, with a temporary legacy-label fallback only for migration.
3. Make `RepeaterTable` consume table columns, add/edit titles, descriptions, empty copy, actions, and mobile labels.
4. Make each popup consume nested labels, help, placeholders, option labels, headings, cancel, and confirm copy.
5. Make fixed object groups consume their headings and field copy without record actions.
6. Support ordered intro paragraphs and lists.
7. Support safe title interpolation for main applicant, spouse, child, and non-migrating member names.
8. Keep stored values and validation logic unchanged for copy-only edits.
9. Add collision tests for repeated labels such as Country, Details, Date From, and Applicant.
10. Verify fallback behavior for older definitions that lack presentation metadata.

Exit condition: every editable legacy-copy value has a tested runtime consumer.

### Step 7 — Reconcile all 26 pages

Work through the matrix in Section 11 using the worksheet in Section 17.

Recommended order:

1. Skills fixture.
2. Employment context fixture.
3. Visas decision fixture.
4. Contact fixed-object fixture.
5. Travel and Countries of Residence.
6. Health's ten detail records.
7. Education and Language.
8. Identity/Other Names/Details across main, spouse, and child scopes.
9. Non-migrating templates.
10. Child Custody and its missing intro.
11. Character dual-source contract.
12. Workflow pages.

After each page:

- run the parity audit;
- run relevant admin tests;
- run relevant client tests;
- manually compare admin preview and client;
- record any approved deviation in the manifest.

Exit condition: no active page has an unresolved manifest status.

### Step 8 — Gate structural editing and dynamic promotion

A page may become dynamic only when all of these pass:

1. every active field and display block exists in the definition;
2. profile-scoped storage paths match legacy behavior;
3. default values and normalization match;
4. options and stored values match;
5. conditions match;
6. requiredness and all validators match;
7. completion keys and navigation match;
8. repeaters/fixed objects/nested arrays match;
9. legacy saved answers load and round-trip;
10. desktop/mobile layout and accessibility pass;
11. paired 482/186 regression tests pass where source is shared.

Until then, allow only legacy-safe copy edits. The admin UI must clearly label structural controls as unavailable or promotion-triggering.

Exit condition: renderer changes are explicit, reviewable, and covered by per-page parity tests.

### Step 9 — Upgrade catalog and saved definitions safely

1. Re-read the current `QUESTIONNAIRE_LEGACY_CATALOG_VERSION` after merging shared 866 work.
2. Coordinate one catalog-version increment for the combined schema/content change; do not blindly set the value from 3 to 4 if another migration already did so.
3. Merge new built-in content into saved definitions by stable IDs and answer paths.
4. Add missing baseline fields and metadata.
5. Preserve administrator-edited labels, descriptions, placeholders, options, and presentation copy.
6. Never reintroduce deleted custom questions.
7. Preserve revisions, status, and publication history.
8. Make the migration idempotent.
9. Test pre-migration, partially edited, and already-upgraded fixtures.
10. Provide a dry-run report listing every automatic addition, preservation, conflict, and context exclusion.

Exit condition: running the upgrade twice produces no further changes and no admin content loss.

### Step 10 — Verify, stage, and roll out

1. Run all admin and client test suites listed in Section 19.
2. Run the 482 audit and require zero unresolved active mismatches.
3. Test the five profile scenarios from Step 0.
4. Test 482 and 186 side by side.
5. Test desktop and mobile, including complete popup scroll areas.
6. Test keyboard navigation, focus return, labels, error announcements, and dialog focus trapping.
7. Test with existing legacy answers and a new blank draft.
8. Publish only a Test copy first.
9. Complete legal/product copy review.
10. Promote through the normal controlled publication flow with rollback instructions.

Exit condition: the Definition of Done in Section 20 is fully evidenced.

## 17. Per-page checking worksheet

Copy this worksheet for every content and workflow page.

### Route and identity

- [ ] Active in `getDynamicTemporaryWorkRoutes("482")` for the relevant profile scenario
- [ ] Correct route or route template
- [ ] Correct page ID
- [ ] Correct scope and profile token
- [ ] Correct section/storage path
- [ ] Correct completion key
- [ ] Correct `visaContexts`
- [ ] Correct legacy/dynamic renderer

### Page content

- [ ] Title and interpolation
- [ ] Subtitle/intro paragraphs
- [ ] Ordered lists and lead text
- [ ] Section headings
- [ ] Guidance, warnings, and notes
- [ ] Save/Continue/Previous copy where editable
- [ ] Empty/no-applicant states

### Every top-level question

- [ ] ID and `answerKey`
- [ ] Full persisted path
- [ ] Label and display label
- [ ] Type/control
- [ ] Requiredness/default
- [ ] Placeholder/help/prefix/suffix
- [ ] Max length and character counter
- [ ] Options: values and labels
- [ ] Conditions
- [ ] Context restriction
- [ ] Validation and exact message
- [ ] Storage-only/computed status

### Every record, fixed group, and popup

- [ ] Collection kind
- [ ] Add label
- [ ] Add/edit titles
- [ ] Popup descriptions and internal headings
- [ ] All nested fields in visual order
- [ ] Nested conditions and validation
- [ ] Table columns and mobile labels
- [ ] Row formatters and their source keys
- [ ] Empty state
- [ ] Edit/delete/actions/cancel/confirm copy
- [ ] Minimum rows and collection validation
- [ ] Nested collection behavior

### Persistence and compatibility

- [ ] Existing saved answer loads
- [ ] Edit/save round-trip preserves unknown compatibility keys
- [ ] Copy-only edit does not alter stored values
- [ ] Migration fallback is tested
- [ ] Completion state matches legacy
- [ ] 186 regression passes for shared source

### Admin behavior

- [ ] Proposed layout exposes all editable content
- [ ] Preview matches client
- [ ] Fixed groups are not shown as repeaters
- [ ] Full paths prevent label collisions
- [ ] Structural change warning is correct
- [ ] Save/reload retains edits
- [ ] Catalog upgrade preserves admin overrides

## 18. File-by-file implementation map

### 18.1 Admin Portal

| File/area | Required work |
| --- | --- |
| `src/components/admin/AdminQuestionnaireBuilder.jsx` | Finish recursive nested, presentation, group, condition, context, and validation editing in the proposed layout |
| `src/lib/questionnaireDefinitions.js` | Validate record kinds, presentation, sources, formatter IDs, validator IDs, contexts, and nested paths |
| `src/lib/questionnaireBuiltIns.js` | Apply neutral and 482 enrichment; coordinate catalog version; isolate 482 from 186 |
| `src/lib/questionnaireBuiltInPages.js` | Regenerate only; never hand-edit |
| `src/lib/questionnaireStarterTemplates.js` | Keep Character synchronized or replace duplicate maintenance with a shared fixture |
| `src/lib/questionnaireBuiltInTemporaryWork482Enrichment.js` | New 482-specific reconciliation layer |
| neutral built-in helper module | Shared date groups, country sources, presentation fallback, and compatibility aliases |
| `scripts/extract-questionnaire-built-ins.cjs` | Capture reliable mounted content and avoid dead-component false positives |
| `scripts/audit-temporary-work-482-parity.mjs` | New exhaustive route/content/schema audit |
| `test/questionnaireBuiltInTemporaryWork482.test.mjs` | New 482 catalog and fixture coverage |
| catalog migration tests | Preserve edits and prove idempotence |

Use the actual module names established by the shared 866 work if they differ. Avoid duplicating helpers merely to match this suggested map.

### 18.2 Client Portal

| File/area | Required work |
| --- | --- |
| `src/lib/routes.js` | Test dynamic 482 route contract; reconcile static spouse Other Names omission |
| `src/components/RepeaterTable.jsx` | Complete field-path-aware presentation-copy consumption |
| `src/lib/questionnaires/legacyCopy.js` | Resolve nested/presentation copy by stable full path |
| `src/components/questionnaire/QuestionnaireDefinitionContent.jsx` | Preserve legacy/dynamic boundary and promotion gate |
| `src/components/questionnaire/QuestionField.jsx` | Support all approved record kinds/groups/sources/formatters/validators |
| `src/lib/questionnaires/temporaryWork482.definition.js` | Synchronize Character contract |
| `src/lib/submitCompletion.js` | Treat as validation authority; add parity tests before changing |
| `src/lib/questionnaireClientPresentation.js` | Remove reliance on 482 masking once definition contexts are correct; retain safe compatibility behavior |
| `app/intake/temporary-work/main-applicant/skills/page.js` | First popup fixture and legacy-copy consumers |
| `app/intake/temporary-work/main-applicant/employment/page.js` | Five-year/ten-year and visa-held context fixture |
| `app/intake/temporary-work/all-applicants/visas/page.js` | Resolve unmounted VisaDialog decision |
| `app/intake/temporary-work/all-applicants/travel-history/page.js` | Intro list, multi-applicant selector, date presentation |
| `app/intake/temporary-work/all-applicants/countries-of-residence/page.js` | Coverage validator and row presentation |
| `app/intake/temporary-work/all-applicants/health/page.js` | Ten accurate popup contracts |
| all remaining active route files | Complete page-by-page reconciliation |

## 19. Automated and manual verification requirements

### 19.1 Admin tests

Add or extend tests that prove:

- exactly 26 active 482 content templates after route reconciliation;
- 25 legacy and one dynamic page until deliberate promotions occur;
- exact active route set and template scopes;
- spouse Other Names is present;
- spouse Education and Language are absent;
- all stable IDs/answer paths are unique;
- all 40 current record nodes are classified or intentionally removed;
- Skills has both complete popup schemas;
- Employment uses five-year copy and excludes `visa_held`;
- 186 retains ten-year and Australian `visa_held` behavior;
- Contact is a fixed object group;
- Travel includes all intro blocks and a multi-applicant selector;
- Countries has the reviewed coverage validator;
- Health has ten distinct presentation contracts;
- Character has 18 exact declarations and 36 follow-ups;
- no table column or formatter references an unresolved source;
- every option source, formatter, validator, and interpolation token is allowlisted;
- no active generic date/country control remains without reviewed presentation metadata;
- catalog migration preserves administrator changes and is idempotent;
- proposed builder recursively edits nested fields and presentation copy.

Suggested commands, adjusted to the repository's current scripts:

```powershell
npm test
node --test test/questionnaireBuiltInTemporaryWork482.test.mjs
node scripts/audit-temporary-work-482-parity.mjs
npm run lint
npm run build
```

### 19.2 Client tests

Add or extend tests for:

- dynamic route construction with each profile scenario;
- spouse Other Names route and child/non-migrating templates;
- field-path-aware legacy copy for nested labels and presentation chrome;
- Skills popup fields, options, conditions, validation, and completion;
- Employment 482/186 differences;
- Contact fixed-object migration and completion;
- Visa page active contract after the Section 10 decision;
- Travel intro/list, applicant multi-select, dates, and table formatting;
- residence coverage boundaries;
- all ten Health conditional records;
- Character source synchronization and Yes follow-ups;
- old saved answers loading under both legacy and dynamic renderers;
- publication revision selection and fallback behavior.

Existing suites to include and extend:

- `e2e/questionnaire-482.spec.js`
- `test/questionnaireLegacyCopy.test.js`
- `test/questionnaireRepeaters.test.js`
- `test/allApplicantsParity.test.js`
- questionnaire validation tests
- completion tests
- identity/profile tests

Suggested commands, adjusted to current scripts:

```powershell
npm test
npm run lint
npm run build
npx playwright test e2e/questionnaire-482.spec.js
```

### 19.3 Required end-to-end matrix

| Scenario | Admin | Client | Required evidence |
| --- | --- | --- | --- |
| Main only | Edit/preview | Complete journey | Route and completion parity |
| Main + spouse | Edit all spouse pages | Complete journey | Other Names included; no Education/Language |
| Main + child | Edit child template | Complete journey | Profile interpolation and sidebar exception |
| Main + non-migrating | Edit six templates | Complete journey | Correct member paths and order |
| Combined profiles | Preview all scopes | Complete journey | No route/path collisions |
| Existing legacy answers | Upgrade copy | Load/edit/save | No data loss |
| Copy-only publication | Edit labels/chrome | Open legacy pages | Runtime consumes every edit |
| Structural test copy | Deliberate promotion | Complete page | Full behavior parity |
| 482 vs 186 | Compare definitions | Compare journeys | No context leakage |
| Desktop/mobile | Open all dialogs | Open all dialogs | Full scroll and responsive parity |

Manual evidence must include the bottom of long Skills, Employment, Identity, and Health dialogs—not only their first viewport.

## 20. Definition of Done

The 482 work is complete only when all statements are true:

1. The parity audit reports zero unresolved active mismatches.
2. All 26 active content templates are represented and verified.
3. Workflow pages are either safely editable or explicitly locked with approval.
4. Every active top-level and nested client field is represented exactly once.
5. Every record/fixed group is correctly classified.
6. All table, popup, action, empty-state, list, and help copy has a tested admin edit path or an approved lock.
7. Skills passes the complete two-popup fixture.
8. Employment uses five-year 482 behavior and cannot expose 186-only `visa_held`.
9. The Visas page no longer has a dead-source/active-catalog hybrid.
10. Contact Details renders as a fixed object, not a list.
11. Travel includes its full list and correct multi-applicant/date presentation.
12. Residence coverage validation is preserved.
13. All ten Health detail records have their correct headings and fields.
14. Character's two definitions cannot drift silently.
15. Legacy copy edits are consumed by the client at the correct full field path.
16. Structural edits cannot activate an incomplete dynamic page.
17. Saved answers and completion state round-trip without data loss.
18. Catalog migration preserves administrator edits and is idempotent.
19. 186, 866, and Partner regression suites pass after shared changes.
20. Desktop, mobile, keyboard, focus, labels, and error announcements pass.
21. A Test copy is approved before production promotion.
22. The PR contains route, schema, screenshot, migration, and test evidence.

## 21. PR evidence checklist

- [ ] Before/after `git status --short` for both repositories
- [ ] Relevant Next.js 16 guide paths read
- [ ] Baseline and final 482 audit reports
- [ ] Manifest diff with every intentional addition/removal explained
- [ ] Active/inactive/workflow/186-only file classification
- [ ] Skills admin/client screenshots with both complete dialogs
- [ ] Employment 482 and 186 comparison screenshots
- [ ] Visas product decision and resulting UI/catalog evidence
- [ ] Contact fixed-object screenshot
- [ ] Travel list and popup screenshot
- [ ] Countries coverage-validation evidence
- [ ] All ten Health detail-popup screenshots or a reviewed recording
- [ ] Character source-contract test
- [ ] Desktop and mobile evidence
- [ ] Legacy saved-answer round-trip evidence
- [ ] Catalog migration dry-run and idempotence evidence
- [ ] Admin/client test outputs
- [ ] 482/186 regression outputs
- [ ] Publication and rollback steps

Do not close the work with a statement such as “all questionnaire fields are now editable” unless this checklist and the machine-readable audit both prove it.
