# Questionnaire structure and read-only admin review

This document describes **how questionnaire data is stored in Firebase**, how **main applicant** vs **shared (all applicant)** sections relate, and the **human-readable question labels** this review app uses when pairing questions with answers. Use it when building another admin app that must show **questions and answers together** in a **read-only** layout (similar to the portal questionnaire UI).

---

## 1. Where data lives (Firebase)

| Location | Purpose |
| -------- | ------- |
| `applications` | Collection of application documents (filtered by `zohoId`, Deal/Matter ID). |
| `applications/{appId}` | Application metadata (reference title, visa type, progress, etc.). |
| `applications/{appId}/data/questionnaire` | **Single document** holding the submitted questionnaire **draft** as nested JSON. |

The API route `GET /api/application/[matterId]/draft` loads that document and returns `draft` as JSON (after stripping `updatedAt`). Your admin app can read the **same path** with appropriate security rules.

---

## 2. Mental model: two buckets + anything else

The **legacy** mapping in this codebase (see `app/page.js`) assumes two primary subtrees:

| Draft path | Meaning in the product |
| ----------- | ----------------------- |
| `draft.mainApplicant` | Information tied to the **primary applicant** (personal details, identity, employment, education, language, family). |
| `draft.allApplicants` | Information that applies **across the application** or is collected once for everyone (addresses, contact, travel, visas, health, character). |

Names are historical: `allApplicants` does **not** mean “an array of every person”—it is a **namespace** for shared sections. Additional people (dependants, secondary applicants) may appear in your main product under **other top-level keys** on the same questionnaire document.

### Dynamic rendering (preferred for completeness)

When `buildDynamicSections(draft)` runs (`app/page.js`), **every non-empty top-level key** of `draft` becomes its **own accordion section**:

- If the value is an **object**, each **child key** becomes one **row**: label = formatted key, value = nested JSON (objects and arrays rendered recursively).
- If the value is a **primitive**, one row uses the top-level key as the label.

So if Firebase stores `dependants`, `secondaryApplicants`, or visa-specific blocks as sibling keys next to `mainApplicant`, they **automatically** appear as separate sections with **labels derived from keys** (`formatLabel`: snake_case → Title Case, camelCase split).

---

## 3. Legacy section → question labels → JSON paths

Below is the **explicit question copy** and where each **answer** is read from in the legacy fallback. This is the closest thing to a fixed “questionnaire spec” in this repo (the live portal may use the same field paths).

### 3.1 `mainApplicant`

| Section title | Question (shown to user) | Answer path (under `draft`) |
| ------------- | ------------------------ | ---------------------------- |
| Main Applicant Details | Are you the main applicant? | `mainApplicant.details.is_main_applicant` |
| Main Applicant Details | Title/Prefix | `mainApplicant.details.prefix` |
| Main Applicant Details | What is your family name? | `mainApplicant.details.family_name` |
| Main Applicant Details | What are your given names? | `mainApplicant.details.given_names` |
| Main Applicant Details | Preferred name(s) | `mainApplicant.details.preferred_names` |
| Main Applicant Details | What is your gender? | `mainApplicant.details.gender` |
| Main Applicant Details | What is your date of birth? | `mainApplicant.details.dob` |
| Main Applicant Details | What is your country of birth? | `mainApplicant.details.country_of_birth` |
| Main Applicant Details | Suburb of birth | `mainApplicant.details.suburb_of_birth` |
| Main Applicant Details | City/Town of birth | `mainApplicant.details.city_of_birth` |
| Main Applicant Details | State/Province of birth | `mainApplicant.details.state_of_birth` |
| Main Applicant Details | Marital status | `mainApplicant.details.marital_status` |
| Other Names | Have you been known by any other names? | `mainApplicant.otherNames.has_other_names` |
| Other Names | Other names | `mainApplicant.otherNames.other_names` (array) |
| Identity Documents | Citizenship countries | `mainApplicant.identity.citizenships` (array) |
| Identity Documents | National identity cards | `mainApplicant.identity.nationalIdentityCards` (array) |
| Identity Documents | Passports | `mainApplicant.identity.passports` (array) |
| Employment History | Employment records | `mainApplicant.employment.employments` (array) |
| Education | Have you completed post-secondary education? | `mainApplicant.education.hasEducation` |
| Education | Education records | `mainApplicant.education.educations` (array) |
| Language Proficiency | Language tests | `mainApplicant.language.languageTests` (array) |
| Family Information | Relationship status | `mainApplicant.family.relationshipStatus` |
| Family Information | Partner details | `mainApplicant.family.partner` (object) |

### 3.2 `allApplicants` (shared sections)

| Section title | Question (shown to user) | Answer path (under `draft`) |
| ------------- | ------------------------ | ---------------------------- |
| Contact Details | Email address | `allApplicants.contactDetails.email` |
| Contact Details | Home phone | `allApplicants.contactDetails.homePhone` |
| Contact Details | Mobile phone | `allApplicants.contactDetails.mobilePhone` |
| Contact Details | Business phone | `allApplicants.contactDetails.businessPhone` |
| Addresses | Current addresses | `allApplicants.addresses.currentAddresses` (array) |
| Travel History | Travel history | `allApplicants.travelHistory.travels` (array) |
| Previous Visas | Previous visa applications | `allApplicants.visas.applications` (array) |
| Health Information | Health examinations | `allApplicants.health.examinations` (array) |
| Health Information | Healthcare work history | `allApplicants.health.healthcareWork` (array) |
| Health Information | TB history | `allApplicants.health.tbHistory` (array) |
| Health Information | Health conditions | `allApplicants.health.conditions` (array) |
| Character Information | Character questions | `allApplicants.character.questions` |
| Character Information | Criminal convictions | `allApplicants.character.convictions` (array) |
| Character Information | Military service | `allApplicants.character.militaryService` (array) |

---

## 4. Nested objects and arrays (how rows look)

- **Primitives** (string, number, boolean): shown as one label + one value; booleans become `Yes` / `No` where the renderer applies that rule.
- **Arrays of objects** (e.g. passports, employments): each item is usually rendered as a **group** (“Item 1”, “Item 2”) with inner **key/value** rows (`DynamicValue` / array handling in `QuestionAnswer` in `app/page.js`).
- **Nested plain objects** (e.g. partner details): recursive label/value grid.

Your admin UI should **never** flatten to “values only”; always keep the **label** (question or field name) beside or above the **value**.

---

## 5. Fixing “only answers, no questions” in another app

This usually happens when the UI binds to **values** from Firebase without the **metadata** that identifies what each value means.

| Pitfall | What to do |
| ------- | ----------- |
| Iterating `Object.values(draft)` only | Iterate **`Object.entries`** (or fixed paths above) so each value has a **key**; map keys to labels via **`formatLabel`** or the tables in §3. |
| Storing only answer blobs | Prefer storing **structured objects** that preserve field names (as this draft does). If you must store `{ questionId, value }`, maintain a **lookup table** from `questionId` → display string. |
| Expecting one flat list | The real shape is **nested**; mirror **sections** (accordions) → **rows** → optional **nested** blocks for arrays/objects. |
| Multiple applicants | If each person is under its own top-level key in `draft`, use **dynamic sections** (one accordion per top-level key). If your product uses an **array** of applicants, loop the array and create one block per index with a title like `Applicant 1`, `Applicant 2`, or use names from nested fields when present. |

### Read-only presentation (same structure, not editable)

1. **Do not** use `<input>`, `<textarea>`, or `contenteditable`. Use **text nodes** or `<dd>` / `<div>` for values.
2. Match portal-style patterns: **label** (uppercase or emphasized, muted color) + **value** (normal weight) stacked or in a two-column grid.
3. Reuse the **accordion** pattern: section title + optional item count; body = list of Q/A rows.
4. Optionally add **search** that filters rows by label or stringified value (as in `SectionCard` in `app/page.js`).

---

## 6. Minimal JSON shape example (illustrative)

Your Firebase questionnaire document might resemble (keys and nesting vary by visa/product):

```json
{
  "mainApplicant": {
    "details": {
      "family_name": "Example",
      "given_names": "User",
      "dob": "1990-01-01"
    },
    "identity": {
      "passports": [{ "number": "X123", "country": "..." }]
    }
  },
  "allApplicants": {
    "contactDetails": {
      "email": "user@example.com"
    }
  },
  "dependantApplicant": {
    "details": { "family_name": "Child" }
  }
}
```

Dynamic rendering would yield sections such as **Main Applicant**, **All Applicants**, **Dependant Applicant**, each with child rows—without extra code for every visa type, as long as the JSON is **keyed**.

---

## 7. Related implementation files

| Topic | File |
| ----- | ---- |
| Fetch questionnaire from Firebase | `app/api/application/[matterId]/draft/route.js` |
| Dynamic sections + legacy mapping | `app/page.js` (`buildDynamicSections`, `legacySections`, `QuestionAnswer`) |
| Expandable UI details | `docs/review-ui-expandables-print-pdf.md` |

---

## 8. Summary

- Questionnaire data is a **single Firestore document** at `applications/{appId}/data/questionnaire`.
- **Applicants** in the business sense may appear as **`mainApplicant`**, **`allApplicants`**, or **additional top-level keys**; dynamic rendering shows all top-level keys as sections.
- **Questions** in the UI are either **explicit strings** from the legacy tables (§3) or **derived from JSON keys** via `formatLabel` when using dynamic mode.
- For admin review, always render **label + value**, read-only, in the **same nested structure** as the draft—never answers alone.
