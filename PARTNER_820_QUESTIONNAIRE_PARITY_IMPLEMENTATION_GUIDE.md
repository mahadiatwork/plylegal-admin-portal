# Partner Visa (Subclass 820) Questionnaire Parity Implementation Guide

**Status:** Ready for implementation  
**Audit date:** 10 November 2026  
**Admin repository:** `F:\Work Projects\ply-legal-admin-portal`  
**Client repository:** `F:\Work Projects\plylegal-client-portal`  
**Built-in definition:** `built-in-partner`  
**Companion guides:** `PROTECTION_866_QUESTIONNAIRE_PARITY_IMPLEMENTATION_GUIDE.md`, `SKILLS_IN_DEMAND_482_QUESTIONNAIRE_PARITY_IMPLEMENTATION_GUIDE.md`, `EMPLOYER_NOMINATION_186_QUESTIONNAIRE_PARITY_IMPLEMENTATION_GUIDE.md`  
**Current implementation notes:** `EXCLUSIONS.md` in both repositories

## 1. Outcome

Make the Admin Portal questionnaire builder a complete and trustworthy editor for every active Partner Visa subclass 820 questionnaire page rendered by the Client Portal.

The implementation must:

1. Preserve the current **new/proposed Client-style builder layout**. Extend it; do not replace or redesign it.
2. Represent all 43 active Partner content-page templates and the profile-dependent journey that instantiates them.
3. Represent every active top-level question, fixed record, repeating record, popup field, option, condition, validation rule, answer path, and completion key.
4. Make all safe client-facing content editable: page titles, introductions, paragraphs, lists, section headings, labels, help text, placeholders, options, table headings, popup titles/descriptions, empty states, actions, counters, and validation messages.
5. Preserve exact client ordering, grouping, requiredness, conditional visibility, dynamic applicant/sponsor sources, row presentation, and completion behavior.
6. Preserve stable definition, page, question, route, answer, storage, completion, profile, and compatibility identifiers.
7. Distinguish active rendered content from commented-out UI, legacy aliases, derived display values, and storage-only compatibility fields.
8. Make legacy-rendered Partner pages consume administrator-edited copy before claiming that copy is editable.
9. Never promote an incomplete legacy page to the dynamic renderer merely because some missing copy has been added.
10. Protect old drafts, unknown legacy fields, saved option values, and administrator-edited wording during catalog upgrades.
11. Resolve the 820/801/309 audience boundary before publishing; do not silently claim that an 820 audit proves offshore 309/100 or permanent-stage 801 parity.
12. Prove parity with an automated audit, focused catalog tests, full Partner E2E coverage, and desktop/mobile visual evidence.

This is not only an Employment popup patch. Employment is the first acceptance fixture because it demonstrates the reported failure, but Family Sponsor Character, Relationships, All Applicants Health/Character, profile-scoped pages, and every remaining record must pass the same audit.

## 2. Relationship to the current 866, 482, and 186 work

The worktrees already contain in-progress shared questionnaire infrastructure and temporary-work parity work. Read both repositories' `EXCLUSIONS.md` files and current diffs before starting Partner work.

The current shared work includes:

- visa-neutral date grouping, country sources, and repeater presentation fallback in `src/lib/questionnaireBuiltInRecordEnrichment.js`;
- 482/186-specific enrichment and audits;
- recursive proposed-builder controls for nested fields, popup sections, presentation, and validation;
- a `RepeaterTable` legacy-copy bridge; and
- partial copy consumption for selected temporary-work dialogs.

The Partner definition does **not** currently receive those finalization layers. `src/lib/questionnaireBuiltIns.js` applies shared Details, Identity, Character, Choices, and Conditional Rules enrichers, but it applies record date/country finalization and presentation fallback only to Protection or Temporary Work.

Partner work should therefore:

1. Reuse only genuinely visa-neutral record and presentation infrastructure.
2. Add a dedicated Partner reconciliation layer, for example `questionnaireBuiltInPartnerEnrichment.js`.
3. Keep Partner-specific copy, storage, conditions, profile behavior, and legacy aliases out of 866/482/186 modules.
4. Improve shared extraction/runtime capabilities when the semantics are truly common.
5. Re-run all four built-in audits after every shared change.

The target architecture should be conceptually:

```text
generated /intake/partner pages
        |
        v
Partner page reconciliation
        |
        v
shared details / identity / choices / conditions
        |
        v
visa-neutral record finalization
  - grouped dates
  - country/applicant sources
  - fixed-record classification
  - popup/table presentation
        |
        v
Partner-only compatibility + audience metadata
```

Do not import Protection legal wording or Temporary Work context behavior merely because the field shape looks similar.

## 3. Confirmed architecture and root causes

### 3.1 All 43 Partner pages still use the legacy renderer

The current `built-in-partner` contains 43 content templates and all 43 have `metadata.renderer: "legacy"`. There is no Partner-specific dynamic page today.

This has two consequences:

- the admin definition is an editable catalog/preview, not automatically the client runtime contract; and
- every editable legacy string must be consumed by the mounted Partner React page through the legacy-copy bridge.

An admin editor without a matching client consumer creates false confidence: the preview changes while the applicant still sees hard-coded copy.

### 3.2 Partner receives raw extractor output instead of record finalization

The current definition contains hundreds of date and country controls still represented as generic text. Examples include:

- Employment `date_from_day`, `date_from_month`, and `date_from_year` as three text nodes;
- Employment `country` as text rather than the client country selector;
- witness birth dates mislabeled as `After Hours Phone Number`;
- All Applicants Character popup fields omitted because they are supplied through reusable dialog components; and
- fixed national-ID objects presented with repeating-list semantics.

Partner must use the neutral grouping/source/presentation infrastructure after a page-specific audit. Heuristics may identify candidates; they may not decide semantics without reviewing the mounted component.

### 3.3 The extractor sees source text, not the mounted experience

`scripts/extract-questionnaire-built-ins.cjs` remains a starting point. It does not reliably determine:

- whether a component is mounted, commented out, or only a legacy alias;
- copy supplied by shared components such as `CharacterInstructions`;
- popup headings, descriptions, field groups, and button labels;
- table columns and row formatters;
- dynamic applicant, sponsor, country, phone-code, relationship, language, or status sources;
- derived display fields versus stored answers;
- cross-field and cross-row validation;
- profile-scoped storage paths and fallbacks; or
- whether a source-declared field is actually rendered.

Confirmed examples:

| Source/catalog issue | Required classification |
| --- | --- |
| Employment `business_address_street_line2` is stored/defaulted but not mounted in the active popup | `storage-only` until product mounts it |
| Health Insurance question/dialog is present inside commented JSX | `inactive-commented`, not active questionnaire content |
| Health `close_contact_tb` and `tuberculosis_exposure_details` are active but absent from the catalog | `missing-in-admin` |
| Future Travel `from_to` and `start_date` are derived row/table values | `derived-display`, not editable answer fields |
| Future Addresses `address_display`, `date_from`, `date_to`, and `address` are derived/compatibility values | classify and lock; do not show as ordinary questions |
| Main Applicant Family `name` and `dob` are display/compatibility aliases | preserve, but do not duplicate the rendered inputs |
| Previous Sponsorship `selected_person` is UI state/derived selection | do not expose as an ordinary popup answer without proof |
| Addresses `applicant_ids` is a multi-applicant selector, not a nested Add/Edit repeater | use an applicant multi-select source |

### 3.4 The active journey is profile-dependent

`getDynamicPartnerRoutes()` is the linear journey authority. It constructs pages for the profiles and non-migrating members in the draft.

The static `PARTNER_VISA_ROUTES` array contains `/intake/partner/children/start`, but:

- `getDynamicPartnerRoutes()` skips that route and goes directly to each child's four profile pages; and
- no `app/intake/partner/children/start/page.js` exists.

The coding agent must choose and test one path:

- remove the stale static route and keep direct child navigation; or
- deliberately build a Children index/sidebar page and define whether it participates in progress and completion.

Do not leave a clickable 404 route in the sidebar.

### 3.5 Several extracted storage paths are not the runtime paths

The four Relationships pages save to:

| Page | Runtime storage |
| --- | --- |
| Current Relationship | `relationships.currentRelationship` |
| Relationship Details | `relationships.relationshipDetails` |
| Previous Relationships | `relationships.previousRelationships` |
| Supporting Witnesses | `relationships.supportingWitnesses` |

The current built-in reports flat `partner_*` storage paths for all four. Reconcile metadata to the actual runtime paths while retaining explicit legacy aliases if old drafts used the flat keys.

Profile pages also require profile-aware resolution:

- main/spouse/child answers normally live in `profiles_data[profileId][section]`;
- legacy single-person fallbacks use paths such as `mainApplicant.*`, `partner_spouse_other`, or `partner_identity`;
- child completion keys include the concrete child ID plus the `__profileId` completion suffix; and
- non-migrating pages reuse the temporary-work page implementations but store under the selected member.

Never replace a profile path with a single shared path in the catalog.

### 3.6 The 820/801/309 audience boundary is unresolved

Current behavior is internally inconsistent:

- the admin matter selector exposes both 820 and 309;
- both map to `visaType: "partner"` with no distinguishing context;
- `getDefinitionMatterTypeOption()` labels every Partner definition as 820;
- `definitionMatchesMatterType()` allows any Partner definition for either 820 or 309;
- the client uses `PARTNER_PUBLIC_SLUG = "820"`;
- `normalizeApplicationSlug("309")` returns `820`;
- `getApplicationSlug()` sends detected 309 Partner matters to the 820 route;
- resource matching recognises 820, 801, and 309; and
- the built-in title is specifically `Partner Visa (Subclass 820)`.

This guide audits the currently mounted 820 Partner workflow. It does not certify that its legal content is correct for 309/100 or 801.

### 3.7 Submit completion is not a substitute for page validation

For non-temporary-work visas, `submitCompletion.js` checks the target page completion list and supplements main-applicant identity/personal-details checks. It does not centrally reconstruct every Partner page schema.

Therefore the authoritative contract is the combination of:

1. the mounted page/dialog Zod schemas;
2. conditional rendering and form state;
3. save and completion handlers;
4. profile-scoped completion keys;
5. `getTargetVisaPages()`; and
6. dynamic-definition validation when a page is deliberately promoted.

Copying only required flags into the admin definition is insufficient. Cross-field rules and minimum row counts must be represented or deliberately locked.

### 3.8 Existing Partner tests cover fragments, not the full journey

Relevant existing suites include:

- `e2e/questionnaire-sponsor-alignment.spec.js`;
- `e2e/questionnaire-all-applicants-alignment.spec.js`;
- `e2e/questionnaire-target-personal.spec.js`;
- `e2e/questionnaire-target-review.spec.js`;
- `e2e/main-applicant-identity-parity.spec.js`;
- `e2e/questionnaire-schema-repeaters.spec.js`;
- `test/allApplicantsParity.test.js`; and
- questionnaire storage compatibility tests.

There is no single full `e2e/questionnaire-820.spec.js` journey proving all active Partner pages, profile scenarios, copy consumption, storage, validation, and completion.

## 4. Non-negotiable guardrails

- Read both repositories' `AGENTS.md` files before editing.
- This project uses a breaking-change version of Next.js. Read the relevant guide under `node_modules/next/dist/docs/` before changing Next.js code.
- Read both `EXCLUSIONS.md` files and inspect both worktree diffs before touching overlapping files.
- Run `git status --short` in both repositories before and after each logical phase.
- Preserve all current user and coding-agent changes.
- Do not hand-edit `src/lib/questionnaireBuiltInPages.js`; regenerate it.
- Do not copy Partner content from the 866, 482, or 186 guides without checking the mounted Partner page.
- Do not add active content from commented-out JSX.
- Do not expose derived display values or storage-only compatibility keys as normal questions.
- Do not turn fixed objects such as `national_id_card` into Add/Edit lists.
- Do not turn `applicant_ids` into a nested repeater.
- Do not merge persisted day/month/year answer keys; group their presentation only.
- Do not duplicate long country, language, phone-code, relationship, or applicant lists when an allowlisted runtime source can be used.
- Do not change option values while editing option labels.
- Preserve unknown saved option values and unknown legacy row properties on edit/save.
- Do not invent continuous-date validation merely because Employment copy says there can be no gaps; the current page does not enforce it.
- Do not silently strengthen Character detail validation; record a product/legal decision first.
- Do not silently weaken the supporting-witness minimum of two.
- Do not publish a definition to both 820 and 309 until the audience decision is explicit.
- Do not publish directly to a live definition while implementing. Use an isolated Test copy.
- Do not promote a legacy page unless every active field, condition, source, validator, storage path, completion rule, and compatibility behavior is supported dynamically.
- Do not mark copy as editable until the active legacy client component consumes it.
- Do not consider a popup checked until its full scrollable contents have been reviewed at desktop and mobile widths.

## 5. Source-of-truth hierarchy

When evidence conflicts, use this order:

1. **`getDynamicPartnerRoutes()` and `getTargetVisaPages("partner", draft)`** determine active, profile-dependent journey and completion scope.
2. **Actually rendered Client Portal JSX** determines active copy, controls, ordering, grouping, and conditions.
3. **Page and dialog schemas** determine validation.
4. **Draft-store reads/writes and completion calls** determine persisted paths, aliases, and completion keys.
5. **Shared UI components** determine default table/dialog/action/empty-state content.
6. **Compatibility normalizers** determine legacy preservation and aliases.
7. **Screenshots and E2E behavior** confirm the mounted experience.
8. **Unmounted/commented source** is product evidence, not active content.
9. **The admin built-in** is extraction output to reconcile, not the authority.

For every route, record the source file, route constructor, profile scope, storage path, legacy aliases, completion key, validation source, option sources, shared components, and presentation before changing its catalog entry.

## 6. Current 820 baseline snapshot

The current `built-in-partner` reports:

| Measure | Current value |
| --- | ---: |
| Definition ID | `built-in-partner` |
| Title | `Partner Visa (Subclass 820)` |
| `visaType` | `partner` |
| Partner subclass/context discriminator | None |
| Content-page templates | 43 |
| Legacy-rendered pages | 43 |
| Dynamic pages | 0 |
| Top-level nodes | 306 |
| Nested record nodes | 703 |
| Total nodes | 1,009 |
| Top-level nodes typed as repeater | 92 |
| Nested nodes typed as repeater | 1 (`applicant_ids`, incorrectly classified) |
| Total nodes typed as repeater | 93 |
| Conditional nodes | 106 |
| Captured help/description values | 6 |
| Captured placeholders | 164 |
| Fixed-object records currently using repeater schema | 3 |

Current type counts across top-level and nested nodes:

| Type | Count |
| --- | ---: |
| Text | 621 |
| Textarea | 70 |
| Yes/No | 78 |
| Radio | 20 |
| Select | 99 |
| Date parts | 28 |
| Repeater | 93 |

Heuristic review found approximately 264 date-part keys and 90 country/nationality keys still represented as generic text. These are audit candidates, not an instruction to bulk-convert without page review.

Pages currently missing their mounted introduction/content in the extracted catalog:

1. Main Applicant — Family
2. Family Sponsor — Details
3. Family Sponsor — Other
4. Family Sponsor — Family
5. All Applicants — Future Travel
6. All Applicants — Future Addresses
7. All Applicants — Character
8. Child — Custody

The zero intro count on All Applicants Character is especially misleading: the mounted page renders the shared `CharacterInstructions` component.

### 6.1 High-priority baseline mismatches

| Area | Current mismatch |
| --- | --- |
| Employment | History heading/help, grouped dates, country source, conditional status fields, table columns/formatters, popup sections, actions, and validators are incomplete |
| Family Sponsor Character | List copy is incomplete; popup/table presentation and compatibility alias behavior are not fully represented |
| Current Relationship | Grouped dates and conditional validation are not fully represented |
| Previous Relationships | Both lists are missing `visibleIf`; partial-date and chronological validation are absent |
| Supporting Witnesses | Minimum two rule is absent; birth date labels are corrupted; popup groups and dynamic relationship labels are missing |
| All Applicants Health | Active TB-exposure question/repeater is missing; several record labels are copied from Health Examinations; commented Health Insurance must remain inactive |
| All Applicants Character | 27 record lists have no corresponding `visibleIf`; reusable popup fields and instructions are missing |
| Addresses | Applicant selector is modeled as a nested repeater instead of a multi-applicant selector |
| Profile pages | Several catalog storage paths are legacy flat paths rather than profile-aware runtime paths |
| Audience | 820 and 309 select the same undifferentiated Partner definition |

## 7. Required 820/801/309 audience decision

Resolve this before publication, not after catalog enrichment.

| Decision | Required implementation |
| --- | --- |
| 820-only | Add an explicit Partner subclass/matter-type discriminator, make matching strict, and prevent 309 from selecting the 820 definition |
| Shared 820/801 onshore flow | Record both approved audiences explicitly; keep 309/100 separate unless legal/product approves it |
| Shared 820/801/309/100 flow | Obtain legal/product confirmation that all pages, wording, validation, resources, and completion are intentionally shared; encode all audiences explicitly |

Recommended safe sequence:

1. Preserve stable ID `built-in-partner` during this parity work.
2. Audit the currently mounted 820 experience.
3. Add explicit audience metadata understood by admin selection, client definition loading, review, resources, and tests.
4. Migrate existing saved Partner definitions without guessing their audience.
5. Require a manual classification for ambiguous saved definitions.
6. Only then change user-facing titles or create separate 309/100 and 801 definitions.

Do not misuse temporary-work `visaContext` semantics unless the definition/runtime schema is deliberately generalized and tested. A dedicated `matterTypes`, `subclasses`, or equivalent allowlisted audience field may be clearer.

## 8. Scope reconciliation

### 8.1 Active content-template groups

| Group | Templates |
| --- | ---: |
| Main Applicant | 7 |
| Spouse/Partner | 3 |
| Family Sponsor | 10 |
| Relationships | 4 |
| All Applicants | 9 |
| Dependent Child profile | 4 |
| Non-migrating member profile | 6 |
| **Total** | **43** |

These are templates. At runtime, child and non-migrating templates may be instantiated multiple times and must remain profile/member scoped.

### 8.2 Workflow pages

Audit these separately from the 43 content templates:

- `/intake/partner/start`
- `/intake/partner/profile`
- `/intake/partner/non-migrating`
- `/intake/partner/submit`
- the stale `/intake/partner/children/start` static route decision

For each workflow page, choose one of:

- editable in the same catalog;
- editable in a dedicated workflow-content model; or
- explicitly locked with a visible reason and product approval.

Do not silently omit workflow content from a claim of “all contents editable.”

### 8.3 Legacy/inactive Partner sources

Classify and test these instead of automatically adding them:

| Source | Expected classification |
| --- | --- |
| `app/intake/partner/dependents/page.js` | legacy/inactive unless an active route points to it |
| `app/intake/partner/family/page.js` | legacy/inactive unless an active route points to it |
| `app/intake/partner/spouse-partner/personal-details/page.js` | legacy compatibility alias, not a separate active template |
| `/intake/partner/children/start` | stale static route unless deliberately implemented |
| Health Insurance block in All Applicants Health | inactive/commented |

Also inspect every locally declared dialog/component for actual mounting. A declaration is not proof of active UI.

### 8.4 Dynamic journey order

The intended order is:

1. Getting Started
2. Included Applicants
3. Main Applicant: Details, Other Names, Identity, Employment, Education, Language, Family
4. Other Family index
5. Six pages for each non-migrating member
6. Spouse/Partner: Details, Other Names, Identity, if included
7. Four pages for each child
8. Family Sponsor: ten pages
9. Relationships: four pages
10. All Applicants: nine pages
11. Review and Submit

Note: the current implementation iterates sorted profiles and inserts the spouse when encountered; verify the actual order with main + spouse + child + non-migrating fixtures rather than relying on this prose.

The `getDynamicPartnerRoutes()` static-section lookup also searches for a top-level `Family` section that does not exist. Remove that stale lookup or document why it remains; do not create an extra section accidentally.

## 9. Acceptance fixture A — Main Applicant Employment

This is the first end-to-end fixture because it directly reproduces the reported Admin/Client mismatch.

### 9.1 Page identity and storage

| Property | Required value |
| --- | --- |
| Route template | `/intake/partner/main-applicant/employment` |
| Mounted title | `Main Applicant's Employment` |
| Admin navigation label | `Employment` |
| Scope | Profile |
| Profile storage | `profiles_data[profileId].employment` |
| Legacy fallback | `partner_employment` / `mainApplicant.employment` as currently supported |
| Completion base | `partner/main-applicant/employment` |
| Profile completion | existing profile-scoped key/stamp behavior |

### 9.2 Current-employment block

Capture and edit:

- `Are you currently Employed in a paid position?`
- Yes/No labels and values (`yes` / `no`)
- the conditional current-job panel;
- Employer/Organization Name;
- Position/Occupation;
- Country with country option source;
- Employment Type with `Full-time`, `Part-time`, `Contract`, and `Self-Employed`;
- Date Started as one grouped day/month/year control backed by three existing keys;
- Current Workplace Address;
- placeholders and panel/group presentation.

The current client does not make those conditional current-job fields required. Do not strengthen them without an approved requirement.

### 9.3 Employment History content

Capture these as separate editable content elements:

- section heading: `Employment History`;
- help text: `Enter details of all of your employment and unemployment since birth. There can be no gaps in dates.`;
- Add action;
- empty state;
- Edit/Delete action labels and accessible names;
- popup Cancel/OK labels; and
- table headings.

Do not substitute the 866 wording from the earlier screenshot. The mounted Partner sentence includes “all of your employment and unemployment since birth.”

### 9.4 Employment History popup

Required mounted fields and behavior:

| Group/field | Control | Rule/behavior |
| --- | --- | --- |
| Date From | grouped day/month/year | all three required |
| Date To | grouped day/month/year | optional; blank means ongoing |
| Status | select | required |
| Country | country select | required |
| Position / Occupation | text | required for employment-like statuses |
| Employer/Organization | text | shown for employment-like statuses |
| Business Address | grouped address fields | street, suburb/town, state/territory, postcode |
| Duties/Notes | textarea + counter | employment-like statuses; nominal 300 characters while preserving longer legacy values |
| Detail how you occupied your time | textarea | non-employment statuses |
| Detail how you financially supported yourself | textarea | non-employment statuses |

Status options and branching:

| Status | Branch |
| --- | --- |
| Employed | employment |
| Self-Employed | employment |
| Work Experience/Internships | employment |
| Unpaid Employment/Volunteer | employment |
| Student | non-employment |
| Retired | non-employment |
| Unemployed | non-employment |

`business_address_street_line2` exists in defaults/schema/storage but is not mounted. Mark it `storageOnly: true`, preserve it during edits, and do not show it in the Admin preview as an active field unless the Client popup is deliberately updated.

### 9.5 Table presentation

Exact active columns:

1. Date From — formatted from the three saved parts
2. Date To — formatted parts or `Ongoing`
3. Status
4. Position
5. Country
6. Actions — Edit/Delete

The admin needs declarative, allowlisted formatters for the two date columns. Never store executable formatter code in a definition.

### 9.6 Validation and compatibility

The popup currently enforces:

- Date From day/month/year;
- Status;
- Country; and
- Position for the four employment-like statuses.

It does **not** enforce continuous coverage/no gaps, complete Date To, date chronology, or at least one history row at page level. Preserve this behavior unless product/legal supplies a new rule and tests. If a no-gap rule is added later, implement it in both legacy and dynamic validation and provide clear row-level errors.

Acceptance must prove:

- every field is visible in the correct branch;
- admin copy changes reach the mounted legacy page;
- add/edit/delete/reload preserve all active and unknown legacy values;
- grouped dates keep the existing three answer keys;
- table formatting matches the client;
- the popup footer remains reachable on desktop and mobile; and
- Save Draft and Continue write profile-scoped answers and completion correctly.

## 10. Acceptance fixture B — Family Sponsor Character

### 10.1 Page contract

| Property | Required value |
| --- | --- |
| Route | `/intake/partner/family-sponsor/character` |
| Storage | `familySponsor.details` |
| Completion | `partner/family-sponsor/character` |
| Scope | Shared/sponsor |
| Yes/No values | `yes` / `no` |
| Declaration count | 14 |
| Detail collection count | 14 |

Capture the complete mounted introduction, including the list:

- `Provide character information for your Sponsor.`
- `If your Sponsor answers 'Yes' to any of the character declarations they must give all relevant details.`
- `If the matter relates to a criminal conviction, provide:`
  - the date and nature of the offence
  - full details of the sentence
  - dates of any period of imprisonment or other detention.

The current built-in reports three intro blocks and can miss the list semantics. Store the lead and list items separately so the current builder can edit and preview them without flattening the structure.

### 10.2 Fourteen declarations and record keys

Keep the exact labels in `SPONSOR_CHARACTER_LABELS` and these stable keys:

| Declaration key | Detail collection |
| --- | --- |
| `convicted_child_offence` | `convicted_child_offence_details` |
| `charged_child_offence` | `charged_child_offence_details` |
| `convicted_general_offence` | `convicted_general_offence_details` |
| `charged_general_offence` | `charged_general_offence_details` |
| `acquitted_mental_illness` | `acquitted_mental_illness_details` |
| `removed_deported` | `removed_deported_details` |
| `left_to_avoid_removal` | `left_to_avoid_removal_details` |
| `excluded_from_country` | `excluded_from_country_details` |
| `war_crimes` | `war_crimes_details` |
| `national_security_risk` | `national_security_risk_details` |
| `outstanding_debts` | `outstanding_debts_details` |
| `people_smuggling` | `people_smuggling_details` |
| `military_training` | `military_training_details` |
| `military_service` | `military_service_details` |

Every detail list is visible only when its declaration is `yes`. The table Add label is `Add Details`; the dialog shows `Sponsor: {sponsorName}` and the relevant declaration text.

### 10.3 Detail schemas

| Contract | Applies to | Fields |
| --- | --- | --- |
| Offence | first four declarations | Country; Date of Offence day/month/year; Offence Type; Give details |
| General event | acquittal, removal, avoidance, exclusion, war crimes, people smuggling | Country; Date day/month/year; Give details |
| No-date event | national security and outstanding debts | Country; Give details |
| Military training | `military_training` | Country of Training; Date From; Date To; Type of Training; Give details |
| Military service | `military_service` | Country of Service; Country of Deployment; Date From; Date To; Type of Service; Organisation/Unit/Brigade Group; Position/Rank; Description of Duties; Give details |

Country fields use the country source. Training/service types must retain unknown saved values with `optionsWithSavedValue()` behavior.

The current dialog does not run a nested Zod resolver and does not require the visible details fields, although the introductory copy asks for all relevant details. Do not silently make those fields required. Record a product/legal decision and then change both client and definition validation together if stronger validation is approved.

### 10.4 Sponsor attribution and compatibility

The popup intentionally has no applicant selector. On add/edit it attributes the row to the current sponsor name using `applicant_name`; it also updates a legacy `name` property when present.

Preserve `normalizeSponsorCharacter()` behavior:

- all 14 declarations normalize to `yes` or `no`;
- each canonical detail collection remains an array;
- legacy `national_security_details` merges into `national_security_risk_details`;
- duplicate copies across the two aliases are de-duplicated by count;
- distinct repeated events within one history remain distinct; and
- deleting/editing a migrated row does not cause the alias copy to reappear.

Extend `e2e/questionnaire-sponsor-alignment.spec.js`; do not replace these compatibility regressions.

## 11. Acceptance fixture C — Relationships

The Relationships section contains four independent storage paths and several cross-field rules that the raw catalog does not express.

### 11.1 Current Relationship

Route: `/intake/partner/relationships/current-relationship`  
Storage: `relationships.currentRelationship`  
Completion: `partner/relationships/current-relationship`

Required content/behavior:

- relationship by blood/marriage/adoption question;
- `related_details` visible and required only when the answer is `Yes`;
- met-in-person question;
- first-met grouped date and location visible only when the answer is `Yes`;
- if met in person is Yes, all first-met date parts and location are required;
- Date De Facto Relationship Began as a grouped date;
- committed-to-shared-life date as a grouped date;
- prescribed relationship registration Yes/No;
- number of children numeric input;
- living together Yes/No; and
- lived apart Yes/No.

The two committed dates are optional in the current schema. Preserve their three persisted keys. Correct the extractor's repeated generic labels; each date group needs its own mounted label.

### 11.2 Relationship Details

Route: `/intake/partner/relationships/relationship-details`  
Storage: `relationships.relationshipDetails`  
Completion: `partner/relationships/relationship-details`

The page asks whether the Partner relationship is genuine and ongoing. When `genuine_ongoing_de_facto === "Yes"`, show five textareas:

1. financial aspects;
2. nature of the household;
3. social aspects;
4. commitment between the couple; and
5. development of the relationship.

The current cross-field rule requires **at least one** of those five textareas, not all five. Preserve the validation message `Please provide at least one detail about your relationship` unless copy is deliberately changed and consumed by both renderers.

### 11.3 Previous Relationships

Route: `/intake/partner/relationships/previous-relationships`  
Storage: `relationships.previousRelationships`  
Completion: `partner/relationships/previous-relationships`

There are two separate Yes/No questions and two separate 16-field lists:

- `applicant_previous_relationships` → `applicant_previous_relationships_list`;
- `spouse_previous_relationships` → `spouse_previous_relationships_list`.

Each list must be visible only when its corresponding answer is `Yes`; the current catalog is missing both conditions. A Yes answer requires at least one row.

Popup fields:

- Family Name and Given Names — required;
- Gender;
- Date of Birth;
- Current Country of Residence;
- Type of Relationship — required (`De Facto Relationship`, `Engaged`, `Married`, `Other`);
- Date Relationship Started;
- Date Relationship Ceased;
- Number of Children; and
- How Relationship Ceased (`Divorce`, `Separation`, `Death`, `Other`).

If any part of either relationship date is entered, all three parts are required. If both dates are complete, the ceased date may not precede the started date. Preserve exact table formatting: Name, Date of Birth, Type of Relationship, and Date Ceased (`Ongoing` when blank).

### 11.4 Supporting Witnesses

Route: `/intake/partner/relationships/supporting-witnesses`  
Storage: `relationships.supportingWitnesses`  
Completion: `partner/relationships/supporting-witnesses`

Requirements:

- title `Supporting Witnesses for Current Relationship`;
- introduction stating at least two witnesses;
- **minimum two rows** with validation message `At least two supporting witnesses are required`;
- table columns Name, Date of Birth, and combined Relationship; and
- popup groups Personal Details, relationship to each partner, Telephone and Email Contact, and Residential Address.

The 26 persisted fields are:

```text
family_name, given_names, gender,
birth_day, birth_month, birth_year, occupation,
relationship_to_main_applicant, years_known_main_applicant,
relationship_to_spouse, years_known_spouse,
after_hours_phone_country_code, after_hours_phone_area_code, after_hours_phone_number,
office_hours_phone_country_code, office_hours_phone_area_code, office_hours_phone_number,
mobile_phone_country_code, mobile_phone_number, email_address,
address_line1, address_line2, suburb, state, postcode, country
```

Family Name, Given Names, both relationship selectors, and a valid nonblank email when supplied are enforced by the popup schema. The current built-in wrongly labels witness birth-date fields as `After Hours Phone Number`; correct this with a grouped Date of Birth presentation while preserving the saved keys.

Relationship labels may include applicant/spouse names at runtime. Use safe interpolation tokens or runtime display metadata; do not persist a particular client's name in the definition.

## 12. Acceptance fixture D — All Applicants Character

### 12.1 Page contract and instructions

Route: `/intake/partner/all-applicants/character`  
Storage: `partner_character`  
Completion: `partner/all-applicants/character`

The page renders `CharacterInstructions`, currently sourced from the approved shared character definition. The catalog must include:

- the “Yes requires all relevant details” paragraph;
- the combined-application applicant-attribution sentence;
- the criminal-conviction lead; and
- its three list items.

Do not maintain a fourth unsynchronised copy. Create a shared fixture/generation path or an exact synchronization test between the client instructions and admin definition.

### 12.2 Declaration-to-detail mapping

The page has 27 declarations. Each answer defaults to `no`; its detail list is mounted only when the answer is `yes`.

| Declaration | Detail collection |
| --- | --- |
| `police_check_last_12_months` | `police_check_details` |
| `immigration_detention` | `immigration_detention_details` |
| `convicted_offence` | `convicted_offence_details` |
| `awaiting_legal_action` | `awaiting_legal_action_details` |
| `domestic_violence_order` | `domestic_violence_details` |
| `arrest_warrant` | `arrest_warrant_details` |
| `child_sex_offence` | `child_sex_offence_details` |
| `sex_offender_register` | `sex_offender_register_details` |
| `psychiatric_institution` | `psychiatric_institution_details` |
| `insanity_acquittal` | `insanity_acquittal_details` |
| `unfit_to_plead` | `unfit_to_plead_details` |
| `false_misleading_info` | `false_misleading_info_details` |
| `visa_refused` | `visa_refused_details` |
| `overstayed_visa` | `overstayed_visa_details` |
| `deported_removed` | `deported_removed_details` |
| `avoid_removal` | `avoid_removal_details` |
| `excluded_from_country` | `excluded_from_country_details` |
| `citizenship_refusal` | `citizenship_refusal_details` |
| `war_crimes` | `war_crimes_details` |
| `national_security_risk` | `national_security_details` |
| `outstanding_debts` | `outstanding_debts_details` |
| `people_smuggling` | `people_smuggling_details` |
| `associated_criminal_conduct` | `criminal_conduct_details` |
| `associated_violent_org` | `violent_org_details` |
| `military_training` | `military_training_details` |
| `military_service` | `military_service_details` |
| `sponsorship_payment` | `sponsorship_payment_details` |

The current built-in has all 27 lists but zero conditions on them. Add the 27 exact `visibleIf` links.

### 12.3 Popup families

The raw extractor misses fields supplied by reusable dialogs. Reconcile these mounted contracts:

| Family | Key examples | Mounted fields |
| --- | --- | --- |
| Generic dated event | domestic violence, warrant, child offence, register, insanity, unfit, visa refusal, overstay, removal, avoidance, exclusion, citizenship, war crimes, people smuggling | Applicant (required), Country, Date day/month/year, Details |
| Conviction/charge | convicted, awaiting legal action | Applicant (required), Country, Date of Conviction/Charge, Offence Type, Details |
| Simple | false/misleading information, sponsorship payment | Applicant (required), Details |
| Applicant/country/details | criminal conduct, violent organisation, national security, debts | Applicant (required), Country, Details |
| Police clearance | police check | Applicant, issuing country, application date, issue date, reference number, plus derived table displays |
| Detention/camp | immigration detention | Applicant, location type, centre/camp, country, location, organiser, Date From/To, Details |
| Prison/psychiatric | psychiatric institution | Applicant, Date From/To, Country, Details |
| Military training | military training | Applicant, country, Date From/To, training type, Details |
| Military service | military service | Applicant, service/deployment countries, Date From/To, service type, organisation, rank, duties |

Applicant selectors are dynamically populated from main applicant, spouse, children, and profiles. Store an allowlisted `applicants` source; do not save the current applicant names as definition options.

### 12.4 Current validation boundary

The top-level schema makes the 27 declarations optional Yes/No values and makes all detail arrays optional. Individual dialogs require at least the applicant and, for selected specialised dialogs, their explicitly required fields. The page currently permits Yes with zero rows.

That behavior may be legally undesirable, but parity work must not silently change it. Record a separate decision for:

- requiring every declaration answer;
- requiring at least one row when Yes; and
- requiring all relevant fields within each row.

If approved, implement the same declarative validators in the legacy page, dynamic renderer, admin preview, Save/Continue behavior, and submit review.

## 13. Other All Applicants page contracts

### 13.1 Addresses

- Route: `/intake/partner/all-applicants/addresses`
- Storage: `partner_addresses`
- Top question: whether all applicants share the same address.
- Record: `address_history`.
- `applicant_ids` is a multi-applicant selection, not a nested list.
- Address 1, suburb, state, postcode, country, Date From, and legal status are required in the popup; Date To is optional/ongoing.
- Preserve table formatting, applicant labels, address grouping, date grouping, and country/legal-status sources.

### 13.2 Contact Details

- Route: `/intake/partner/all-applicants/contact-details`
- Storage: `partner_contact_details`
- Eighteen top-level nodes and 15 conditional nodes are currently extracted.
- Audit the share-same phones, email, and postal-address branches, including all country-code/address groups.
- Hidden values are intentionally retained when sharing is turned off and become visible again when re-enabled; existing 866 alignment tests demonstrate this compatibility pattern.
- Do not clear hidden answers unless product explicitly requests destructive clearing.

### 13.3 Visas

- Route: `/intake/partner/all-applicants/visas`
- Storage: `partner_visas`
- `has_aus_visa_history === "yes"` reveals `visa_history`.
- A Yes answer must be checked against the page/dialog behavior for row minimum; do not infer requiredness only from the extracted flag.
- Required popup fields: Visa Country, Visa Type, Application Date, Outcome.
- Outcomes: Granted, Pending, Refused, Withdrawn.
- Granted reveals Date Granted, Expiry Date, Place of Issue, Visa Number, and cancellation question.
- Refused/Withdrawn, or a Granted visa cancelled as Yes, reveal decision date/details according to the mounted branch.
- Group all dates; preserve the 22 persisted keys and conditional rules.

### 13.4 Travel History

- Route: `/intake/partner/all-applicants/travel-history`
- Storage: `partner_travel`
- `has_travel_history === "yes"` reveals `travel_history`.
- Fields: country, current-location status, reason, Other reason details, legal status, arrival date, and optional departure date.
- Preserve the approved common reasons while retaining unknown saved reasons.
- Existing regression coverage proves that `Other` details and unknown legacy values must survive Continue/reopen.

### 13.5 Future Travel

- Route: `/intake/partner/all-applicants/future-travel`
- Storage: `partner_future_travel`
- `has_future_travel === "Yes"` requires at least one `future_travel` row in the current extracted contract; verify against the source schema.
- Mounted fields include departure/arrival dates, countries, cities, flight number, reason, and Other reason details.
- `from_to` and `start_date` are derived/compatibility display values; do not present them as normal inputs without mounted-source proof.
- The catalog currently has no intro; capture the mounted heading/help, table, dialog, actions, and empty state.

### 13.6 Future Addresses

- Route: `/intake/partner/all-applicants/future-addresses`
- Storage: `partner_future_addresses`
- Top question: `knows_future_address`.
- Popup supports Date From/To, address selection/manual address fields, office/mobile phone groups, and the mounted branch rules.
- `address_display`, `date_from`, `date_to`, and `address` are derived/compatibility values and must be classified.
- Preserve the dialog's partial-date validation and selected-address/manual-address rules from its `superRefine()`.

### 13.7 Health

The active Health page has ten Yes/No-to-detail-list pairs:

1. health examination → `health_examinations`;
2. hospital/health-care facility entry → `hospital_details`;
3. health-care work/study/training → `healthcare_work_details`;
4. aged/disability care → `aged_care_work_details`;
5. childcare work/trainee → `childcare_work_details`;
6. classroom over three months → `classroom_work_details`;
7. tuberculosis/chest X-ray → `tuberculosis_details`;
8. close contact with tuberculosis → `tuberculosis_exposure_details`;
9. listed medical conditions → `health_conditions_details`;
10. ongoing care/equipment/assistance → `medical_assistance_details`.

The current built-in contains only nine pairs: it omits `close_contact_tb` and `tuberculosis_exposure_details`. Add both, including popup fields, condition, copy, columns, actions, storage, and validation.

The source also defines `health_insurance` and `health_insurance_details`, but the entire mounted block is commented out. Preserve old stored values but classify this as inactive; do not add it to the active admin questionnaire.

Capture the full medical-condition list as a structured list/source and the unique introduction/popup copy for each record. Do not reuse the Health Examination label on all detail lists, which the current catalog does.

### 13.8 Contacts

- Route: `/intake/partner/all-applicants/contacts`
- Mounted title: `Additional Contact Information`.
- Storage: `partner_contacts`.
- Dynamic question includes the main applicant's name through safe interpolation.
- `has_family_in_australia === "Yes"` reveals `family_in_australia`.
- Popup has Personal Details, Contact Information, and Residential Address sections.
- The 27 persisted fields include relationship/country sources, grouped Date of Birth, three phone groups, email, and physical address.
- The popup schema requires family/given names and core relationship/birth/address data more strongly than the current catalog indicates; audit exact requiredness.
- Table columns are Family Name, Given Names, Relationship; empty state is `No contacts added yet`.
- Additional Notes remains a separate textarea.

## 14. Complete 43-page audit matrix

Counts below describe the current catalog baseline, not the desired final schema. `Nested` counts fields inside record nodes; `Cond.` counts captured visibility conditions.

| Route | Current title | Scope | Current storage metadata | Top | Nested | Records | Cond. | Intro |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| `/intake/partner/main-applicant/details` | Details | profile | `mainApplicant.details` | 12 | 6 | 1 | 4 | 1 |
| `/intake/partner/main-applicant/other` | Other Names | profile | `mainApplicant.otherNames` | 9 | 17 | 2 | 3 | 1 |
| `/intake/partner/main-applicant/identity` | Identity | profile | `mainApplicant.identity` | 11 | 36 | 5 | 11 | 1 |
| `/intake/partner/main-applicant/employment` | Employment | profile | `mainApplicant.employment` | 10 | 18 | 1 | 0 | 1 |
| `/intake/partner/main-applicant/education` | Education | profile | `mainApplicant.education` | 2 | 17 | 1 | 1 | 1 |
| `/intake/partner/main-applicant/language` | Language | profile | `mainApplicant.language` | 6 | 14 | 2 | 3 | 1 |
| `/intake/partner/main-applicant/family` | Family | profile | `mainApplicant.family` | 2 | 10 | 1 | 1 | 0 |
| `/intake/partner/spouse-partner/details` | Details | profile | `spousePartner.details` | 13 | 6 | 1 | 4 | 1 |
| `/intake/partner/spouse-partner/other-details` | Other Names | profile | `partner_spouse_other` | 4 | 12 | 1 | 1 | 1 |
| `/intake/partner/spouse-partner/identity` | Identity | profile | `partner_identity` | 5 | 23 | 3 | 3 | 1 |
| `/intake/partner/family-sponsor/details` | Details | shared | `familySponsor.details` | 13 | 0 | 0 | 0 | 0 |
| `/intake/partner/family-sponsor/other` | Other | shared | `familySponsor.details` | 2 | 12 | 1 | 0 | 0 |
| `/intake/partner/family-sponsor/identity` | Identity | shared | `familySponsor.details` | 5 | 30 | 2 | 1 | 1 |
| `/intake/partner/family-sponsor/family` | Family | shared | `familySponsor.details` | 1 | 7 | 1 | 0 | 0 |
| `/intake/partner/family-sponsor/circumstances` | Circumstances | shared | `familySponsor.details` | 3 | 16 | 1 | 0 | 1 |
| `/intake/partner/family-sponsor/addresses` | Addresses | shared | `familySponsor.details` | 1 | 13 | 1 | 0 | 1 |
| `/intake/partner/family-sponsor/contact` | Contact Details | shared | `familySponsor.details` | 15 | 0 | 0 | 0 | 1 |
| `/intake/partner/family-sponsor/previous-sponsorship` | Previous Sponsorships | shared | `familySponsor.details` | 2 | 17 | 1 | 1 | 1 |
| `/intake/partner/family-sponsor/travel` | Travel | shared | `familySponsor.details` | 7 | 22 | 2 | 2 | 1 |
| `/intake/partner/family-sponsor/character` | Character | shared | `familySponsor.details` | 28 | 80 | 14 | 14 | 3 |
| `/intake/partner/relationships/current-relationship` | Current Relationship | shared | `partner_current_relationship` | 17 | 0 | 0 | 5 | 1 |
| `/intake/partner/relationships/relationship-details` | Relationship Details | shared | `partner_relationship_details` | 6 | 0 | 0 | 5 | 1 |
| `/intake/partner/relationships/previous-relationships` | Previous Relationships | shared | `partner_previous_relationships` | 4 | 32 | 2 | 0 | 1 |
| `/intake/partner/relationships/supporting-witnesses` | Supporting Witnesses | shared | `partner_supporting_witnesses` | 1 | 26 | 1 | 0 | 1 |
| `/intake/partner/all-applicants/addresses` | Addresses | shared | `partner_addresses` | 2 | 14 | 1 | 0 | 1 |
| `/intake/partner/all-applicants/contact-details` | Contact Details | shared | `partner_contact_details` | 18 | 0 | 0 | 15 | 1 |
| `/intake/partner/all-applicants/visas` | Visas | shared | `partner_visas` | 2 | 22 | 1 | 10 | 1 |
| `/intake/partner/all-applicants/travel-history` | Travel History | shared | `partner_travel` | 2 | 11 | 1 | 2 | 1 |
| `/intake/partner/all-applicants/future-travel` | Future Travel | shared | `partner_future_travel` | 2 | 15 | 1 | 2 | 0 |
| `/intake/partner/all-applicants/future-addresses` | Future Addresses | shared | `partner_future_addresses` | 2 | 21 | 1 | 0 | 0 |
| `/intake/partner/all-applicants/health` | Health | shared | `partner_health` | 18 | 37 | 9 | 9 | 1 |
| `/intake/partner/all-applicants/character` | Character | shared | `partner_character` | 27 | 98 | 27 | 0 | 0 |
| `/intake/partner/all-applicants/contacts` | Contacts | shared | `partner_contacts` | 3 | 27 | 1 | 1 | 1 |
| `/intake/partner/children/child-profile/details` | Details | profile | `partner_details` | 13 | 6 | 1 | 4 | 1 |
| `/intake/partner/children/child-profile/other` | Other Names | profile | `partner_other_names` | 2 | 12 | 1 | 0 | 1 |
| `/intake/partner/children/child-profile/identity` | Identity | profile | `partner_identity` | 7 | 23 | 3 | 4 | 1 |
| `/intake/partner/children/child-profile/custody` | Custody | profile | `partner_custody` | 7 | 0 | 0 | 0 | 0 |
| `/intake/partner/non-migrating/member-profile/details` | Details | profile | `partner_details` | 9 | 0 | 0 | 0 | 1 |
| `/intake/partner/non-migrating/member-profile/passport` | Passport | profile | `partner_passport` | 7 | 0 | 0 | 0 | 1 |
| `/intake/partner/non-migrating/member-profile/identity` | Identity | profile | `partner_identity` | 2 | 0 | 0 | 0 | 1 |
| `/intake/partner/non-migrating/member-profile/other-names` | Other Names | profile | `partner_other_names` | 1 | 3 | 1 | 0 | 1 |
| `/intake/partner/non-migrating/member-profile/citizenship` | Citizenship | profile | `partner_citizenship` | 2 | 0 | 0 | 0 | 1 |
| `/intake/partner/non-migrating/member-profile/health` | Health | profile | `partner_health` | 1 | 0 | 0 | 0 | 1 |

Every row needs a manifest status and evidence link. A route is not complete merely because its count matches.

## 15. Complete current record inventory

The current catalog contains 93 nodes typed as repeater: 92 top-level records plus nested `applicant_ids`. The target count may change when `applicant_ids` becomes a multi-select and the missing active TB-exposure record is added. Count changes must be explained by classification, not hidden.

### 15.1 Main Applicant — 13 records

| Page | Record | Fields | Notes |
| --- | --- | ---: | --- |
| Details | `citizenships` | 6 | conditional list |
| Other Names | `other_names` | 13 | evidence branch |
| Other Names | `prev_dobs` | 4 | date aliases require review |
| Identity | `passports` | 12 | conditional list |
| Identity | `national_id_card` | 6 | fixed object, not list |
| Identity | `other_identity_documents` | 5 | list |
| Identity | `citizenships` | 10 | list |
| Identity | `pr_countries` | 3 | conditional list |
| Employment | `employment_history` | 18 | acceptance fixture A |
| Education | `education_history` | 17 | preserve legacy languages/statuses |
| Language | `languages` | 3 | conditional list |
| Language | `english_tests` | 11 | conditional list |
| Family | `children` | 10 | some display aliases/child-profile relationship |

### 15.2 Spouse/Partner — five records

| Page | Record | Fields | Notes |
| --- | --- | ---: | --- |
| Details | `citizenships` | 6 | profile-scoped |
| Other Names | `other_names` | 12 | profile-scoped with legacy flat fallback |
| Identity | `passports` | 12 | profile-scoped |
| Identity | `national_id_card` | 6 | fixed object |
| Identity | `other_identity_documents` | 5 | profile-scoped |

### 15.3 Family Sponsor — 23 records

| Page | Records | Field counts |
| --- | --- | --- |
| Other | `other_names` | 12 |
| Identity | `citizenships`, `passports` | 10, 20 |
| Family | `family_members` | 7 |
| Circumstances | `employment_history` | 16 |
| Addresses | `addresses` | 13 |
| Previous Sponsorships | `previous_sponsorships` | 17 |
| Travel | `australian_visas`, `travel_history` | 11, 11 |
| Character | 14 detail collections | 6/5/2/9/13 by popup family |

All Sponsor pages write into `familySponsor.details`; stable answer keys prevent collisions. Audit full paths, not only local field names.

### 15.4 Relationships — three records

| Page | Record | Fields |
| --- | --- | ---: |
| Previous Relationships | `applicant_previous_relationships_list` | 16 |
| Previous Relationships | `spouse_previous_relationships_list` | 16 |
| Supporting Witnesses | `supporting_witnesses` | 26 |

### 15.5 All Applicants — 43 current repeater-typed nodes

| Page | Record(s) | Current field counts / issue |
| --- | --- | --- |
| Addresses | `address_history`; nested `applicant_ids` | 14; nested node must become multi-applicant selector |
| Visas | `visa_history` | 22 |
| Travel History | `travel_history` | 11 |
| Future Travel | `future_travel` | 15, including derived values |
| Future Addresses | `future_addresses` | 21, including derived/compatibility values |
| Health | nine current lists | 37 fields total; missing active TB-exposure list |
| Character | 27 detail lists | 98 extracted fields; reusable-dialog fields are incomplete |
| Contacts | `family_in_australia` | 27 |

### 15.6 Dependent Child — five records

| Page | Record | Fields |
| --- | --- | ---: |
| Details | `citizenships` | 6 |
| Other Names | `other_names` | 12 |
| Identity | `passports` | 12 |
| Identity | `national_id_card` | 6, fixed object |
| Identity | `other_identity_documents` | 5 |

### 15.7 Non-migrating member — one record

| Page | Record | Fields |
| --- | --- | ---: |
| Other Names | `other_names` | 3 |

The six non-migrating Partner routes re-export temporary-work implementations. Audit behavior under the Partner route and storage context; do not assume a shared component automatically uses the correct copy/completion prefix.

## 16. Remaining profile and sponsor contracts

### 16.1 Details pages

Main Applicant, Spouse/Partner, Child, and non-migrating Details pages share concepts but not necessarily identical storage, titles, help, requiredness, or profile resolution.

For each one verify:

- mounted profile-interpolated page title;
- family/given names and any name-order behavior;
- gender/sex option values;
- Date of Birth grouping and allowed year range;
- country/place-of-birth controls;
- citizenship-at-birth/current citizenship logic;
- additional citizenship list and condition;
- relationship/profile role behavior;
- required messages;
- merge behavior that retains unknown legacy personal fields; and
- correct profile completion key.

Do not use the same flat `partner_details` storage path for every profile instance. That string in a template is only meaningful together with profile metadata and runtime resolution.

### 16.2 Other Names pages

Audit Main, Spouse, Child, and non-migrating variants separately:

- Has Other Names question and condition;
- Family Name, Given Names, reason/type;
- evidence question and conditional evidence fields;
- document issue date grouping;
- issuing country/state/place;
- reference number;
- Main Applicant-only `use_in_application` if actually mounted;
- previous-date-of-birth list on Main Applicant; and
- legacy fields retained during edits.

The non-migrating three-field Other Names schema is not equivalent to the 12/13-field Partner applicant popup.

### 16.3 Identity pages

Identity needs explicit record kinds:

- Passport(s) — repeatable;
- National ID card — fixed object despite current repeater type;
- Other identity documents — repeatable;
- Main-only citizenship/permanent-residency records where mounted.

Group all issue/original/expiry dates without changing answer keys. Use country/nationality, gender, document-type, and status sources. Preserve unknown document types/statuses from old drafts.

For every condition, test both hidden and visible validation. A hidden incomplete record must not block Continue unless the current legacy page does so.

### 16.4 Education and Language

Main Applicant Education contains a 17-field record with institution/address sections and date groups. Preserve:

- `COURSE_LANGUAGE_OPTIONS`;
- legacy `Chinese` alongside the newer Mandarin/Cantonese choices when already saved;
- course status migration from `Ongoing` to `Current/Ongoing`;
- `Completed`, `Current/Ongoing`, `Deferred`, and `Withdrawn`;
- unknown saved choices through `optionsWithSavedValue()`;
- `legacy_reference` and other unknown row properties; and
- `mainApplicant.education` legacy data that is not the active profile record.

Main Applicant Language has two distinct records:

- `languages` when English is not the main language; and
- `english_tests` when an English test exists.

Audit the English-medium-study question separately. Language, proficiency, test type, score labels, date grouping, and applicant storage must be editable/represented without duplicating long option sets.

### 16.5 Main Family, child profiles, and custody

Main Applicant Family creates child/family data that is also used to derive child profiles and applicant options. Confirm whether each field is authoritative, derived, or compatibility-only before exposing it.

Child journey requirements:

1. Details
2. Other Names
3. Identity
4. Custody

Custody currently has seven top-level questions and no extracted intro. Capture the mounted title/help, control types, conditions, validators, storage, and completion. Test more than one child so answers/completion cannot collide.

### 16.6 Family Sponsor pages other than Character

| Page | Required audit focus |
| --- | --- |
| Details | 13 fields, sponsor title/help, dates/countries/statuses, no missing introduction |
| Other | Has Other Names + 12-field popup; evidence/date/country conditions |
| Identity | citizenship and passport lists; 10/20 fields; dates, statuses, saved-value compatibility |
| Family | seven-field family-member popup and relationship source |
| Circumstances | current circumstances plus 16-field employment/activity history |
| Addresses | 13-field address history, dates, country, legal status, coverage copy/validation |
| Contact | 15 top-level fields, phone/email/address groups, requiredness and preservation |
| Previous Sponsorships | Yes requires rows; 17 fields; application/decision dates and outcome logic |
| Travel | Australian visa history plus travel history; two distinct 11-field records |

Sponsor travel compatibility must retain historical choices:

- `Holiday` displays/migrates as `Holiday or Leisure`;
- `Work` or `Study` displays/migrates as `Work, study or training`; and
- an unknown saved value remains selectable and is not silently discarded.

For pages sharing `familySponsor.details`, test that saving one page does not overwrite keys owned by another page.

## 17. Required parity manifest

Create a reviewed manifest consumed by the audit and tests. Do not keep the audit truth only in prose or scattered assertions.

### 17.1 Definition fields

At minimum:

```text
definitionId
visaType
approvedPartnerAudiences
title
version
schemaVersion
catalogVersion
status
```

### 17.2 Page fields

```text
pageId
routeTemplate
sourceFile
routeSource
activeStatus
journeyGroup
order
scope
profileRole
displayTitle
navigationTitle
introBlocks
storagePath
profileSection
legacyStorageAliases
completionKey
renderer
copyConsumerStatus
```

### 17.3 Question fields

```text
questionId
fullPath
answerKey
label
type
required
defaultValue
helpText
placeholder
rows
options
optionsSource
visibleIf
validation
fieldGroup
storageOnly
derivedDisplay
runtimeInterpolation
```

### 17.4 Record/popup fields

```text
recordKind                # repeatingList | fixedObject | multiSelect | derived | inactive
minimumRows
maximumRows
fields
popupTitle
popupDescription
popupSections
tableColumns
rowFormatters
emptyMessage
addLabel
editLabel
deleteLabel
cancelLabel
confirmLabel
applicantSource
preserveUnknownFields
```

### 17.5 Audit statuses

Use explicit statuses, for example:

- `matched`
- `missing-in-admin`
- `admin-only-not-mounted`
- `storage-only`
- `derived-display`
- `fixed-object-misclassified`
- `inactive-commented`
- `legacy-alias`
- `workflow-locked`
- `copy-not-consumed`
- `validation-not-represented`
- `presentation-not-represented`
- `audience-ambiguous`
- `needs-product-decision`

Every non-`matched` active item must have an owner, reason, and acceptance condition. The audit must fail on an unclassified mismatch.

## 18. Metadata and runtime requirements

### 18.1 Stable full paths

Local keys repeat across pages and records. Resolve copy and validation through stable full paths such as:

```text
partner.main-applicant.employment.employment_history.status
partner.family-sponsor.character.military_service_details.duties_description
partner.relationships.supporting-witnesses.supporting_witnesses.birth_day
partner.all-applicants.character.police_check_details.issuing_country
```

Do not resolve nested copy only by `status`, `country`, `details`, or array index.

### 18.2 Field groups without storage migration

Support declarative groups for:

- date parts;
- address blocks;
- phone number blocks;
- current-employment panels;
- popup sections;
- applicant attribution; and
- table-only derived columns.

Grouping controls presentation only. Persist the current answer keys unless a separately approved data migration exists.

### 18.3 Allowlisted option sources

Support reviewed source identifiers instead of serializing huge arrays into every saved definition:

```text
countries
applicants
sponsor
phoneCountryCodes
relationships
languages
courseLanguages
employmentStatuses
visaSubclasses
travelReasons
healthConditions
trainingTypes
serviceTypes
```

Each source needs a deterministic fallback for preview/test and must retain unknown saved values where the client currently does.

### 18.4 Safe formatters

Use an allowlist, not arbitrary code:

- `dateParts`
- `datePartsOrOngoing`
- `personName`
- `addressSummary`
- `relationshipPair`
- `applicantLabels`
- `plainText`

Formatters must tolerate legacy rows with display aliases or partial data.

### 18.5 Declarative validation

The schema needs reviewed validators for at least:

- required when visible;
- all-or-none date parts;
- end date not before start date;
- minimum rows;
- at least one of several fields;
- conditional row fields by status/outcome;
- valid optional email;
- applicant selection; and
- future-address branch rules.

Validator identifiers and arguments must be allowlisted and schema-validated. The Admin preview, dynamic renderer, legacy page bridge where applicable, and submit review must agree.

### 18.6 Presentation model

Each record needs explicit, editable presentation metadata:

```js
presentation: {
  columns: [
    { key: "date_from", label: "Date From", formatter: "dateParts" },
    { key: "date_to", label: "Date To", formatter: "datePartsOrOngoing" },
  ],
  popup: {
    addTitle: "Add Entry",
    editTitle: "Edit Entry",
    description: "...",
    sections: [{ id: "dates", title: "...", fieldKeys: [...] }],
  },
  actions: {
    add: "Add",
    edit: "Edit",
    delete: "Delete",
    cancel: "Cancel",
    confirm: "OK",
  },
  emptyMessage: "No entries added",
}
```

Every label editable in the Admin Portal must have a confirmed consumer in the legacy client or dynamic renderer.

### 18.7 Structural promotion gate

Classify edits:

- **copy-safe:** title, intro, label, help, placeholder, option label, presentation copy;
- **behavioral:** requiredness, condition, validator, source, option value, default;
- **structural:** add/remove/reorder question, change type, change answer key, change storage/scope.

Copy-safe edits may remain legacy only when the client consumes them. Behavioral/structural edits must be blocked or require a deliberate Test-copy promotion gate proving runtime support. Never promote automatically from a single field edit.

### 18.8 Catalog migration

`QUESTIONNAIRE_LEGACY_CATALOG_VERSION` is currently `3`. A Partner enrichment changes the baseline but must not overwrite saved administrator customizations.

Use a stable-ID, three-way migration:

1. old built-in baseline;
2. new built-in baseline; and
3. saved definition/customization.

Replace a value only when the saved value still equals the old baseline. Preserve administrator-edited values, unknown fields, inactive compatibility values, and publication history. Make the migration idempotent and test interrupted/repeated execution.

Coordinate the next catalog-version bump with the 866/482/186 work instead of independently reusing the same version number for different baselines.

## 19. Step-by-step implementation plan

### Step 0 — Freeze and document the baseline

1. Read both `AGENTS.md` files.
2. Read relevant Next.js docs under each repository's `node_modules/next/dist/docs/` before changing Next.js files.
3. Read both `EXCLUSIONS.md` files.
4. Capture `git status --short` and `git diff --stat` in both repositories.
5. Run current tests/audits relevant to questionnaires.
6. Export the current `built-in-partner` definition to test output.
7. Record current route/profile scenarios and saved-definition counts.
8. Do not edit unrelated dirty files.

### Step 1 — Resolve the audience boundary

1. Obtain the product/legal decision for 820, 801, 309, and 100.
2. Add explicit audience metadata and matching rules.
3. Add tests showing which matter types can select the definition.
4. Preserve `built-in-partner` until a controlled migration says otherwise.
5. Update user-facing names only after the audience is known.

### Step 2 — Build the audit before enrichment

Create `scripts/audit-partner-820-parity.mjs` that:

- loads the built-in definition;
- loads the reviewed manifest;
- checks all 43 content routes and order;
- exercises main-only, spouse, child, multiple-child, and non-migrating route scenarios;
- compares active top-level and nested keys;
- checks record kind, fields, conditions, sources, validation, and presentation;
- checks storage/completion/profile metadata;
- checks legacy-copy consumption markers;
- checks inactive/commented/storage-only classifications;
- checks audience matching; and
- writes deterministic JSON and Markdown output under `output/partner-820-parity/`.

The first run should expose known failures. Do not weaken the manifest merely to reach zero.

### Step 3 — Reconcile routes and active sources

1. Decide `/children/start`.
2. Remove the stale `Family` lookup from the dynamic static-section loop or document it with a test.
3. Classify `dependents`, `family`, and `personal-details` sources.
4. Test target pages and dynamic route order for all profile scenarios.
5. Reconcile profile IDs, query strings, and completion suffixes.

### Step 4 — Improve extraction and regenerate

Improve extraction only where it can be made reliable:

- shared component content;
- mounted versus commented/unmounted blocks;
- reusable dialog schemas;
- storage and completion calls;
- page title/navigation title distinction; and
- field-path-aware record metadata.

Then regenerate `src/lib/questionnaireBuiltInPages.js`. Review the diff; generated output is not self-validating.

### Step 5 — Add Partner enrichment

1. Create a Partner-specific enrichment module.
2. Reconcile page titles, intros, storage, profile, and completion metadata.
3. Apply neutral date/country/presentation helpers.
4. Classify fixed objects, multi-selects, derived fields, and storage-only fields.
5. Add exact conditions and validators.
6. Add popup/table presentation.
7. Preserve compatibility aliases and unknown values.
8. Keep Partner logic out of Protection/Temporary Work overrides.

### Step 6 — Implement Employment end to end

Use section 9 as the first acceptance fixture. Do not proceed to bulk reconciliation until:

- the admin catalog is exact;
- the current builder can edit/preview all safe copy;
- the mounted legacy page consumes it;
- storage and completion remain compatible; and
- desktop/mobile E2E passes.

### Step 7 — Implement Sponsor Character and Relationships

1. Share/synchronize Sponsor Character declarations and instructions.
2. Preserve national-security aliases and sponsor attribution.
3. Fix Relationships storage paths.
4. Add date groups, conditions, cross-field validators, and minimum two witnesses.
5. Add full popup/table presentation and runtime name interpolation.

### Step 8 — Reconcile All Applicants

Recommended order:

1. Addresses and applicant multi-select;
2. Contact Details hidden-value behavior;
3. Visas outcome branches;
4. Travel History compatibility;
5. Future Travel derived fields;
6. Future Addresses branch validation;
7. Health, including missing TB exposure and inactive insurance;
8. Character's 27 mappings/dialog families;
9. Contacts.

After each page, update manifest, catalog test, legacy-copy test, and E2E evidence.

### Step 9 — Reconcile profile and sponsor pages

Audit Main, Spouse, Child, non-migrating, and remaining Sponsor pages using sections 15–16. Test multiple profiles and legacy fallback data. A template passes only when two instances can save without collision.

### Step 10 — Finish the proposed builder in the current design

Within the existing new layout, support:

- structured intro paragraphs/lists;
- nested record fields;
- fixed-object and multi-select badges/controls;
- date/address/phone groups;
- conditions and validation summaries;
- option source selection;
- table column/order/formatter editing;
- popup sections and actions;
- storage-only/derived/inactive locks;
- audience badges; and
- copy-consumption/readiness status.

Keep advanced structural controls behind an explicit panel and promotion gate so the default editing experience remains clear.

### Step 11 — Complete legacy client copy consumption

1. Give every `RepeaterTable` a stable `fieldName`/full path.
2. Translate page titles, intros, question labels, help, placeholders, options, popup copy, columns, empty states, and actions.
3. Support shared component copy paths without collisions.
4. Add tests proving each edited fixture string reaches the mounted page.
5. Leave unsupported content locked rather than pretending it is editable.

### Step 12 — Migrate, verify, and roll out

1. Add three-way catalog migration and idempotence tests.
2. Create a Test copy from the 820 built-in.
3. Run all four audits and regression suites.
4. Complete desktop/mobile visual review with long data and fully expanded sidebars/popups.
5. Test old drafts, new drafts, and administrator-customized definitions.
6. Publish to a non-production environment.
7. Obtain product/legal sign-off for audience and legal copy.
8. Promote using the existing revision/publication mechanism.
9. Retain rollback to the prior active revision.

## 20. Per-page checking worksheet

Use this worksheet for all 43 templates and workflow pages.

### Route and identity

- [ ] Active route is proven from the dynamic journey
- [ ] Static route is consistent or explicitly classified
- [ ] Source file/component is mounted
- [ ] Page ID and route template are stable
- [ ] Navigation title and display title are both captured
- [ ] Audience is explicit
- [ ] Scope/profile role is correct

### Page content

- [ ] All paragraphs are captured in order
- [ ] Lists retain lead/items/order
- [ ] Section headings are captured
- [ ] Dynamic names use safe interpolation
- [ ] Empty states, actions, and validation copy are captured
- [ ] Legacy client consumes every editable string

### Questions

- [ ] Every mounted control appears once
- [ ] No commented/unmounted/storage-only/derived control appears as active input
- [ ] Control type matches the client
- [ ] Persisted answer key/value casing is exact
- [ ] Required/default/placeholder/help are exact
- [ ] Options and option values are exact
- [ ] Dynamic source is explicit
- [ ] Conditions reference stable sibling/full paths
- [ ] Cross-field validation is represented or locked

### Records and popups

- [ ] Record kind is correct
- [ ] Minimum/maximum rows are correct
- [ ] All mounted nested fields are present
- [ ] Unknown row fields survive edit/save
- [ ] Date/address/phone groups are correct
- [ ] Popup title/description/sections are exact
- [ ] Table columns/order/formatters are exact
- [ ] Add/Edit/Delete/Cancel/OK and empty state are exact
- [ ] Desktop/mobile scroll and footer access are verified

### Storage and completion

- [ ] Runtime storage path matches actual save calls
- [ ] Profile/member scoping is correct
- [ ] Legacy aliases are explicit and tested
- [ ] Saving one page does not overwrite sibling keys
- [ ] Completion key/stamp is exact
- [ ] Hidden values preserve current compatibility behavior
- [ ] Submit review reports incomplete pages correctly

### Admin and migration

- [ ] Preview matches mounted client
- [ ] Copy/behavior/structural edit classification is correct
- [ ] Unsupported edits are locked with a reason
- [ ] Test-copy save/reload works
- [ ] Old admin overrides survive catalog migration
- [ ] Migration is idempotent
- [ ] Audit row is `matched` or approved/classified

## 21. File-by-file implementation map

### 21.1 Admin Portal

| File/area | Required work |
| --- | --- |
| `src/components/admin/AdminQuestionnaireBuilder.jsx` | Strict Partner audience matching; finish nested/presentation/source/validation editing in the current layout |
| `src/lib/questionnaireDefinitions.js` | Validate record kinds, field groups, sources, formatters, validators, audiences, locks, and full paths |
| `src/lib/questionnaireBuiltIns.js` | Invoke Partner enrichment/finalization and coordinated catalog migration |
| `src/lib/questionnaireBuiltInPages.js` | Regenerate only |
| `src/lib/questionnaireBuiltInRecordEnrichment.js` | Reuse neutral date/country/presentation mechanics without visa copy |
| new `src/lib/questionnaireBuiltInPartnerEnrichment.js` | Reconcile all 43 Partner templates and compatibility metadata |
| `src/lib/questionnaireBuiltInCharacter.js` | Preserve Sponsor Character rebuild and synchronize shared Character sources |
| Details / Identity / Choices / Conditions enrichers | Fix only genuinely shared semantics; add Partner regression tests |
| `src/lib/questionnaireClientPresentation.js` | Safe grouping/preview only; no unreviewed semantic inference |
| `scripts/extract-questionnaire-built-ins.cjs` | Mounted/shared-component/storage extraction improvements |
| new `scripts/audit-partner-820-parity.mjs` | Exhaustive manifest-driven audit |
| new `test/questionnaireBuiltInPartner820.test.mjs` | Catalog, fixtures, audience, storage, record, validation, presentation tests |
| catalog migration tests | Override preservation and idempotence |

Suggested module names may change; the separation of neutral mechanics from Partner semantics is the requirement.

### 21.2 Client Portal

| File/area | Required work |
| --- | --- |
| `src/lib/routes.js` | Child route decision, stale Family lookup, scenario ordering tests |
| `src/lib/targetVisaPages.js` | Keep target/completion scope aligned with the journey |
| `src/lib/submitCompletion.js` | Treat as authority; add Partner tests before behavioral changes |
| `src/lib/visaDisplay.js` | Implement approved 820/801/309 audience/slug behavior |
| `src/components/RepeaterTable.jsx` | Full-path copy/presentation consumption |
| `src/lib/questionnaires/legacyCopy.js` | Stable nested paths, popup sections, actions, interpolation |
| `src/lib/allApplicantsParity.js` | Synchronize Character labels/instructions and option sources |
| `src/lib/partnerQuestionnaireAlignment.js` | Preserve education, sponsor Character, and travel compatibility |
| `app/intake/partner/main-applicant/employment/page.js` | Acceptance fixture A and copy consumer |
| `app/intake/partner/family-sponsor/character/page.js` | Acceptance fixture B and shared contract |
| `app/intake/partner/relationships/**` | Correct storage metadata, conditions, validation, presentation, copy consumers |
| `app/intake/partner/all-applicants/**` | Exact nine-page reconciliation, especially Health and Character |
| applicant/child/non-migrating pages | Profile path, compatibility, copy consumption, collision tests |
| new `e2e/questionnaire-820.spec.js` | Full journey/profile/popup/storage/completion coverage |

## 22. Verification requirements

### 22.1 Admin tests

Add tests proving:

- stable `built-in-partner` identity and approved audiences;
- exactly 43 active content templates until an intentional scope change;
- all 43 remain legacy until deliberate promotion;
- exact route set and reviewed ordering;
- 306/703 baseline changes are explained by manifest classifications;
- every current record node is classified;
- missing TB exposure is added;
- inactive Health Insurance is excluded;
- all active generic date/country controls are grouped/sourced or explicitly reviewed;
- Employment fixture copy, fields, conditions, validation, and presentation;
- Sponsor Character's 14 declarations, 14 lists, list copy, and aliases;
- Relationships runtime storage and validators;
- witness minimum two and corrected birth-date group;
- All Applicants Character's 27 exact mappings and popup families;
- Addresses applicant multi-select classification;
- derived/storage-only fields are locked;
- profile pages use runtime profile metadata and do not collide;
- valid sources/formatters/validators/audience metadata;
- no unresolved presentation/source key;
- copy-consumption readiness; and
- migration preserves admin overrides and is idempotent.

Suggested commands:

```powershell
node scripts/audit-partner-820-parity.mjs
node --test test/questionnaireBuiltInPartner820.test.mjs
node --test "test/questionnaire*.test.mjs" "src/lib/questionnaire*.test.mjs"
node scripts/audit-temporary-work-482-parity.mjs
node scripts/audit-temporary-work-186-parity.mjs
npm run lint
npm run build
```

Also run the 866 audit command documented in its companion guide.

### 22.2 Client unit/integration tests

Add or extend tests for:

- 820/801/309 normalization and definition selection after the audience decision;
- dynamic Partner routes for zero/one/multiple profiles;
- no `/children/start` 404;
- exact target-page/completion list;
- profile-scoped main/spouse/child answers;
- non-migrating Partner route re-exports and storage;
- Employment status branches and compatibility values;
- education `Chinese` and `Ongoing` migration behavior;
- Sponsor Character aliases/attribution;
- Relationships cross-field rules and storage;
- witness minimum two;
- Health's ten active detail records and inactive insurance;
- Character's 27 declaration mappings and applicant sources;
- hidden Contact values retained;
- Travel Other/unknown reasons retained;
- legacy-copy resolution for every acceptance fixture;
- Save Draft versus Continue; and
- old draft/revision compatibility.

Suggested commands:

```powershell
npm test
npm run check
npm run build
npx playwright test e2e/questionnaire-820.spec.js
npx playwright test e2e/questionnaire-sponsor-alignment.spec.js
npx playwright test e2e/questionnaire-all-applicants-alignment.spec.js
```

### 22.3 End-to-end matrix

| Scenario | Required evidence |
| --- | --- |
| Main applicant only | Correct seven pages, Other Family index, Sponsor/Relationships/All Applicants |
| Main + spouse | Three spouse pages with isolated profile data |
| Main + one child | Four child pages, no broken Children route |
| Main + two children | Separate answers and completion for both children |
| Main + non-migrating member | Six shared implementation pages under Partner paths |
| Combined profiles | Exact order, sidebar expansion/scroll, no hidden menu items, no collisions |
| Employment employed row | Employment branch, required Position, table formatting |
| Employment unemployed row | Non-employment branch, optional ongoing Date To |
| Sponsor Character | All 14 rows save/reload and sponsor attribution |
| Legacy sponsor security | Canonical/alias migration, edit, delete, no resurrection |
| Current/previous relationships | Conditions, partial dates, chronology, storage |
| Supporting witnesses | One row blocks; two rows complete |
| Health | All ten active branches; insurance absent |
| All Applicants Character | Each of 27 Yes branches opens the right popup/list |
| Existing 820 draft | Unknown fields/options survive edit and Continue |
| 309 matter | Behavior matches the explicit audience decision, never accidental fallback |
| Copy-only publication | Every edited fixture string reaches the legacy client |
| Structural Test copy | Promotion gate blocks incomplete runtime contracts |
| Desktop/mobile | Full popup scroll, reachable footer, responsive tables and sidebar |

### 22.4 Visual evidence

For every record-heavy page capture:

- empty table;
- populated table with long values;
- Add popup at top, middle, and bottom scroll positions;
- conditional branches;
- validation errors;
- edit prefill;
- mobile popup/footer;
- builder edit state; and
- mounted Client result after saving edited copy.

## 23. Definition of Done

The 820 work is complete only when:

1. The Partner parity audit reports zero unresolved active mismatches.
2. The 43 content templates and all applicable runtime instances are represented and verified.
3. Workflow pages are editable or explicitly locked with approval.
4. The `/children/start` and stale `Family` route issues are resolved.
5. The 820/801/309/100 audience decision is encoded and tested.
6. Every mounted top-level and nested field appears exactly once.
7. Every extracted-only, commented, derived, storage-only, and alias field is classified.
8. Every active record has exact fields, kind, conditions, sources, validation, popup, table, actions, and empty state.
9. Employment matches section 9 without inventing a no-gap validator.
10. Sponsor Character preserves all 14 contracts and legacy national-security data.
11. Relationships use runtime storage paths and preserve all cross-field rules.
12. Supporting Witnesses enforces a minimum of two.
13. Health includes TB exposure and excludes commented Health Insurance.
14. All Applicants Character has all 27 exact conditions and mounted popup fields.
15. Profile/member answers and completion never collide.
16. All safe copy has a tested edit path to the mounted client or an approved lock.
17. No legacy page is promoted without full structural/runtime parity.
18. Old drafts, unknown fields/options, and administrator overrides survive edit, migration, and publication.
19. All four questionnaire audits and relevant regression suites pass.
20. Product/legal signs off on audience and legal copy.
21. Desktop/mobile evidence is attached and rollback is documented.

## 24. PR evidence checklist

- [ ] Before/after audit JSON and Markdown attached
- [ ] Both worktree statuses recorded before/after
- [ ] 820/801/309/100 audience decision linked
- [ ] 43-page manifest reviewed
- [ ] Record classification delta explained
- [ ] Employment acceptance evidence attached
- [ ] Sponsor Character compatibility evidence attached
- [ ] Relationships/witness validation evidence attached
- [ ] Health and Character full-branch evidence attached
- [ ] Profile scenario route/storage evidence attached
- [ ] Builder screenshots use the current new layout
- [ ] Client screenshots prove edited copy consumption
- [ ] Desktop and mobile popup recordings/screenshots attached
- [ ] Catalog migration preservation/idempotence tests passing
- [ ] 866, 482, 186, and 820 audits passing
- [ ] Unit, integration, E2E, lint/check, and build outputs attached
- [ ] Known exclusions are explicit, approved, and added to both `EXCLUSIONS.md` files
- [ ] Publication target/revision and rollback steps recorded

Do not close the work with “fields added.” Close it only when the admin definition, mounted client, persisted data, validation, completion, audience selection, and edited copy all agree.


