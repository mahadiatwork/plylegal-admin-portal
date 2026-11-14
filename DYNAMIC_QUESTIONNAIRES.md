# Dynamic questionnaires

The admin portal manages JSON questionnaire definitions at **Admin → Questionnaires**. Owners can edit visible copy on an active questionnaire, or use **Copy as draft** / **Add questionnaire** to prepare a separate draft. Saving a draft does not affect clients; **Make active** publishes it for its visa audience and makes the previously active questionnaire inactive.

## Stages

| Stage | Stored status | Meaning |
| --- | --- | --- |
| **Active** | `active` | What clients see for that visa audience (one per audience). |
| **Inactive** | `archived` | Was active once and has since been replaced. **Reactivate** (list “⋯” menu or editor) makes it active again. |
| **Draft** | `draft` | Created or copied but never made active. **Make active** publishes it. |

Only the labels changed; the stored status values are the same as before, so no data migration is needed.

## Storage and lifecycle

- Editable definitions live in Firestore collection `questionnaireDefinitions`.
- Every successful create/update also writes an immutable copy to `questionnaireDefinitionRevisions`.
- Submitted applications store `questionnaireDefinitionRef` (`id`, `revision`, and display `version`) so the exact historical JSON can be identified after later edits or deletion.
- `active` definitions are live and readable by authenticated clients. `draft` definitions are shown as **Test** questionnaires in the owner-facing editor and remain server/admin-only. Archived definitions stay out of the editor while their immutable revision history remains available.
- Publishing a Test definition keeps the client-facing active selection unambiguous: the server archives the previous live definition for the same audience and snapshots both revisions.
- Browser writes are denied by Firestore rules. Mutations go through the signed admin-session API and Firebase Admin SDK.

The client portal repository's `firestore.rules` is the authoritative combined ruleset for the shared Firebase project because it contains both client resource-access rules and questionnaire rules. Deploy shared-project Firestore rules from `plylegal-client-portal`; do not deploy the admin portal rules file independently.

## Client behavior

The client loads the active definition for the application visa type and, for temporary-work applications, subclass context. A managed page replaces a registered client page whose route exactly matches `page.route`. Routes are therefore existing page slots; adding an entirely new URL still requires a client release.

The JSON owns rendering, required-field validation, conditional visibility, saved section, review wording, and final completion checks for each overridden page. A definition revision change invalidates the previous completion stamp and requires that page to be reviewed again. Submission performs a fresh Firestore lookup and fails closed if the current definition cannot be verified.

## Minimal schema example

```json
{
  "id": "temporary-work-482-v1",
  "visaType": "temporary-work",
  "visaContexts": ["482"],
  "title": "482 questionnaire",
  "version": "1.0.0",
  "status": "active",
  "schemaVersion": 1,
  "revision": 0,
  "pages": [
    {
      "id": "character",
      "route": "/intake/temporary-work/all-applicants/character",
      "title": "Character",
      "sectionKey": "temporary_work_character",
      "scope": "shared",
      "order": 10,
      "completionKey": "temporary-work/all-applicants/character",
      "questions": [
        {
          "id": "has_charge",
          "answerKey": "has_charge",
          "label": "Has any applicant ever been charged with an offence?",
          "type": "yesNo",
          "required": true,
          "options": [
            { "value": "yes", "label": "Yes" },
            { "value": "no", "label": "No" }
          ]
        },
        {
          "id": "charge_details",
          "answerKey": "charge_details",
          "label": "Give details",
          "type": "textarea",
          "required": true,
          "visibleIf": [
            { "field": "has_charge", "op": "equals", "value": "yes" }
          ],
          "clearWhenHidden": true
        }
      ]
    }
  ]
}
```

Supported question types are `text`, `textarea`, `radio`, `select`, `checkbox`, `dateParts`, and `yesNo`. `repeater` remains reserved for developer-supplied components and cannot be activated from the global builder. Supported condition operators are `equals`, `notEquals`, `in`, `notIn`, `exists`, and `notExists`.

The editor allows the owner to change questionnaire structure, wording, options and rules in a draft before making it active. Built-in client pages continue to protect their existing answer keys, fields and validation so saved answers remain readable; their supported wording and option labels can be edited directly. Adding a previously absent help text or placeholder converts that page to the dynamic renderer so the new copy is actually displayed.

Definitions override registered client page slots; they do not create new URLs or own the client navigation. **Add page** is available only when the selected visa flow has an unused registered page route. Removing a managed built-in page restores that built-in client page rather than removing the step from the journey.

## Promoted (certified) built-in pages — full builder control

Built-in pages start on the legacy renderer (`metadata.renderer: "legacy"`): the client shows
its hand-written page and only the wording is editable. A page is **promoted** once its route
is listed in a certified-routes list (for temporary work: `TEMPORARY_WORK_CERTIFIED_ROUTES` in
`src/lib/questionnaireBuiltInTemporaryWorkDynamic.js`) after the Client Portal parity suite
proves it renders and saves identically (`plylegal-client-portal/e2e/questionnaire-dynamic-parity.spec.js`).

- The built-in catalog marks promoted pages `metadata.dynamicParity: "certified"` without a renderer.
- Saved definitions are migrated on load/save (`migrateLegacyQuestionnaireDefinition`): a legacy
  page whose baseline is certified adopts the certified structure, keeps administrator-edited
  wording, and becomes fully editable. Make it active to publish it.
- Everything is then editable: add/remove/reorder questions, types, required, options,
  conditions (including `anyOf` groups), repeating lists (table + pop-up or inline cards),
  popup sections (`metadata.group` on fields), half-width pairs (`metadata.width`).
- Removing a question hides it from clients; stored answers are preserved.
- Behaviour that lived in page code is expressed as data via parity rules
  (`src/lib/questionnaireDynamicParity.js`): profile prefill, defaults, date formats, storage
  adapters (`metadata.answerLayout`), option sources (`applicantIds`).

See the workspace `AGENTS.md` for the certification procedure.

## Headings and explanatory text

Use **Add content here** between questions to add a Question, a **Heading** or **Explanatory text**.
Headings and text are stored as items in the page's `questions` array:

```json
{ "id": "details-family_name-heading", "type": "heading", "label": "Personal Information" }
{ "id": "paragraph-12", "type": "paragraph", "label": "Enter names exactly as shown in your passport." }
```

They show to clients in exactly that position, may have a `visibleIf` rule, and never collect answers
(no `answerKey`, `required`, `options` or validation; they are not counted as questions). Older dynamic
pages that repeated `metadata.group` on each question are converted automatically when opened or saved;
answer keys and stored answers are unchanged. Locked legacy pages keep their original structure.

## Follow-up questions (new layout)

A follow-up is an ordinary question with a `visibleIf` rule on an earlier answer; the definition stays a
flat ordered list (page `questions`, or a repeater's `metadata.fields` for its Add/Edit popup). In the new
builder layout the canvas shows a short summary under the question that reveals them ("If “Yes” → Other
Names"); the pencil on that question, or on a choice question's **Add follow-up question**, opens one
dialog with the question, a branch per answer and every follow-up, including record popup fields and
follow-ups of follow-ups. From there administrators add a follow-up for an answer, choose which answers
show it (one answer saves `equals`, several save `in`; any further rules are kept), reorder within an
answer, change a popup field's answer type, and delete. New follow-ups are inserted directly after the
questions their trigger already reveals. The tree is built by `src/lib/questionnaireConditionalBranches.js`.
Locked legacy pages open the same dialog for wording only. The classic layout is unchanged.

## Deleting questions

On pages whose structure is editable (dynamic or certified), each question card has a trash button next to
its pencil, and the question editor and follow-up dialog have **Delete**. A confirmation names the question
and explains that it disappears for future clients while answers clients have already saved are kept (the
client never deletes stored keys a page no longer manages, `preserveUnmanagedAnswers`). The question goes
together with its follow-ups, which the confirmation lists. If any other display rule (on this page, a popup
field or another page, including `anyOf` groups) reads its answer, deletion is blocked and the confirmation
names those items. Page `metadata.prefill` rules and repeater table columns for the removed answers are
removed, and the confirmation lists them. Legacy locked pages offer no deletion. Logic:
`src/lib/questionnaireQuestionDeletion.js`.
