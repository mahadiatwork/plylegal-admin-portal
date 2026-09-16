# Dynamic questionnaires

The admin portal manages JSON questionnaire definitions at **Admin → Questionnaires**. Owners choose a questionnaire, edit its pages, questions, options and help text, then select **Save**. Changes are saved directly to the questionnaire used by clients; the editor has no separate draft, publish or archive step.

## Storage and lifecycle

- Editable definitions live in Firestore collection `questionnaireDefinitions`.
- Every successful create/update also writes an immutable copy to `questionnaireDefinitionRevisions`.
- Submitted applications store `questionnaireDefinitionRef` (`id`, `revision`, and display `version`) so the exact historical JSON can be identified after later edits or deletion.
- The client portal still uses the internal `active` marker required by the shared Firestore rules. Older draft and archived records remain available for compatibility and revision history but are not shown as separate questionnaires in the owner-facing editor. If a save changes an audience, the server keeps the client-facing active selection unambiguous and snapshots the previous revision.
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

The editor allows the owner to change questionnaire structure, wording, options and rules in one save. Built-in client pages continue to protect their existing answer keys, fields and validation so saved answers remain readable; their supported wording and option labels can be edited directly.
