# Admin Questionnaire Builder — Dual Layout Show-and-Tell Plan

## Objective

Add a client-style questionnaire builder layout for product-owner review without removing, replacing, or changing the current admin layout. Both layouts must open the same questionnaire definition and use the same editing, validation, save, and publishing behavior.

## Product outcome

An administrator can open a questionnaire and switch between:

- **Current layout** — the existing grouped-section builder, preserved as the default.
- **Proposed layout** — a presentation of the same builder using the client portal questionnaire's two-column structure, numbered section stepper, collapsible applicant groups, warm canvas, and mobile section toggle.

The selected mode is represented in the URL so each version can be opened directly during a show-and-tell:

- `/admin/questionnaires?layout=current`
- `/admin/questionnaires?layout=proposed`

## Acceptance criteria

1. The current layout remains available and is the fallback for a missing or unsupported `layout` value.
2. Switching layouts does not reload, copy, or replace the questionnaire definition.
3. Unsaved edits remain present when switching between layouts.
4. Both layouts use the existing Save changes, Cancel changes, Copy as test, and Make live actions.
5. The proposed layout displays all questionnaire groups and sections in a client-style stepper instead of the current group dropdown.
6. Selecting a section in either layout updates the same active page and question state.
7. Question, section, conditional-rule, CRM-mapping, and legacy-compatibility controls continue to use the existing builder logic.
8. The proposed layout is explicitly labelled **Design preview**.
9. The proposed section navigation can be shown or hidden on small screens.
10. Existing builder tests continue to pass, with focused coverage proving that both layouts coexist.

## Scope

### Included

- A Current layout / Proposed layout switch in the questionnaire editor header.
- A **Show new layout** action on each questionnaire in the library.
- URL-backed initial layout selection.
- Client-style proposed layout shell.
- Numbered, collapsible navigation grouped by applicant or shared section.
- Responsive View steps / Hide steps navigation.
- Reuse of the current page canvas and all existing editor actions.
- Focused automated regression coverage.

### Not included

- Removing or redesigning the questionnaire library screen.
- Changing questionnaire JSON, answer keys, Firestore collections, or API contracts.
- Changing client portal routing or copying client-side stores into the admin portal.
- Publishing the proposed layout as the only layout.
- Treating the active section indicator as applicant completion data.

## Technical approach

The admin page reads the `layout` search parameter using the Next.js 16 asynchronous `searchParams` page prop and passes the initial value into the client builder.

The builder owns a small presentation-only layout state. Changing it updates the URL with `window.history.replaceState`, which keeps the current React state and unsaved questionnaire edits intact.

The current layout markup remains on its existing render path. The proposed path supplies a different navigation shell, while the page/question canvas, mutation handlers, dirty-state calculation, API requests, and publishing controls remain shared.

No database migration or questionnaire-definition transformation is required.

## Implementation sequence

- [x] Preserve the current editor as the default layout.
- [x] Read and validate the initial layout from the page query string.
- [x] Add the accessible two-mode layout switch.
- [x] Add a direct Show new layout action to questionnaire library rows.
- [x] Add the proposed client-style desktop section stepper.
- [x] Add responsive section navigation for smaller screens.
- [x] Keep the existing editing canvas and actions shared between layouts.
- [x] Label the proposed view as a design preview.
- [x] Add a regression test proving the proposed layout can switch back to the current layout.
- [ ] Complete product-owner review and record the preferred direction.
- [ ] If approved, capture any requested visual refinements as a separate implementation pass.

## Verification

Automated verification:

- Run the focused questionnaire builder test suite.
- Run ESLint against the changed page, builder, and test files.
- Run the production build to verify the Next.js page/query integration.

Manual verification:

1. Open a saved questionnaire in the default current layout.
2. Make an unsaved wording change.
3. Switch to Proposed layout and confirm the wording remains changed.
4. Navigate between sections using the proposed stepper.
5. Edit a question and return to its section.
6. Switch back to Current layout and confirm the same section and unsaved edit remain selected.
7. Refresh each direct URL and confirm it opens the requested layout.
8. Check the proposed navigation at desktop and narrow/mobile widths.

## Product-owner show-and-tell

1. Open the questionnaire library and use **Edit questions** to demonstrate the current group dropdown and section list.
2. Return to the library and choose **Show new layout** for the same questionnaire.
3. Highlight the persistent journey overview, numbered sections, collapsible applicant groups, and familiar client-portal styling.
4. Edit one question to demonstrate that this is the same working builder, not a static mock-up.
5. Switch back to Current layout to prove nothing was removed.
6. Ask the product owner to choose one of three outcomes: retain both, refine the proposed design, or keep the current design only.

## Rollback

The proposed layout is presentation-only and isolated behind the layout selection. If it is rejected, remove the Proposed layout option and its navigation branch; the current builder, questionnaire APIs, saved definitions, and client portal remain unchanged.
