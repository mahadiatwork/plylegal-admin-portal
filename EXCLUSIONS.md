# 482 Questionnaire Parity — Exclusions and Remaining Work

This file records what the Skills in Demand Visa (Subclass 482) parity implementation
covers, and every known deviation from
`SKILLS_IN_DEMAND_482_QUESTIONNAIRE_PARITY_IMPLEMENTATION_GUIDE.md`.

## Implemented in this change

- `scripts/audit-temporary-work-482-parity.mjs` — read-only parity audit that compares
  the 482 built-in catalog with the audited route/content contract and emits JSON +
  Markdown to `output/temporary-work-482-parity/`.
- `src/lib/questionnaireBuiltInRecordEnrichment.js` — visa-neutral date grouping,
  country option-source conversion, and repeater presentation fallback.
- `src/lib/questionnaireBuiltInTemporaryWork482Enrichment.js` — 482-only reconciliation
  for Skills, Employment, Visas, Contact Details, and Travel History.
- Schema validation for nested record kinds, presentation columns/actions/sections,
  field groups, declarative validators, allowlisted option sources, allowlisted row
  formatters, and per-question `visaContexts`.
- Recursive nested repeater editing (existing ProposedInlineQuestionEditor structure)
  plus popup-section editing and neutral formatter choices.
- Client legacy-copy support for presentation chrome, popup sections, and
  `.actions` field-path lookups; Skills now consumes editable table/popup copy.
- Tests: `test/questionnaireBuiltInTemporaryWork482.test.mjs` (Skills acceptance
  fixture and per-repeater metadata) and client legacy-copy chrome/section tests.

### Audit snapshot

| Measure | Before | After |
| --- | ---: | ---: |
| Unresolved audit issues | 160 | 0 |
| Pages | 26 | 26 |
| Legacy / dynamic pages | 25 / 1 | 25 / 1 |
| Top-level questions | 174 | 166 |
| Total question nodes | 491 | 438 |
| Repeaters | 40 | 39 |
| Repeaters with presentation | 0 | 39 |
| Questions with validation rules | 0 | 4 |

The node-count reduction is intentional: date triplets are now grouped into
`dateParts`, the unmounted Visas history repeater was removed from the catalog, and
storage-only employment keys are no longer treated as ordinary questions.

## Remaining exclusions

### Workflow pages (locked, not in the content catalog)

The audit only covers the 26 content-page templates. These workflow screens remain
hard-coded and are intentionally **locked with this documented reason**:

- `/intake/temporary-work/start`
- `/intake/temporary-work/profile`
- `/intake/temporary-work/non-migrating`
- `/intake/temporary-work/children` (sidebar-only, omitted from the linear flow)
- `/intake/temporary-work/submit`

No workflow-content editor was added in this change.

### Inactive or 186-only source files (classified, not added)

- `/intake/temporary-work/all-applicants/addresses` — `legacy-inactive`
- `/intake/temporary-work/all-applicants/contact-details` — `legacy-inactive`
- `/intake/temporary-work/dependents` — `legacy-inactive`
- `/intake/temporary-work/relationships` — `legacy-inactive`
- `/intake/temporary-work/main-applicant/details-other` — `legacy-inactive`
- `/intake/temporary-work/spouse-partner/education` — `186-only`
- `/intake/temporary-work/spouse-partner/language` — `186-only`

### Page-by-page reconciliation not yet completed

The generic enrichment fallback gives every repeater columns and action copy, and the
audit passes, but the following pages still need their rendered copy captured and
reviewed one by one:

- Health — ten conditional detail records still reuse fallback columns/labels rather
  than the actual per-popup headings and applicant option sources.
- Education, Language, Identity, Other Names, and Details across main/spouse/child
  scopes — intros, headings, option sources, and validation copy are only partially
  enriched.
- Non-migrating templates — titles and page-specific copy are not yet interpolated.
- Child Custody — page intro is still not captured.
- Countries of Residence — the `residenceHistoryCoverage` validator is allowlisted but
  not yet attached to the catalog.
- Character — the admin starter template and the client definition are still two
  separately maintained declarations (18/36) without a shared fixture.
- Spouse/child/non-migrating page titles remain generated fallbacks rather than
  profile-interpolated client titles.

### Runtime and promotion gaps

- No structural parity gate is enforced in code. The builder shows a promotion warning
  for legacy Protection and Temporary Work pages, but a structural edit still promotes
  the page.
- `QUESTIONNAIRE_LEGACY_CATALOG_VERSION` remains `3`. The combined 866/482 catalog
  migration and version bump are still owned by the shared infrastructure work; the 482
  enrichment therefore affects built-in templates but is not yet merged into saved
  definitions.
- `metadata.storageOnly` is recorded for `still_working` and `current_end_date_*`, but
  the builder does not yet hide or lock those compatibility fields.
- Legacy dialog copy is only fully consumed by the Skills dialogs. Other legacy pages
  still hard-code most nested labels/help/placeholders even though `RepeaterTable`
  chrome copy is consumed.
- Visas resolution used **Path B**: the unmounted `VisaDialog`/nested `history` field
  was removed from the catalog. The client still preserves the stored `history` array
  for compatibility; no UI was activated.
- Employment completion rules in `submitCompletion.js` were not changed or extended by
  this change beyond catalog validation metadata.

### Audit limitations

- The audit is catalog/source based. It does not parse the client JSX AST or prove that
  declared client components are mounted.
- Date and country detection still relies on reviewed key heuristics.
- Route-order differences between the built-in page array and
  `getDynamicTemporaryWorkRoutes("482")` are not asserted; only the route set is.
- Profile-scenario route tests (zero/one/multiple spouse, child, non-migrating profiles)
  are still outstanding.

## Verification run

- `node scripts/audit-temporary-work-482-parity.mjs` — 0 unresolved issues.
- `node --test "test/questionnaire*.test.mjs" "src/lib/questionnaire*.test.mjs"` —
  134 passing.
- `node --test "test/*.test.mjs"` — 207 passing, 10 failing. All 10 failures are in
  `test/adminQuestionnaireBuilder.test.mjs` and reproduce against the unmodified
  `HEAD` builder, so they are pre-existing harness/layout drift rather than 482
  regressions. They are tracked here as remaining work.
- `npm run lint` — 0 errors (1 pre-existing warning in `src/lib/zohoClient.js`).
- `npm run build` — passing.
- Client: `npm test` — 224 passing.
- Client: `npm run check` (tsc) — passing.
- Client: `npm run build` — passing.
- Admin typecheck: no `typecheck` script or `tsconfig.json` is configured; the
  Next.js build is the syntax/type gate for this repository.
