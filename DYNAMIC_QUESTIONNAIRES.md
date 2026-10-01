# Dynamic questionnaires

The admin portal manages JSON questionnaire definitions at **Admin → Questionnaires**. Owners can edit visible copy on a live questionnaire, or use **Copy as test** / **Add questionnaire** to prepare a separate test definition. Saving a test does not affect clients; **Make live** publishes it for its visa audience and archives the previous live definition.

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

The editor allows the owner to change questionnaire structure, wording, options and rules in a Test copy before publishing. Built-in client pages continue to protect their existing answer keys, fields and validation so saved answers remain readable; their supported wording and option labels can be edited directly. Adding a previously absent help text or placeholder converts that page to the dynamic renderer so the new copy is actually displayed.

Definitions override registered client page slots; they do not create new URLs or own the client navigation. **Add page** is available only when the selected visa flow has an unused registered page route. Removing a managed built-in page restores that built-in client page rather than removing the step from the journey.
