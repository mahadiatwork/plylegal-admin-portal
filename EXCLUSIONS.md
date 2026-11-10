# Temporary Work (482 / 186) Questionnaire Parity — Exclusions

This file records what the Skills in Demand (482) and Employer Nomination (186)
parity implementations cover, and every known deviation from
`SKILLS_IN_DEMAND_482_QUESTIONNAIRE_PARITY_IMPLEMENTATION_GUIDE.md` and
`EMPLOYER_NOMINATION_186_QUESTIONNAIRE_PARITY_IMPLEMENTATION_GUIDE.md`.

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

### 186 additions

- `src/lib/questionnaireBuiltInTemporaryWorkEnrichment.js` — shared 482/186 page
  contracts (Skills, Visas Path B, Contact, Travel, neutral employment builder).
- `src/lib/questionnaireBuiltInTemporaryWork186Enrichment.js` — ten-year Employment,
  Australia-only conditional `visa_held`, and Spouse Education/Language fixtures.
- `scripts/audit-temporary-work-186-parity.mjs` — 28-page route/content audit with
  paired 482 isolation checks.
- `test/questionnaireBuiltInTemporaryWork186.test.mjs` — Employment, Spouse Education,
  Spouse Language, shared Skills, and per-repeater metadata tests.
- Client legacy-copy consumers for Employment, Spouse Education, both Spouse Language
  dialogs, their table chrome, and page headings.
- Static `EMPLOYER_NOMINATION_ROUTES` now includes Spouse Other Names.

186 audit snapshot after enrichment: 28 pages (27 legacy + 1 dynamic), 5 spouse pages,
42 repeaters all with presentation metadata, and 0 unresolved issues.

### Partner 820 additions

- `src/lib/questionnaireBuiltInPartnerEnrichment.js` — Partner-only reconciliation for
  Employment, Relationships storage/conditions, Supporting Witnesses, Character
  declarations, Health TB exposure, and the address applicant multi-select.
- `scripts/audit-partner-820-parity.mjs` — 43-page audit; exits 0 with 0 issues.
- `test/questionnaireBuiltInPartner820.test.mjs` — Employment, Relationships, Character,
  Health, Addresses, and per-repeater metadata tests.
- Client Employment history now passes `fieldName="employment_history"` and consumes
  editable dialog/table headings, labels, and buttons.
- Shared date grouping now operates per nested collection, preventing repeated local
  keys in the 14 Sponsor Character lists from collapsing into one page-wide group.

Partner audit snapshot after enrichment: 43 pages (all legacy), 93 repeaters all with
presentation metadata, 27 Character declarations and 27 detail lists, and 0 unresolved
issues.

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

- Health now has ten explicit per-popup contracts in both Temporary Work contexts and
  ten in Partner, including headings, columns, applicant sources, and client copy scopes.
- Education, Language, Identity, Other Names, and Details across main/spouse/child
  scopes — only the 186 Spouse Education/Language fixtures and shared page titles are
  fully enriched; other copy, option sources, and validation remain partial.
- Non-migrating templates now carry profile-aware title templates; their remaining
  page-specific body copy still needs a visual review.
- Child Custody — page intro is still not captured.
- Countries of Residence now carries the shared `residenceHistoryCoverage` catalog
  contract and the legacy client continues to enforce the same ten-year rule.
- Character — the admin starter template and the client definition are still two
  separately maintained declarations (18/36) without a shared fixture.
- Profile-aware titles outside the non-migrating templates are not yet exhaustively
  modeled across every spouse and child page.
- Education/Language option lists still duplicate long language sets instead of using
  an allowlisted source for both contexts.

### Runtime and promotion gaps

- Shipped legacy pages are now structurally locked in both builder layouts and at the
  persistence boundary. Forged `dynamicParityCertified` metadata cannot bypass the
  server gate; wording and existing option-label edits remain available.
- `QUESTIONNAIRE_LEGACY_CATALOG_VERSION` is now `4`. Hydration performs an idempotent
  three-way copy merge using stored `original*` values, preserves edited presentation
  copy and unknown metadata, and leaves already-dynamic page structures intact.
- `metadata.storageOnly` is recursively excluded from admin/client presentation,
  validation, and review; derived Partner aliases are editor-locked while stored values
  remain preserved.
- Repeater dialogs now receive stable copy scopes. Shared labels, inputs, selects,
  buttons, popup chrome, current-employment labels, and Health headings consume admin
  copy. Raw headings/body paragraphs in other legacy dialogs still need explicit
  `QuestionnaireCopyText` adoption.
- `visa_held`, employment status requirements, partial/end-before-start dates, and
  300-character duties limits are enforced by static completion and the dynamic
  metadata-rule evaluator.
- Visas resolution used **Path B** for both contexts: the unmounted
  `VisaDialog`/nested `history` field was removed from the catalog. The client still
  preserves the stored `history` array for compatibility; no UI was activated.
- The canonical 186 display name has not been decided; existing strings were preserved.

### Partner 820 remaining exclusions

- The Partner catalog is now explicitly shared by subclasses 820/801/309/100 while
  retaining the stable `built-in-partner` id and public `820` route slug.
- The stale `/intake/partner/children/start` and top-level `Family` lookups were removed
  from both route manifests, with navigation regression coverage.
- Seven Partner pages still have no captured intro block (Main Family, Sponsor
  Details/Other/Family, Future Travel, Future Addresses, Child Custody). They were not
  given invented copy.
- Health popup headings, columns, applicant sources, and field copy are explicit for all
  ten mounted detail lists.
- Sponsor Character detail fields, Relationships popups, All Applicants Character
  dialog families, and the remaining Partner dialogs still hard-code nested labels in
  the legacy client. Only Partner Employment consumes the new copy bridge.
- Character declarations are required and every Yes answer now requires at least one
  detail row in both catalog metadata and the mounted client schema.
- Future Travel/Future Addresses derived compatibility fields are recursively hidden
  from editable presentation and carry an explicit editor lock reason.
- All 43 Partner pages intentionally remain legacy and are protected by the structural
  parity gate; no page has yet completed the promotion certification checklist.
- Partner saved definitions participate in the catalog-v4 migration.

### Audit limitations

- The audit is catalog/source based. It does not parse the client JSX AST or prove that
  declared client components are mounted.
- Date and country detection still relies on reviewed key heuristics.
- Static built-in route order is asserted by both audits, and client route tests cover
  empty and multi-profile 482/186 scenarios. A browser navigation matrix remains useful.
- The 186 Employment unit path executes `submitCompletion.js` for Australia-only
  `visa_held`, date, status, and length rules; a dedicated browser E2E fixture remains.

## Verification run

- `node scripts/audit-partner-820-parity.mjs` — 0 unresolved issues.
- `node scripts/audit-temporary-work-186-parity.mjs` — 0 unresolved issues.
- `node scripts/audit-temporary-work-482-parity.mjs` — 0 unresolved issues.
- `node scripts/audit-protection-866-parity.mjs` — exits 0 (reports its documented
  existing issue list).
- `node --test "src/lib/*.test.mjs"` — 144 passing.
- `node --test "test/*.test.mjs"` — 231 passing, 10 failing. All 10 failures are in
  `test/adminQuestionnaireBuilder.test.mjs` and reproduce against the unmodified
  `HEAD` builder, so they are pre-existing harness/layout drift rather than 482/186/820
  regressions. They are tracked here as remaining work.
- `npm run lint` — 0 errors (1 pre-existing warning in `src/lib/zohoClient.js`).
- `npm run build` — passing.
- Client: `npm test` — 239 passing.
- Client: `npm run check` and `npm run build` — passing (build emits the existing
  missing-local-Firebase-configuration fallback warnings).
- Client: `npm run check` (tsc) — passing.
- Client: `npm run build` — passing.
- Admin typecheck: no `typecheck` script or `tsconfig.json` is configured; the
  Next.js build is the syntax/type gate for this repository.
