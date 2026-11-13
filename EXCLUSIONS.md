# Questionnaire Parity Decision Exclusions

Last reviewed: 2026-11-11

All evidence-backed technical parity items for Protection 866, Skills in Demand 482, Employer Nomination 186, and Partner 820 are implemented in the current worktree. The records below are retained only because changing the current behavior requires a product or legal decision. No value is inferred by this document.

## 1. Partner questionnaire audience

Owner: Product and Legal

Reason: The mounted client currently normalizes 820, 801, 309, and 100 to the shared Partner flow, while the audited legal source is labelled for subclass 820. The decision prompt was dismissed, so there is no approval to narrow or affirm the shared audience.

Current behavior: Existing 820/801/309/100 normalization remains unchanged.

Next step: Approve either 820-only, 820/801, or all-four targeting. Then encode the approved audience in both definition matching and client validation and add one test per supported and rejected subclass.

## 2. Partner All Applicants Character requiredness

Owner: Legal

Reason: The current implementation requires all 27 declarations and at least one attributed detail row for every Yes answer. The earlier mounted behavior allowed incomplete declarations/rows, and no legal approval record establishes which contract is authoritative. The decision prompt was dismissed.

Current behavior: The existing strict validation remains unchanged; no further requiredness was added.

Next step: Legal must approve legacy-optional, Yes-details-only, or all-required validation. Update the catalog, mounted schema, submit validation, and migration tests together.

## 3. Partner affirmative-row policies outside Character

Owner: Product and Legal

Reason: Mounted Partner Health, Visas, Contacts, and Future Travel flows permit Yes with zero detail rows. Adding minimum rows would be a new legal/data requirement rather than parity work.

Current behavior: Existing mounted optional-row behavior is preserved.

Next step: Decide the minimum-row policy per page. If a minimum is approved, provide the validation message and apply the same declarative rule to legacy, dynamic, and submit-time validation.

## 4. Partner applicant scope for shared pages

Owner: Product and Data

Reason: Partner Travel, Visas, and Contacts are presented under All Applicants, but their mounted storage/UI is main-applicant-oriented. Converting them to per-applicant records changes the persisted data model and review attribution.

Current behavior: Existing answer keys, storage paths, and main-applicant semantics remain unchanged.

Next step: Approve main-applicant-only wording or a per-applicant migration design, including compatibility handling for existing rows.

## 5. Partner workflow-screen editability

Owner: Product and Legal

Reason: Start, profile, and submit screens are workflow controls rather than questionnaire content pages. Making their legal/instructional copy editable requires an explicit ownership and publication policy.

Current behavior: Workflow screens remain outside the editable questionnaire catalog and cannot be structurally promoted.

Next step: Identify which copy blocks, if any, are admin-owned and approve a copy-only workflow contract before adding them to the catalog.

## 6. Child Identity custody duplication

Owner: Product and Legal

Reason: The mounted child Identity page includes an under-18 custody block while Custody also has a dedicated route. Removing, merging, or requiring either block changes the legal workflow.

Current behavior: Both mounted surfaces remain available; no new custody requiredness was introduced.

Next step: Choose the authoritative custody surface and provide migration/completion behavior for existing answers before changing either page.

## 7. Canonical subclass 186 display name

Owner: Product and Legal

Reason: Existing UI and documents use both “Employer Nomination Visa” and “Employer Nomination Scheme.” No approved canonical user-facing name is recorded.

Current behavior: Existing strings are preserved; IDs, routes, visa context `186`, and storage contracts are unchanged.

Next step: Approve the canonical display name and identify document/legal-copy exceptions before running a copy-only migration.

## 8. Continuous-history coverage beyond residence

Owner: Legal

Reason: Countries of Residence already enforces the existing later-of-ten-years-or-age-16 coverage rule. No equivalent mounted rule or approved coverage period exists for Employment, Education, or Travel, so extending continuous coverage would invent validation.

Current behavior: Residence coverage is enforced in legacy, dynamic, and submit-time paths. Other histories retain their existing date and row rules only.

Next step: Legal must specify each affected history, period, gap tolerance, ongoing-row semantics, and error wording before any additional coverage validator is implemented.
