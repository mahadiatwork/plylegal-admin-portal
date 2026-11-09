# Protection Visa (Subclass 866) Questionnaire Parity Implementation Guide

**Status:** Ready for implementation  
**Audit date:** 8 November 2026  
**Admin repository:** `F:\Work Projects\ply-legal-admin-portal`  
**Client repository:** `F:\Work Projects\plylegal-client-portal`

## 1. Outcome

Make the Admin Portal questionnaire builder a complete, trustworthy editor for every active Protection Visa (subclass 866) questionnaire page shown by the Client Portal.

The implementation must:

1. Preserve the current **new/proposed Client-style builder layout**. Extend it; do not replace it with another design.
2. Show every top-level question and every nested repeater/popup field in the admin builder.
3. Capture every client-facing content item: titles, introductions, explanatory paragraphs, labels, help text, placeholders, option labels, table headings, popup titles/subtitles, empty states, action labels, conditional copy, character counters, and validation messages.
4. Preserve the exact client field order, grouping, conditional visibility, requiredness, option sets, row presentation, and validation behavior.
5. Preserve all stable page IDs, question IDs, `answerKey` values, routes, completion keys, and saved-answer paths.
6. Never imply that an admin edit affects the client when the legacy client renderer cannot consume it.
7. Protect existing saved questionnaires and existing administrator wording changes during the catalog upgrade.
8. Prove parity across all 866 pages and all popup forms with automated tests and manual visual checks.

This is not an Employment-only patch. Employment is the clearest failing example and the first acceptance fixture, but all 29 active content-page templates must pass the same audit.

## 2. Confirmed root causes

There are several separate gaps. Fixing only one will leave the feature incomplete.

### 2.1 The new/proposed builder does not expose nested record fields

`src/components/admin/AdminQuestionnaireBuilder.jsx` has a `ProposedInlineQuestionEditor`, but that editor only exposes the selected top-level question's title, help text, type, placeholder, required flag, and direct options. It does not recursively render `question.metadata.fields` for a `repeater`.

The existing/current admin editing paths already contain reusable nested-field controls:

- `RecordFieldWording`
- `EmbeddedNestedQuestionEditor`
- `updateNestedQuestion`
- `deleteNestedOption`

The new/proposed layout must reuse those controls and mutation handlers inside its existing visual language. Do not create a second question state model.

### 2.2 The generated 866 catalog misses client copy and presentation metadata

The built-in page extractor currently captures many form controls, but it does not fully capture:

- explanatory `<p>` content outside the limited locations it recognises;
- repeater table column labels;
- add/edit popup titles and subtitles;
- add, edit, delete, cancel, confirm, and empty-state text;
- grouped date-select semantics;
- reusable country/date option sources;
- conditional rules expressed through derived booleans or set membership;
- cross-field and cross-row validation messages;
- dynamic person-name templates;
- row formatting such as `Ongoing`;
- some content rendered through shared components.

For Employment, that is why the admin has a top-level `Employment History` repeater but misses the no-gap guidance and does not present the popup accurately.

### 2.3 Legacy pages and dynamic pages behave differently

The 866 built-ins currently use `metadata.renderer: "legacy"`.

On the client, `QuestionnaireDefinitionContent.jsx` behaves as follows:

- a legacy page renders the original hard-coded page inside `QuestionnaireCopyProvider`;
- a dynamic page renders `DynamicQuestionnairePage` from the questionnaire JSON.

This creates an important safety boundary:

- Existing catalogued labels/help/placeholders can be treated as copy overlays while the hard-coded page retains its behavior.
- A structural edit such as changing a field type, requiredness, choices, or nested rules can promote a page to the dynamic renderer.
- Adding help text or a placeholder that has no `originalDescription` or `originalPlaceholder` baseline also currently promotes the page to the dynamic renderer.
- Repeater chrome in `RepeaterTable.jsx` does not currently consume the legacy copy context, so table headings, add text, empty text, popup title, and mobile action text cannot be reliably changed through the admin definition.

Do not solve missing copy by accidentally promoting incomplete 866 pages to the dynamic renderer. First make the legacy content catalog complete and make all relevant client primitives consume it. Treat full dynamic conversion as a page-by-page behavior migration with its own parity gate.

### 2.4 The extractor intentionally simplifies some controls

`scripts/extract-questionnaire-built-ins.cjs` currently leaves many day/month/year controls as storage-compatible `text` questions and skips large option lists. This protects answer keys but loses UI semantics. The resulting 866 catalog therefore contains many date fragments and countries as generic text controls even though the Client Portal uses selects.

The fix must preserve the individual stored keys while describing their real presentation. Do not merge three stored date keys into one new answer key.

## 3. Non-negotiable guardrails

- Read both repositories' `AGENTS.md` before editing.
- This project uses Next.js 16. Before changing Next.js code, read the relevant guide under `node_modules/next/dist/docs/`; do not rely on remembered Next.js conventions.
- Run `git status --short` in both repositories before and after every logical phase.
- At the time of this audit the Client Portal already had unrelated local work in `app/intake/layout.js` and `e2e/questionnaire-sidebar.spec.js`. Preserve it unless it is explicitly brought into scope.
- Do not hand-edit `src/lib/questionnaireBuiltInPages.js`. It is generated.
- Do not change an `id`, `answerKey`, route, storage path, or completion key merely to make wording cleaner.
- Do not duplicate the country list into dozens of JSON definitions. Use a reviewed shared option source.
- Do not silently add inactive routes to the journey. Record an explicit product decision for inactive files.
- Do not overwrite administrator-edited copy when upgrading the built-in catalog.
- Do not publish directly to the live 866 definition during development. Use a Test copy and controlled promotion.
- Do not redesign the new/proposed builder. Add nested controls and presentation controls using its existing typography, spacing, borders, panels, and responsive behavior.
- Do not weaken or remove client validation to make a dynamic page appear to work.
- Do not consider a popup checked until it has been opened and its full scrollable contents have been inspected at desktop and mobile widths.

## 4. Source-of-truth hierarchy

Use this order when evidence conflicts:

1. **Active route construction** in `plylegal-client-portal/src/lib/routes.js` determines what is in the current 866 journey.
2. **Rendered Client Portal page source** determines visible fields, copy, order, conditions, and components.
3. **Page validation and submit logic** determines requiredness and cross-field/cross-row rules.
4. **Draft-store calls and field registration** determine storage paths and answer keys.
5. **Shared UI primitives**, especially `RepeaterTable`, determine default popup/table/action copy.
6. **Screenshots** confirm the intended presentation but are not a complete specification.
7. **The existing admin built-in JSON** is an extraction result to reconcile, not the authoritative 866 form specification.

For every page, record the client source file, active route, storage section, completion key, and all shared components before changing the catalog.

## 5. Baseline audit snapshot

The current generated Protection definition contains:

| Measure | Current value |
| --- | ---: |
| Active content-page templates in the admin definition | 29 |
| Top-level questions | 243 |
| Nested questions/record fields | 337 |
| Total question nodes | 580 |
| Repeating-list questions | 57 |
| Captured question descriptions/help items | 6 |
| Questions with captured conditional rules | 88 |
| Captured placeholders | 85 |
| Pages with no captured intro block | 12 |

Current type distribution:

| Type | Count |
| --- | ---: |
| `text` | 321 |
| `yesNo` | 88 |
| `repeater` | 57 |
| `select` | 45 |
| `textarea` | 37 |
| `dateParts` | 23 |
| `radio` | 6 |
| `checkbox` | 3 |

These counts are a diagnostic snapshot, not the target. The extremely low help-text count is evidence that the extraction model is incomplete. A heuristic also finds dozens of date fragments and country/nationality fields represented as generic text even when the client uses selects.

Create a repeatable audit command/test that regenerates this report. Do not rely on a one-off manual count.

## 6. Scope reconciliation before coding

### 6.1 Active journey content

The active route registry includes:

- Getting Started
- Included Applicants
- Main Applicant: Details, Other Names, Identity, Employment, Education, Family
- Spouse/Partner: Details, Other Names, Identity
- Dynamic Child profiles: Details, Other Names, Identity, Custody
- Dynamic Non-migrating family members: Details, Passport, Identity Documents, Other Names, Citizenship, Health
- Standalone Employment
- All Applicants: Addresses, Languages, Contact Details, Visas, Travel History, Future Travel, Future Addresses, Character, Contacts
- Review and Submit

The 29-page admin built-in covers the content-page templates. Getting Started, Included Applicants, dynamic profile-management/index screens, and Review and Submit are workflow pages and are currently excluded by the extractor.

Because the requirement is "all contents from the client portal", explicitly choose and document one of these approaches for workflow copy:

1. **Recommended:** introduce a separate `workflowCopy`/system-content area that is editable but cannot alter routing, applicant creation, submission, or other workflow behavior; or
2. declare workflow pages out of questionnaire-builder scope and obtain product-owner sign-off listing every excluded string.

Do not silently treat workflow content as checked.

### 6.2 Inactive page files

The client repository contains page files for at least:

- `app/intake/protection/all-applicants/health/page.js`
- `app/intake/protection/relationships/page.js`

They are not in the active Protection route registry found during this audit. For each file, record one decision:

- activate it and add it to the journey;
- keep it inactive but include its copy as dormant content;
- delete/deprecate it in a separate, approved cleanup; or
- explicitly exclude it from 866 parity.

The parity test must compare against active routes, while a second orphan-page report prevents these files from disappearing unnoticed.

## 7. First acceptance fixture: Main Applicant Employment

**Client source:** `plylegal-client-portal/app/intake/protection/main-applicant/employment/page.js`  
**Admin page ID:** `protection-main-applicant-employment`  
**Route:** `/intake/protection/main-applicant/employment`  
**Storage section:** `protection_employment`

### 7.1 Page-level content

The admin must display and allow editing of all of the following, while retaining person-name interpolation:

| Client item | Expected value/behavior |
| --- | --- |
| Page title | `Main Applicant's Employment` |
| Page introduction | `In this section, provide details about the main applicant's employment history.` |
| Current-employment question | `Are you currently Employed in a paid position?` |
| Answers | `Yes`, `No` |
| History heading | `Employment History for the Main Applicant ({mainApplicantName})` |
| History guidance | `Enter all employment, unemployment, study and other activities since birth. There can be no gaps in dates.` |
| Add action | `Add` |
| Empty state | `No entries added` |
| Add popup title | `Add Entry` |
| Edit popup title | `Edit Entry` |
| Table headings | `Date From`, `Date To`, `Status`, `Position`, `Employer`, `Country`, `Actions` |
| Open-ended row value | `Ongoing` |
| Row actions | `Edit`, `Delete` |
| Popup actions | `Cancel`, `Ok` |
| Form navigation | `Previous`, `Save Draft`, `Continue` |

Do not store a resolved applicant name as editable content. Store a template/token and render the current profile name at runtime.

### 7.2 Current paid-employment block

This block is visible only when `is_currently_employed === "yes"`.

| Stored key | Client control | Label | Placeholder/options |
| --- | --- | --- | --- |
| `current_employer` | text | Employer/Organization Name | `Enter employer or organization name` |
| `current_position` | text | Position/Occupation | `Enter your current position` |
| `current_country` | country select | Country | `Choose Country` + shared country source |
| `current_employment_type` | select | Employment Type | Full-time, Part-time, Contract, Self-Employed |
| `current_start_date_day` | day select | Date Started group | `Day`, values 01–31 |
| `current_start_date_month` | month select | Date Started group | `Month`, January–December |
| `current_start_date_year` | year select | Date Started group | `Year`, rolling supported range |
| `current_address` | text | Current Workplace Address | `Street, City, State, Postcode` |

The builder must show the visibility condition on every member of the block or show them inside one clearly labelled conditional group. The separate stored keys must remain unchanged.

### 7.3 Employment History popup fields

The current admin catalog has 12 nested storage fields, but the new/proposed editor does not expose them correctly. It must show this complete popup in the exact order:

| Order | Stored key(s) | Client control | Required/condition | Visible copy |
| ---: | --- | --- | --- | --- |
| 1 | `date_from_day`, `date_from_month`, `date_from_year` | grouped day/month/year selects | all required | `Date From`; `Choose Day`, `Choose Month`, `Choose Year` |
| 2 | `date_to_day`, `date_to_month`, `date_to_year` | grouped day/month/year selects | all optional, but all-or-none | `Date To (leave blank if ongoing)`; same three placeholders |
| 3 | `status` | select | required | `Status *`; `Choose Status` |
| 4 | `position` | text | optional; shown only for employer-detail statuses | `Position / Occupation` |
| 5 | `employer` | text | required for employer-detail statuses | `Employer/Organization *` |
| 6 | `employer_address` | text | required for employer-detail statuses | `Employer Address *` |
| 7 | `duties` | textarea | required for employer-detail statuses; max 300 | `Duties/Notes (max 300 characters)` and live `{count}/300 characters` |
| 8 | `country` | country select | required and always visible | `Country *`; `Choose Country` |

`status` options, in order:

1. Employed
2. Student
3. Retired
4. Self-Employed
5. Unemployed
6. Work Experience/Internships
7. Unpaid Employment/Volunteer

Employer-detail fields are shown for:

- Employed
- Self-Employed
- Work Experience/Internships
- Unpaid Employment/Volunteer

### 7.4 Employment validation that must not be lost

The admin schema/presentation must record these rules even while the legacy page remains the runtime implementation:

- Date From day, month, and year are required.
- Date To is either completely blank or all three date parts are supplied.
- Date To cannot precede Date From.
- Status is required.
- Country is required.
- Employer, employer address, and duties are required for employer-detail statuses.
- Duties cannot exceed 300 characters.
- The main applicant's date of birth must exist before final employment-history submission.
- Employment-history rows must provide continuous coverage from birth with no gaps.
- The client must retain its existing overlapping/gap/date-normalisation behavior in `src/lib/protectionHistoryCoverage`.

Validation copy is content too. Catalog the current error and toast strings, even if the first release keeps those strings locked while behavior remains legacy.

### 7.5 Employment-specific regression test

Create one fixture/assertion that fails unless all of the following are present:

- page title and introduction;
- current-employment question and its eight conditional fields;
- dynamic history heading template and no-gap guidance;
- six table columns plus action heading;
- add/empty/add-dialog/edit-dialog/row-action/popup-action copy;
- all 12 nested storage fields represented as the eight visible popup groups above;
- seven status choices in order;
- four employer-detail statuses;
- country/date option-source semantics;
- all cross-field and continuous-history validation annotations;
- unchanged IDs and answer keys.

## 8. All 29 content pages to audit

Counts below describe the current extracted definition. `Help` means descriptions currently captured by the admin JSON, not all help visible on the client. `Intro 0` is a mandatory manual inspection flag.

| # | Page ID / route suffix | Top | Nested | Repeaters | Help | Conditions | Intro | Required audit focus |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | `protection-main-applicant-details` / `main-applicant/details` | 12 | 6 | 1 | 2 | 4 | 1 | Other-citizenship popup, DOB grouping, countries, person copy |
| 2 | `protection-main-applicant-other` / `main-applicant/other` | 9 | 14 | 2 | 0 | 3 | 1 | Other names and previous-DOB popups, all conditional copy |
| 3 | `protection-main-applicant-identity` / `main-applicant/identity` | 11 | 36 | 5 | 0 | 11 | 1 | Passport, national ID, other ID, citizenship and residence-right popups |
| 4 | `protection-main-applicant-employment` / `main-applicant/employment` | 10 | 12 | 1 | 0 | 0 | 1 | Full fixture in section 7 |
| 5 | `protection-main-applicant-education` / `main-applicant/education` | 2 | 13 | 1 | 0 | 0 | 0 | Missing intro/help, education popup, dates/countries/qualification choices |
| 6 | `protection-main-applicant-family` / `main-applicant/family` | 2 | 7 | 1 | 0 | 0 | 0 | Missing intro/help, dynamic applicant name, family popup |
| 7 | `protection-spouse-partner-details` / `spouse-partner/details` | 13 | 6 | 1 | 2 | 4 | 1 | Same depth as main details plus spouse-specific copy |
| 8 | `protection-spouse-partner-other-details` / `spouse-partner/other-details` | 4 | 12 | 1 | 0 | 1 | 1 | Other-name popup and conditions |
| 9 | `protection-spouse-partner-identity` / `spouse-partner/identity` | 7 | 21 | 3 | 0 | 13 | 1 | Current/previous citizenship and permanent-residency popups; verify duplicate extracted labels |
| 10 | `protection-employment` / `employment` | 36 | 0 | 0 | 0 | 0 | 0 | Determine purpose vs main employment; inspect all 36 fields, grouping, profile scope and missing intro |
| 11 | `protection-all-applicants-addresses` / `all-applicants/addresses` | 3 | 13 | 1 | 0 | 0 | 0 | Address popup, address history rules, countries and no-gap copy |
| 12 | `protection-all-applicants-languages` / `all-applicants/languages` | 1 | 6 | 2 | 0 | 0 | 1 | Nested applicant → language repeaters, applicant option source |
| 13 | `protection-all-applicants-contact-details` / `all-applicants/contact-details` | 18 | 0 | 0 | 0 | 15 | 0 | Missing intro, 15 conditions, phone/email/postal copy |
| 14 | `protection-all-applicants-visas` / `all-applicants/visas` | 2 | 26 | 1 | 0 | 0 | 0 | Large visa popup, all dates/countries/outcomes, missing intro/help |
| 15 | `protection-all-applicants-travel-history` / `all-applicants/travel-history` | 2 | 12 | 1 | 0 | 1 | 0 | Travel popup, date ordering/no-gap rules, missing intro/help |
| 16 | `protection-all-applicants-future-travel` / `all-applicants/future-travel` | 2 | 13 | 1 | 0 | 1 | 0 | Future travel popup, dates/countries/purpose, missing intro/help |
| 17 | `protection-all-applicants-future-addresses` / `all-applicants/future-addresses` | 2 | 18 | 1 | 0 | 0 | 0 | Future address popup, address formatting and missing intro/help |
| 18 | `protection-all-applicants-character` / `all-applicants/character` | 54 | 51 | 27 | 0 | 27 | 0 | Every Yes/No follow-up and all 27 detail popups; highest-risk page |
| 19 | `protection-all-applicants-contacts` / `all-applicants/contacts` | 2 | 27 | 1 | 0 | 0 | 0 | Contact popup, relationship/address/identity content, missing intro/help |
| 20 | `protection-children-child-profile-details` / child `details` template | 13 | 6 | 1 | 2 | 4 | 1 | Dynamic child name, citizenship popup, DOB/country controls |
| 21 | `protection-children-child-profile-other` / child `other` template | 2 | 12 | 1 | 0 | 0 | 1 | Child other-name popup |
| 22 | `protection-children-child-profile-identity` / child `identity` template | 7 | 23 | 3 | 0 | 4 | 1 | Passport, national ID and other-ID popups |
| 23 | `protection-children-child-profile-custody` / child `custody` template | 7 | 0 | 0 | 0 | 0 | 0 | Missing intro, custody/legal-document copy and validation |
| 24 | `protection-non-migrating-member-profile-details` / member `details` template | 9 | 0 | 0 | 0 | 0 | 1 | Dynamic member name, DOB/country/select semantics |
| 25 | `protection-non-migrating-member-profile-passport` / member `passport` template | 7 | 0 | 0 | 0 | 0 | 1 | Passport dates/country and validation |
| 26 | `protection-non-migrating-member-profile-identity` / member `identity` template | 2 | 0 | 0 | 0 | 0 | 1 | Identity fields and conditional behavior |
| 27 | `protection-non-migrating-member-profile-other-names` / member `other-names` template | 1 | 3 | 1 | 0 | 0 | 1 | Other-name popup |
| 28 | `protection-non-migrating-member-profile-citizenship` / member `citizenship` template | 2 | 0 | 0 | 0 | 0 | 1 | Country controls and citizenship dates/status |
| 29 | `protection-non-migrating-member-profile-health` / member `health` template | 1 | 0 | 0 | 0 | 0 | 1 | Health wording, choices, conditional/required behavior |

Do not close a row in this table merely because the question count matches. The visible groups, copy, options, conditions, validation, popup presentation, and storage keys must also match.

## 9. Repeater/popup inventory

Every item below must be opened on the client, fully scrolled, captured in the parity manifest, and editable in the new/proposed admin layout.

### Main Applicant

- Details: `citizenships` (6 record fields)
- Other Names: `other_names` (13), `prev_dobs` (1)
- Identity: `passports` (12), `national_id_card` (6), `other_identity_documents` (5), `citizenships` (10), `pr_countries` (3)
- Employment: `employment_history` (12 storage fields / 8 visible groups)
- Education: `education_history` (13)
- Family: `family_members` (7)

### Spouse/Partner

- Details: `citizenships` (6)
- Other Names: `other_names` (12)
- Identity: `citizenships` (10), `previous_citizenships` (10), `permanent_residencies` (1)

The three spouse identity repeaters currently have suspiciously duplicated extracted labels. Compare each against the rendered client page and fix the extraction/enrichment; do not copy one label across all three.

### All Applicants

- Addresses: `main_applicant_addresses` (13)
- Languages: `applicants` (2), containing `languages` (4)
- Visas: `main_applicant_visas` (26)
- Travel History: `main_applicant_travel_history` (12)
- Future Travel: `main_applicant_future_travel` (13)
- Future Addresses: `main_applicant_future_addresses` (18)
- Contacts: `main_applicant_contacts` (27)

### Character

Audit all 27 detail repeaters individually:

- `police_check_details`
- `immigration_detention_details`
- `convicted_offence_details`
- `awaiting_legal_action_details`
- `domestic_violence_details`
- `arrest_warrant_details`
- `child_sex_offence_details`
- `sex_offender_register_details`
- `psychiatric_institution_details`
- `insanity_acquittal_details`
- `unfit_to_plead_details`
- `false_misleading_info_details`
- `visa_refused_details`
- `overstayed_visa_details`
- `deported_removed_details`
- `avoid_removal_details`
- `excluded_from_country_details`
- `citizenship_refusal_details`
- `war_crimes_details`
- `national_security_details`
- `outstanding_debts_details`
- `people_smuggling_details`
- `criminal_conduct_details`
- `violent_org_details`
- `military_training_details`
- `military_service_details`
- `sponsorship_payment_details`

### Child and non-migrating member templates

- Child Details: `citizenships` (6)
- Child Other Names: `other_names` (12)
- Child Identity: `passports` (12), `national_id_card` (6), `other_identity_documents` (5)
- Non-migrating Other Names: `other_names` (3)

## 10. Required parity manifest

Create a machine-readable manifest or generated report for 866. It must be possible to answer "what is missing?" without comparing two screens by memory.

For every page, record:

```text
route
page id
source file
storage section/path
completion key
profile role/template
page title template
intro/content blocks
question order
question id and answerKey
label/help/placeholder
control type and visual grouping
requiredness
options or options source
visibility rule and clear-when-hidden behavior
follow-ups
repeater record fields
repeater table columns and row formatters
add/edit/empty/action/dialog copy
validation rules and messages
dynamic interpolation tokens
review/print label
client test selectors where useful
```

The audit should emit at least these categories:

- `missing_in_admin`
- `extra_in_admin`
- `copy_mismatch`
- `order_mismatch`
- `type_mismatch`
- `options_mismatch`
- `required_mismatch`
- `condition_mismatch`
- `validation_not_represented`
- `presentation_not_represented`
- `storage_key_mismatch`
- `inactive_client_page`
- `unclassified_client_string`

Fail CI if an active page, visible field, popup field, or user-facing string is unclassified. Allow an explicit, reviewed exclusion with a reason; do not allow an implicit omission.

## 11. Recommended metadata model

Use the existing question model where it is already sufficient. Add narrowly scoped metadata only for information that cannot be expressed today.

One possible shape is:

```json
{
  "id": "employment-history",
  "answerKey": "employment_history",
  "type": "repeater",
  "label": "Employment History for the Main Applicant ({mainApplicantName})",
  "description": "Enter all employment, unemployment, study and other activities since birth. There can be no gaps in dates.",
  "metadata": {
    "fields": [],
    "presentation": {
      "addLabel": "Add",
      "emptyMessage": "No entries added",
      "addDialogTitle": "Add Entry",
      "editDialogTitle": "Edit Entry",
      "columns": [
        { "key": "date_from_day", "label": "Date From", "format": "protectionDate" },
        { "key": "date_to_day", "label": "Date To", "format": "protectionDateOrOngoing" },
        { "key": "status", "label": "Status" },
        { "key": "position", "label": "Position" },
        { "key": "employer", "label": "Employer" },
        { "key": "country", "label": "Country" }
      ],
      "actions": {
        "edit": "Edit",
        "delete": "Delete",
        "cancel": "Cancel",
        "confirm": "Ok",
        "actionsHeading": "Actions"
      }
    },
    "validation": {
      "rules": [],
      "messages": {}
    }
  }
}
```

This is a design direction, not permission to add arbitrary executable JSON. Use named, allow-listed formatters, validators, and option sources. Never evaluate code stored in Firestore.

For large/reusable options, support reviewed sources such as:

- `countries`
- `daysOfMonth`
- `months`
- `rollingYears`
- `applicants`

The admin validator, admin preview, client validator, client renderer, review renderer, print/PDF renderer, and migration logic must agree on any new source. The current code only has limited source support; extending the schema in one repository alone is incomplete.

For grouped date controls, preserve each existing `answerKey`. Add presentation metadata that groups the three controls visually rather than replacing their stored shape.

For dynamic copy, use named tokens such as `{mainApplicantName}`, `{spouseName}`, or `{profileName}`. Validate allowed tokens and show a preview value in the admin; do not save a real client's name in a reusable questionnaire definition.

## 12. Step-by-step implementation plan

### Step 0 — Establish a clean, reproducible baseline

1. Read `AGENTS.md` in both repositories.
2. Read the relevant Next.js 16 documentation from each repository's `node_modules/next/dist/docs/` before changing framework code.
3. Record `git status --short` in both repositories and preserve unrelated changes.
4. Create a Test copy of the active 866 definition and export/snapshot its current JSON and revision.
5. Capture representative saved 866 draft fixtures with sensitive data removed:
   - main applicant only;
   - spouse included;
   - child included;
   - non-migrating member included;
   - repeaters empty;
   - repeaters populated.
6. Run current admin and client unit tests, lint, type checks, and builds. Record pre-existing failures separately.
7. Capture baseline screenshots for each active route at desktop and mobile widths, including every popup open and scrolled to its end.

### Step 1 — Build the 866 parity audit before changing content

1. Add a focused audit script/test, for example `scripts/audit-protection-866-parity.mjs`.
2. Read the active route registry rather than scanning page files alone.
3. Resolve dynamic child and non-migrating templates to their source pages.
4. Inventory visible strings, controls, registered field names, options, conditions, RepeaterTable props, schema validation, submit-time validation, and storage calls.
5. Compare that inventory with `getBuiltInQuestionnaireDefinition({ visaType: "protection" })` recursively.
6. Produce JSON plus a human-readable Markdown/table report.
7. Add an explicit exclusion file for workflow/system strings and inactive pages. Every exclusion needs an owner and reason.
8. Commit the baseline report or snapshot so future changes create a reviewable diff.

Do not start by manually filling the Employment JSON. That would fix one symptom while leaving the extraction defect and the other 56 repeaters unchanged.

### Step 2 — Make extraction and enrichment complete

Update `scripts/extract-questionnaire-built-ins.cjs` and/or add a Protection-specific enrichment layer.

The extractor must capture straightforward literal information. Use a curated 866 manifest/enricher where JSX, derived state, validation, or shared components make AST inference ambiguous.

Required additions:

1. Capture explanatory paragraphs outside `CardHeader` and associate them with the correct page/question/repeater.
2. Capture `RepeaterTable` presentation props:
   - column keys/labels;
   - add text;
   - empty text;
   - dialog title/subtitle;
   - dialog component identity;
   - named row formatters such as `Ongoing`.
3. Traverse the popup/dialog component and capture all nested fields in rendered order.
4. Capture shared/default copy from `RepeaterTable`, not only explicitly passed props.
5. Represent grouped day/month/year selects while retaining their three answer keys.
6. Represent large shared option sources instead of dropping them because they exceed an option-count threshold.
7. Capture set-membership and derived visibility conditions, or add them in a reviewed enricher.
8. Capture min/max length, all-or-none dates, date ordering, and submit-time validators as named validation annotations.
9. Capture dynamic title/label templates rather than their temporary rendered value.
10. Preserve `originalLabel`, `originalDescription`, `originalPlaceholder`, original option labels, original intro blocks, and original presentation copy for safe legacy overlays.
11. Add a test proving generator output is deterministic.

Keep generated data deterministic and reviewable. If source order changes, the generated diff should show only the affected pages.

### Step 3 — Extend schema validation and presentation safely

Update the shared definition rules in the admin and matching client code.

1. Define an allow-listed schema for repeater presentation metadata.
2. Define allow-listed option sources, formatter IDs, validator IDs, and interpolation tokens.
3. Recursively validate `metadata.fields` as today.
4. Validate column keys against fields available in the repeater row.
5. Reject unknown formatter/validator IDs.
6. Reject duplicate nested IDs or answer keys.
7. Ensure conditions inside a row can only reference answers available in that row unless a supported page-scope reference is explicit.
8. Put maximum lengths on all editable copy arrays and strings.
9. Sanitize/render content consistently; do not introduce raw HTML editing unless separately designed and secured.
10. Add serialization and round-trip tests so metadata survives API, Firestore, revision, copy-as-test, and publish flows.

### Step 4 — Fix the new/proposed builder without changing its design

Work in `src/components/admin/AdminQuestionnaireBuilder.jsx`.

1. Thread `onUpdateNestedQuestion`, `onDeleteNestedOption`, nested `sourceQuestions`, and any required structural-change callback into `ProposedInlineQuestionEditor`.
2. When the selected question is a repeater, add a section titled **Entry fields** below the current top-level controls.
3. Render every `metadata.fields` item recursively using `EmbeddedNestedQuestionEditor` or a thin visual wrapper around it.
4. Preserve nested field order and provide existing safe add/remove/reorder controls only where the schema/runtime supports them.
5. Add a separate collapsible **Table and popup wording** section for:
   - column labels/order;
   - add button;
   - empty state;
   - add/edit popup titles/subtitle;
   - row/action/footer labels;
   - named row formatters.
6. Show grouped fields together in the preview: Date From should look like one label with three selects, not three unrelated text inputs.
7. Show conditions and requiredness beside the nested field they affect.
8. Show legacy/dynamic status clearly. Copy-only edits must not silently promote a page. Structural edits must show an explicit warning and only be allowed when the page passes the dynamic parity gate.
9. Keep the proposed layout's current fonts, scale, colors, border treatment, spacing, two-column shell, sidebar, responsive step toggle, pencil actions, and insertion controls.
10. Keep the existing/current layout working and backed by the same state.
11. Verify unsaved nested edits survive switching between Current and Proposed layouts.

Do not clone nested editor logic. One mutation path must update the same definition state in both layouts.

### Step 5 — Make legacy client components consume all editable copy

Work primarily in:

- `src/lib/questionnaires/legacyCopy.js`
- `src/components/questionnaire/QuestionnaireCopyContext.jsx`
- `src/components/RepeaterTable.jsx`

Required work:

1. Extend the legacy copy maps to include repeater presentation, validation messages, action labels, and named body/copy blocks.
2. Make `RepeaterTable` translate or receive translated:
   - column labels in desktop and mobile layouts;
   - `Actions`;
   - add text;
   - empty text;
   - Add Entry/Edit Entry titles;
   - subtitle;
   - Edit/Delete;
   - Cancel/confirm labels where the popup delegates them.
3. Make row format strings such as `Ongoing` translatable/editable without allowing arbitrary formatter code.
4. Ensure the popup's nested `Label`, `Input`, `Textarea`, `SelectValue`, and `SelectItem` copy resolves by the correct nested field path.
5. Handle repeated labels safely. Do not use global string replacement when the same baseline text is intentionally edited differently in two fields; prefer field-path-aware lookup.
6. Add tests for nested paths containing array indices and for duplicate labels.
7. Keep the original hard-coded validation and storage behavior while a page remains legacy.

After this step, adding a previously missing but now catalogued Employment description must remain a safe legacy copy edit rather than causing accidental dynamic promotion.

### Step 6 — Reconcile every 866 page

Use the manifest and page matrix, not ad hoc visual memory.

For each of the 29 templates:

1. Open the Client Portal route with the relevant applicant/profile context.
2. Record the page title, intro, body guidance, section headings, questions, and navigation copy.
3. Trigger every Yes/No and select branch.
4. Open every repeater popup in Add mode.
5. Scroll to its end and record all fields, group labels, help, placeholders, required marks, options, actions, and counter text.
6. Add a row, inspect the table/card output, then open Edit mode.
7. Trigger validation for empty, partial, invalid-order, and maximum-length cases.
8. Compare storage output before and after the catalog changes.
9. Update extraction/enrichment, regenerate the built-ins, and rerun the audit.
10. Mark the page complete only when every manifest category is empty or explicitly waived.

Recommended implementation order:

1. Main Applicant Employment (acceptance fixture)
2. Addresses, Education, Travel History, Future Travel, and Future Addresses (date/history patterns)
3. Identity and Visas (large popup patterns)
4. Languages (nested repeater pattern)
5. Character (large conditional/repeater set)
6. Main/Spouse/Child/Non-migrating profile templates
7. Workflow and inactive-page decisions

### Step 7 — Decide and gate structural editability

Complete content parity first. Then decide page by page whether structural controls remain legacy-safe/locked or the page is certified for the dynamic renderer.

A page may be promoted to dynamic only when all of these match the legacy client:

- control type and grouped layout;
- option sources and ordering;
- visibility and clear-hidden behavior;
- requiredness;
- repeaters and nested repeaters;
- all validation, including cross-field and cross-row rules;
- person/profile scoping;
- default values;
- save-draft and continue behavior;
- completion marking;
- review and print rendering;
- saved answer shape and field keys;
- accessibility and mobile behavior.

Until then:

- allow complete copy editing through the legacy overlay;
- display structural semantics accurately in the admin preview;
- disable or clearly gate structural changes that would promote the page;
- never present a type/required/condition edit as live if the legacy runtime will ignore it.

If full structural editability is required now, migrate all affected 866 pages deliberately and include the dynamic parity work in the release. Do not rely on the builder's current automatic promotion as the migration strategy.

### Step 8 — Upgrade built-in and saved definitions without data loss

The current legacy catalog version is `3`. After the schema/catalog changes:

1. Bump the catalog version once the new defaults are stable.
2. Merge by stable page route/ID and question `id`/`answerKey`, recursively through follow-ups and `metadata.fields`.
3. Add newly catalogued copy/presentation metadata only where it is absent.
4. Preserve administrator-edited values when they differ from the previous original baseline.
5. Update `original*` baselines carefully so an old administrator edit does not become the new original.
6. Preserve custom pages/questions and unrelated metadata.
7. Preserve definition ID, status, version display value, revision history, audience, and visa contexts.
8. Never rewrite submitted answer documents.
9. Generate a dry-run report containing added, preserved, conflicted, and unresolved items.
10. Test the merge against active, Test, archived, and previously edited 866 definitions.
11. Make the migration idempotent.

Use Copy as Test for verification, then publish through the existing controlled lifecycle so the previous live definition is archived and revision history remains intact.

### Step 9 — Verify and roll out

1. Run all focused tests in both repositories.
2. Run full lint/type/build checks.
3. Run the parity audit and require zero unexplained omissions.
4. Exercise admin edit → save Test → client load for representative copy at every content layer:
   - page title;
   - intro;
   - top-level label;
   - nested popup label;
   - nested placeholder;
   - option label;
   - table heading;
   - add/empty/dialog/action copy;
   - validation message, if made editable.
5. Confirm unchanged client behavior with populated historical drafts.
6. Perform desktop and mobile screenshot comparison for all routes and popups.
7. Obtain product/legal review of all 866 wording changes.
8. Publish to a controlled environment, monitor load/save/validation errors, then promote.
9. Keep a rollback definition/revision and verify the archive can be restored.

## 13. Per-page checking worksheet

Copy this checklist for each page and attach the result to the implementation PR.

### Route and identity

- [ ] Active route matches `routes.js`.
- [ ] Dynamic profile/query parameters are represented.
- [ ] Page ID, route, section key, completion key, and storage section match.
- [ ] Page order and sidebar group match.
- [ ] No inactive file was mistaken for an active step.

### Page content

- [ ] Page title and dynamic name tokens match.
- [ ] Introduction matches.
- [ ] Every explanatory paragraph, heading, note, warning, and list is catalogued.
- [ ] Previous, Save Draft, Continue, and any page-specific actions are accounted for.
- [ ] Review/print wording is accounted for.

### Questions

- [ ] Every visible question is present once and in order.
- [ ] Stable `id` and `answerKey` are unchanged.
- [ ] Label, help, placeholder, required mark, and default value match.
- [ ] Actual control type matches the client presentation.
- [ ] All options and their order/value/label match.
- [ ] Shared option sources match.
- [ ] Conditions, controlling values, and clear-hidden behavior match.
- [ ] Dynamic applicant/person labels use safe templates.

### Repeater/popup

- [ ] Add, empty, Add Entry, Edit Entry, subtitle, Actions, Edit, Delete, Cancel, and confirm copy match.
- [ ] Desktop table and mobile card labels match.
- [ ] All popup fields are present and ordered.
- [ ] Grouped date/address/name controls match.
- [ ] Nested fields expose label/help/placeholder/type/options/required/conditions in the proposed builder.
- [ ] Row formatting, including fallback and `Ongoing` text, matches.
- [ ] Add, edit, delete, cancel, keyboard focus, and scroll behavior work.

### Validation and persistence

- [ ] Required errors match.
- [ ] Partial-date and date-order rules match.
- [ ] Length/range/pattern rules match.
- [ ] Conditional required rules match.
- [ ] Cross-row/no-gap rules match.
- [ ] Error and toast copy is catalogued.
- [ ] Save Draft stores the same JSON shape.
- [ ] Continue marks the same completion key.
- [ ] Existing saved answers load and remain editable.
- [ ] Review/PDF output still labels answers correctly.

### Admin behavior

- [ ] Current and Proposed layouts show the same definition state.
- [ ] The Proposed layout exposes every nested field.
- [ ] Editing and saving preserves IDs/keys/metadata not touched by the user.
- [ ] Switching layouts preserves unsaved edits.
- [ ] Copy-only legacy edits do not accidentally promote the page.
- [ ] Structural edits are gated until dynamic parity is certified.

## 14. File-by-file implementation map

### Admin Portal

| File | Expected work |
| --- | --- |
| `src/components/admin/AdminQuestionnaireBuilder.jsx` | Add recursive repeater-field and presentation editing to the new/proposed layout; add safe legacy/dynamic gating; reuse existing state handlers |
| `src/lib/questionnaireClientPresentation.js` | Present nested groups, date groups, repeater columns/chrome, tokens, and option sources accurately in the admin preview |
| `src/lib/questionnaireDefinitions.js` | Validate new allow-listed presentation/validation/option-source metadata recursively |
| `scripts/extract-questionnaire-built-ins.cjs` | Capture missing page/body/repeater/dialog/control data and produce deterministic output |
| `src/lib/questionnaireBuiltIns.js` | Apply 866 enrichers and bump/reconcile catalog version when ready |
| `src/lib/questionnaireBuiltInPages.js` | Regenerate only; never edit manually |
| `src/lib/questionnaireLegacyProtection.js` | Preserve safe legacy structure and control intentional promotion |
| `test/adminQuestionnaireBuilder.test.mjs` | Proposed-layout nested/presentation editing and legacy-promotion tests |
| `test/questionnaireLegacyProtection.test.mjs` | Safe content edits vs structural promotion and catalog-upgrade tests |
| `src/lib/questionnaireClientPresentation.test.mjs` | Complete Protection Employment and representative repeater presentation fixtures |
| `src/lib/questionnaireBuiltIn*.test.mjs` | 866 catalog, options, conditions, requiredness, and validation annotation coverage |
| new 866 audit script/test | Recursive parity report and CI failure on omissions |

### Client Portal

| File | Expected work |
| --- | --- |
| `src/lib/questionnaires/legacyCopy.js` | Add field-path-aware repeater/presentation/body/action/validation copy maps |
| `src/components/questionnaire/QuestionnaireCopyContext.jsx` | Expose translation hooks/kinds needed by shared primitives |
| `src/components/RepeaterTable.jsx` | Consume editable table/popup/action/empty/formatter copy on desktop and mobile |
| `src/components/questionnaire/DynamicQuestionnairePage.jsx` | Only if dynamic 866 migration is included: support the approved metadata and behavior |
| client questionnaire validation modules | Validate option sources, formatters, validators, tokens, and nested metadata consistently |
| `app/intake/protection/**/page.js` | Source-of-truth review; prefer shared constants/components where safe, but do not rewrite pages merely for extraction convenience |
| `src/lib/protectionHistoryCoverage.js` | Preserve history coverage behavior; expose a named validator only if the dynamic renderer needs it |
| `src/lib/protectionHistoryCoverage.test.js` | Retain and extend no-gap/overlap/date-boundary coverage |
| new legacy-copy tests | Prove nested labels, duplicate labels, table/popup copy, and action copy update correctly |
| new 866 Playwright spec | Walk active routes, trigger conditions, open every popup, and verify representative admin-published copy |

If a file name has changed by implementation time, locate the equivalent symbol with `rg`; do not create a duplicate subsystem because the path differs.

## 15. Automated test requirements

### 15.1 Admin tests

Add tests that prove:

1. The 866 built-in has the expected 29 content templates and every active route is represented once.
2. Employment contains the complete fixture in section 7.
3. Every repeater has non-empty nested fields plus presentation metadata or an explicit reviewed exception.
4. Every repeater column references a real row field.
5. Every visible client copy token is represented or explicitly excluded.
6. The new/proposed layout can select `Employment History`, show all nested fields, edit a nested label/help/placeholder/option, edit table/popup copy, save, and preserve IDs/answer keys.
7. Nested conditions cannot reference an invalid scope.
8. Switching Current ↔ Proposed preserves the same unsaved nested edit.
9. Copy-only legacy edits remain legacy.
10. A structural edit cannot promote an uncertified 866 page without an explicit gated action.
11. Definition serialization and Copy as Test preserve new metadata.
12. Catalog migration preserves old administrator edits and is idempotent.

Focused commands available today include:

```powershell
node --test test/adminQuestionnaireBuilder.test.mjs
node --test test/questionnaireLegacyProtection.test.mjs
node --test src/lib/questionnaireClientPresentation.test.mjs
node --test src/lib/questionnaireDefinitions.test.mjs
node --test src/lib/questionnaireBuiltIns.test.mjs
node --test src/lib/questionnaireBuiltInDetails.test.mjs
node --test src/lib/questionnaireBuiltInConditionalRules.test.mjs
node --test src/lib/questionnaireBuiltInRequired.test.mjs
node --test src/lib/questionnaireBuiltInCharacter.test.mjs
pnpm lint
pnpm build
```

The Admin Portal currently has no `test` package script, so keep the explicit Node test commands or add a reviewed script as part of this work.

### 15.2 Client tests

Add tests that prove:

1. Legacy copy changes reach page title, intro, field label, nested label, placeholder, option, table heading, empty state, popup title, action, and named row-format copy.
2. Two identical baseline labels can be edited differently through field-path-aware mapping.
3. Array indices do not break nested copy lookup.
4. Employment keeps all current validation behavior.
5. Existing 866 drafts round-trip without key or shape changes.
6. If any page is dynamic, its rendered fields/conditions/validation match its legacy fixture.

Use the repository scripts:

```powershell
pnpm test
pnpm check
pnpm test:e2e
pnpm build
```

### 15.3 End-to-end matrix

Run at least these profile states:

| Scenario | Main | Spouse | Child | Non-migrating member |
| --- | ---: | ---: | ---: | ---: |
| Main only | 1 | 0 | 0 | 0 |
| Couple | 1 | 1 | 0 | 0 |
| Family | 1 | 1 | 2 | 0 |
| Non-migrating | 1 | 0 or 1 | 0 or more | 1 or more |

For every scenario:

- compare route order and sidebar visibility;
- verify dynamic names/tokens;
- visit all applicable pages;
- trigger every conditional branch at least once across the suite;
- open all applicable repeaters;
- save and reload;
- verify review/submit and admin review labels;
- repeat representative pages at mobile width.

## 16. Definition of done

The work is complete only when all statements below are true.

- [ ] The active 866 route inventory is documented and automatically checked.
- [ ] Workflow pages and inactive page files have explicit scope decisions.
- [ ] All 29 content templates pass the parity manifest.
- [ ] All 57 repeaters and all nested popup fields are represented.
- [ ] Main Applicant Employment passes the exact fixture in section 7.
- [ ] Every client-facing string is editable or has an explicit, approved locked-system-copy reason.
- [ ] The new/proposed builder shows and edits nested record fields while keeping the current design.
- [ ] Table, popup, empty-state, action, row-format, and validation copy is no longer invisible to the content model.
- [ ] Grouped date selects and country/options sources are represented accurately without changing stored keys.
- [ ] Copy-only legacy edits do not accidentally switch renderer.
- [ ] Any page allowed to switch to dynamic has passed the full behavior gate.
- [ ] Existing administrator edits survive catalog upgrade.
- [ ] Existing saved 866 answers load, save, review, print, and submit without data-shape changes.
- [ ] Admin and client unit, integration, E2E, lint/type, and production-build checks pass.
- [ ] Desktop and mobile visual checks cover every page and popup.
- [ ] Product/legal has reviewed the final 866 wording inventory.
- [ ] Rollback to the previous live definition/revision has been tested.

## 17. PR evidence checklist

Each implementation PR should include:

- before/after parity report;
- generated catalog diff with an explanation of every affected 866 page;
- screenshots of the new/proposed admin layout editing Employment nested fields and popup/table copy;
- client screenshots showing the same published Test copy;
- test output;
- migration dry-run output;
- confirmation that IDs, answer keys, routes, completion keys, and storage paths did not change;
- list of explicit exclusions or follow-up decisions;
- rollback instructions.

Do not accept a PR whose evidence is limited to the three Employment screenshots. The release claim is full 866 parity, so the evidence must cover the full active journey and all reusable popup patterns.
