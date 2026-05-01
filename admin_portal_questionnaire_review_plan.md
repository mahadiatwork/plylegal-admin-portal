# Admin Portal — Questionnaire Review Interface Plan (482 / 186)

> **Scope**: Brain-storming spec for the admin app at `F:\Work Projects\validify-pro-admin-portal`.
> **Outcome**: A read-only, beautifully laid out review of an applicant's submitted questionnaire (Skills in Demand subclass 482 and Employer Nomination subclass 186), styled to mirror the screenshot from `plylegal-admin-portal.vercel.app`.
> **No code changes** are made by this plan; this is a written reference.

---

## 1. Goals

1. **Mirror the live screenshot UI**: PlyLegal logo, top navbar, matter title with status pills (visa type + Read Only), circular completion indicator, single Questionnaire tab, left navigation rail, expandable Q/A cards, search bar, "Expand All" + "Download PDF" actions.
2. **Show questions paired with answers** — never raw values. If a field is empty, **do not render it** (read-only, "selected answers only").
3. **Support 482 (Skills in Demand) and 186 (Employer Nomination)** with identical mechanics (186 is essentially 482 plus a wider employment lookback and Spouse Education/Language).
4. **Enable inline comments/suggestions** on any section, sub-section, or individual answer. Comments are stored centrally, surface as **bell notifications** in the applicant portal, and render as a **red inline note** on the matching intake form field.
5. **Remove** the "Documents" and "Messages" tabs from the admin portal — Questionnaire is the only tab.

---

## 2. Source data — where each piece lives

| Concern | Location | Notes |
|---|---|---|
| Application metadata | `applications/{appId}` | `reference`, `type`, `visaTypeCode`, `zohoId`, etc. |
| Submitted answers | `applications/{appId}/data/questionnaire` | Single nested JSON document. |
| Per-page completion flags | `applications/{appId}/data/completion` | Used by `percentage = completedSections / getAllRoutes(...)` (already implemented in `src/app/api/matter/[matterId]/route.js`). |
| **NEW**: Reviewer comments | `applications/{appId}/data/reviewComments/{commentId}` | Sub-collection — see §10. |
| **NEW**: Notifications | `notifications/{notificationId}` (top-level), filtered by `appId` and `userId` | See §11. |

The matter API route the admin portal already uses (`/api/matter/[matterId]`) returns `application`, `questionnaire`, `completion`, and `percentage`. **No backend reshape required for the read-only view.**

> **Lookup behavior**: matter ID can be the **Zoho Deal ID** (`zohoId`) or the **Firebase doc ID**; the existing route handles both. Reuse this logic for any new endpoint.

---

## 3. Visual design system

### 3.1 Color palette

| Token | Value | Usage |
|---|---|---|
| `--brand-primary` | `#285646` (PlyLegal dark green) | Active tab underline, expanded section accent bar, percentage ring, primary buttons, sidebar active item |
| `--brand-primary-soft` | `rgba(40, 86, 70, 0.08–0.15)` | Section header hover, expanded background, badge backgrounds |
| `--brand-primary-hover` | `#1e4035` | Mobile FAB hover |
| `--surface-base` | `#ffffff` | Cards, header |
| `--surface-page` | `#f9fafb` (Tailwind `bg-gray-50`) | Main canvas |
| `--surface-collapsed` | `rgba(249,250,251,0.8)` (`bg-gray-50/80`) | Collapsed section header |
| `--surface-row` | `#fafafa` (`bg-gray-50` for array items) | "Item 1" sub-cards |
| `--border-subtle` | `#f3f4f6` (Tailwind `border-gray-100`) | Hairline dividers between rows |
| `--border-default` | `#e5e7eb` (Tailwind `border-gray-200`) | Card border |
| `--text-primary` | `#111827` (`text-gray-900`) | Headings, answers |
| `--text-secondary` | `#6b7280` (`text-gray-500`) | Captions ("All data saved by the applicant.") |
| `--text-label` | `#6b7280` uppercase | Field labels |
| `--text-muted` | `#9ca3af` | Empty placeholders ("—") |
| `--badge-blue` | `bg-blue-100 / text-blue-800` | Visa type pill |
| `--badge-gray` | `bg-gray-100 / text-gray-800` | "Read Only" pill |
| `--state-yes` | `text-emerald-600` | Boolean **Yes** |
| `--state-no` | `text-gray-400` | Boolean **No** |
| `--state-warn` | `text-amber-600` | Search "no match" text |
| **NEW** `--comment-accent` | `#dc2626` (red-600) | Inline red notes on form fields when a reviewer leaves a comment |
| **NEW** `--comment-bg` | `#fef2f2` (red-50) | Background of inline red note |
| **NEW** `--comment-bubble` | `#f59e0b` (amber-500) | Comment indicator dot on admin section header |

### 3.2 Typography

- **Family**: same stack as the live portal (`font-sans` / system font). Display/serif accent only on the page hero ("Questionnaire Answers" stays sans).
- **Title**: 20–24px / 700 (`text-xl/2xl font-bold text-gray-900`).
- **Section header**: 15px / 600 (`text-[15px] font-semibold`) — color shifts to `#285646` when expanded.
- **Field label**: 12px / 500 / uppercase / muted (`text-xs font-medium text-gray-500 uppercase`).
- **Field value**: 14px / regular / `text-gray-900`.
- **Helper / caption**: 13px / 400 / `text-gray-500`.

### 3.3 Layout grid

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Top Navbar (full-width, white, border-b border-gray-100)                   │
│  [Logo]   ←Back to Search                              🔍 🔔 [MH ▾]         │
├─────────────────────────────────────────────────────────────────────────────┤
│  max-w-7xl mx-auto px-4 sm:px-6 lg:px-8                                     │
│                                                                             │
│  Matter Hero                                                                │
│  Title  [Visa pill]  [Read Only pill]      ┌──── Completion 100% ────┐     │
│  Deal ID: …  •  App ID: …                  │  ◯ ring   Questionnaire │     │
│                                            └──────────────────────────┘    │
│  ─── Tab bar (Questionnaire only — see §6) ────────────────────────────    │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─Sidebar 280px ──┐  ┌─ Main content (flex-1) ────────────────────────┐  │
│  │ All Applicants  │  │ ┌─ Control bar ───────────────────────────┐    │  │
│  │  • Visas        │  │ │ Questionnaire Answers                  │    │  │
│  │  • Travel       │  │ │ All data saved by the applicant.       │    │  │
│  │  • Health       │  │ │ [⛶ Expand All] [⤓ Download PDF]        │    │  │
│  │ Applicants      │  │ │ [🔍 Search questions or answers…]      │    │  │
│  │  • Main         │  │ └─────────────────────────────────────────┘    │  │
│  │  • Spouse       │  │                                                │  │
│  │  • Children     │  │ ┌─ Section card (collapsed) ──────────────┐   │  │
│  │ Other           │  │ │ │ Section title  [n items]            ▾ │   │  │
│  │  • Visa Context │  │ └─────────────────────────────────────────┘   │  │
│  └─────────────────┘  │ ┌─ Section card (expanded) ───────────────┐   │  │
│                       │ │▎ Section title                         ▴ │   │  │
│                       │ │ Field Label                              │   │  │
│                       │ │ Answer text…                             │   │  │
│                       │ │ ── divider ──                            │   │  │
│                       │ │ Field Label                              │   │  │
│                       │ │   ┌─ Item 1 (gray-50 chip) ─────────┐    │   │  │
│                       │ │   │ Sub-label  Sub-answer            │    │   │  │
│                       │ │   └──────────────────────────────────┘    │   │  │
│                       │ └────────────────────────────────────────┘   │  │
│                       └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Component specifics (matching the screenshot)

| Element | Specification |
|---|---|
| **PlyLegal logo** | 28–36px tall (`h-7 sm:h-9`), left-aligned in top navbar. |
| **Back to Search** | Icon + text link in `text-gray-500` → `text-gray-900` on hover. Hidden on mobile (`hidden sm:inline-flex`). |
| **Title block** | `text-2xl font-bold` matter reference, plus two pills with rounded-full padding (`px-2.5 py-0.5 text-xs font-medium`). |
| **Visa pill** | `bg-blue-100 text-blue-800` — content e.g. "Skills in Demand (Subclass 482)" or "Employer Nomination (Subclass 186)". |
| **Read Only pill** | `bg-gray-100 text-gray-800 border border-gray-200`. |
| **Completion ring** | 48×48 SVG donut, gray track + brand stroke, percentage centered in `text-xs font-bold text-[#285646]`. Sits inside a `bg-gray-50` rounded box with the labels "Completion / Questionnaire Progress". |
| **Tab bar** | Underline-on-active style, `border-b-2`. Active = `border-[#285646] text-[#285646]`. **Only Questionnaire shown.** |
| **Sidebar** | 280px on desktop, sticky under the header (`top-[137px]`). Mobile = floating FAB (bottom-right) + slide-in drawer with `bg-black/30` overlay. Sticky height = `calc(100vh - 137px)`. |
| **Section card** | Rounded-2xl-ish (Card UI), `overflow-hidden`. Collapsed header = `bg-gray-50/80` + grey chevron. Expanded header = `bg-[#285646]/8`, **1px×24px brand-green vertical accent bar** to the left of the title, title color shifts to `#285646`. |
| **"n items" badge** | Next to title, only visible when collapsed and `count > 0`. Tailwind `Badge` secondary variant. |
| **Field row** | Stacked layout: uppercase muted label on top, value below. `border-b border-gray-100`, last child no border. |
| **Boolean rendering** | `true` → `Yes` in `text-emerald-600 font-medium`; `false` → `No` in `text-gray-400`. |
| **Empty / null** | Render `—` in `text-muted-foreground`. (But, per requirement, hide entire row when value is empty/null/undefined — already implemented in `RenderQuestions`.) |
| **Array of objects** | Each item in a soft `bg-gray-50 rounded-lg p-3 border border-gray-100` block, with an "Item N" chip in the top-left (`text-[10px] font-bold uppercase`). |
| **Nested object** | Indented with `pl-3 border-l-2 border-gray-200`. |
| **Search bar** | `max-w-md`, leading magnifier icon, `pl-10`. Live filters labels and values; non-matching sections hidden. |
| **Search-empty state** | Friendly card with "No sections match your search." + Clear Search button. |
| **Expand All / Collapse All** | Outline button, swaps icon between `Maximize2` and `ChevronUp`. |
| **Download PDF** | Outline button → `window.print()` (admin already has a print-only Q/A layout). |

> **All of these specs already exist in `src/app/matter/[matterId]/questionnaire/page.js`** and `src/components/QuestionnaireSidebar.jsx` of the admin portal. Use them verbatim — only add the comment/annotation overlay (§10).

---

## 4. Page architecture (admin portal — proposed final shape)

```
src/app/
├── layout.js                                  (root)
├── page.js                                    (matter search → unchanged)
├── matter/
│   └── [matterId]/
│       ├── layout.js          ← strip Documents + Messages tabs (see §6)
│       └── questionnaire/
│           └── page.js        ← review UI (already 95% done; layered with comments)
└── api/
    ├── matter/
    │   └── [matterId]/
    │       └── route.js                          (existing — ok)
    └── review-comments/                          (NEW)
        └── [matterId]/
            ├── route.js                          GET list / POST create
            └── [commentId]/
                └── route.js                      PATCH (resolve) / DELETE
```

### Components

| Component | Status | Purpose |
|---|---|---|
| `Card`, `Badge`, `Button`, `Input`, `Collapsible`, `ScrollArea` | Existing (admin) | shadcn-style primitives. |
| `QuestionnaireSidebar` | Existing | Left rail. Add a small amber dot next to any section that has unresolved comments. |
| `SectionCard` | Existing (in page.js) | Accordion section; extend with `commentCount` slot in the header. |
| `RenderQuestions` | Existing (in page.js) | Recursive Q/A renderer; extend each leaf row with a hover **"💬 Add note"** action. |
| `PrintQARenderer` | Existing | Print-only layout for "Download PDF". |
| **NEW** `CommentBubble` | New | Inline icon at the end of every leaf row. Click → opens `CommentDrawer`. |
| **NEW** `CommentDrawer` | New | Right-side slide-over (or modal on small screens) showing all comments scoped to a path (section / sub-section / leaf). Form to add a new comment with `severity` (`info` / `suggestion` / `issue`) and free-text body. |
| **NEW** `CommentBadge` | New | Tiny pill counting unresolved comments on a section header. |

---

## 5. Visa-routing conventions (482 vs 186)

The admin reads a single shape: **whatever the applicant submitted under `applications/{appId}/data/questionnaire`**. Both 482 and 186 share the same Firestore key layout (the 186 difference is the route list and a couple of extra spouse pages — the data shape itself is identical, just with more populated keys for 186).

`questionnaire.visaContext` (string `"482"` or `"186"`) is the single source of truth for which **route list** to grade completion against. The admin already calls `getAllRoutes(visaTypeCode, visaContext, profiles)` from `src/lib/routes.js`, which mirrors the portal's `getDynamicTemporaryWorkRoutes` and adds Education + Language to spouse for 186.

---

## 6. Tabs removal — Documents & Messages

> **Brain-storm note for implementation later** (no code change in this plan):

In `F:\Work Projects\validify-pro-admin-portal\src\app\matter\[matterId]\layout.js` the `tabs` array has three entries:

```js
const tabs = [
  { name: "Questionnaire", path: `/matter/${matterId}/questionnaire`, icon: FileText },
  { name: "Documents",     path: `/matter/${matterId}/documents`,     icon: Upload },
  { name: "Messages",      path: `/matter/${matterId}/messages`,      icon: MessageSquare },
];
```

**Action when implementing**:
1. Reduce `tabs` to a single entry `Questionnaire`.
2. Remove the `<nav>` strip entirely (since one tab needs no tabs) **OR** keep it for visual symmetry — UX call.
3. Delete (or archive) `src/app/matter/[matterId]/documents/*` and `src/app/matter/[matterId]/messages/*` — and their API routes `src/app/api/documents/[matterId]` and `src/app/api/messages/[matterId]`.
4. Update default redirect: hitting `/matter/{id}` should land on `/matter/{id}/questionnaire`.

---

## 7. Empty / partial state behavior

| Scenario | UI |
|---|---|
| `questionnaire` doc missing | Card: "No questionnaire data available for this matter." (already implemented). |
| Section has no completed fields | Hide the section entirely from the main pane and from the sidebar. Use `countQuestions` returning 0 as the gate. |
| Field is `null` / `""` / `undefined` | Skip the row (do not render label). |
| Field is `0` or `false` | Render as "0" / "No" — do **not** treat as empty. |
| Search has no results | Friendly empty state + Clear Search button. |

---

## 8. PDF export

Use the existing print-only `PrintQARenderer` block. Add a brand-styled header with logo, matter title, visa pill, deal ID, and generated-at date. Each section becomes an `<h3>` followed by Q/A pairs. **Reviewer comments** can be inlined under each Q/A as `Reviewer note (J. Doe, 2026-04-30): "Please confirm passport expiry."` — see §10.

---

## 9. Profiles and dependants — how to render

The portal stores extra people two ways:

1. **`profiles[]`** array on the questionnaire — used to drive routing in the intake. Each entry has `id`, `relationship` (`main_applicant` | `spouse` | `child` | `other`), `family_name`, `given_names`, `gender`, `birth_day/month/year`, etc.
2. **`profiles_data[profileId]`** — section-by-section answers per person (`details`, `identity`, `employment`, `education`, `skills`, `language`, `contact_details`, `other`). For the **legacy main applicant** the data still lives at `temporary_work_*` keys (e.g., `temporary_work_details`, `temporary_work_identity`).
3. **`non_migrating_members[]`** with `non_migrating_data[memberId]` for non-migrating relatives (Skills in Demand 482 only collects 6 sub-sections per non-migrating member).

**Admin rendering rule**:
- For each `profile` in `profiles`, build a **virtual top-level section** keyed `Applicant 1 (Main Applicant) — MD MAHADI HASAN`, `Applicant 2 (Spouse) — Nabila Tabassum`, `Applicant 3 (Child) — Mehraj Hasan` (matching the screenshot's left rail).
- Inside that section, recurse over `profiles_data[profileId]` (or the legacy `temporary_work_*` keys for the main applicant). Use the existing `RenderQuestions` recursive renderer.
- Children get the three sub-pages: **Details**, **Identity**, **Custody**. Non-migrating members get the six.
- Top-level **All Applicants** section continues to use `temporary_work_*` keys for visas, travel-history, countries-of-residence, health, character.

---

## 10. **Reviewer comments / suggestions feature**

### 10.1 Data model (Firestore)

```text
applications/{appId}/data/reviewComments/{commentId}
  {
    id: string,
    path: string,                       // e.g. "mainApplicant.details.passport_country"
                                        //      "allApplicants.health.examinations[2].country"
                                        //      "profile:abc123.education.educations[0].institution_name"
    sectionKey: string,                 // top-level section the path belongs to ("mainApplicant")
    profileId: string | null,           // when path is per-profile
    label: string,                      // human-readable label captured at write time ("Passport Country")
    body: string,                       // markdown/plain text
    severity: "info" | "suggestion" | "issue",
    status: "open" | "resolved",
    authorId: string,                   // admin user id
    authorName: string,
    createdAt: Timestamp,
    updatedAt: Timestamp,
    resolvedAt: Timestamp | null,
    resolvedBy: string | null,
  }
```

### 10.2 API endpoints (admin app)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/review-comments/[matterId]` | List all comments grouped by `path`. |
| `POST` | `/api/review-comments/[matterId]` | Create comment (`{ path, label, body, severity }`). |
| `PATCH` | `/api/review-comments/[matterId]/[commentId]` | Update body / mark `resolved`. |
| `DELETE` | `/api/review-comments/[matterId]/[commentId]` | Soft-delete. |

### 10.3 UI affordances inside `questionnaire/page.js`

- **Section header** — when `commentCount(sectionKey) > 0`, show an amber dot + count badge (`bg-amber-50 text-amber-700 border border-amber-200`). Click count → opens drawer filtered to the section.
- **Leaf field row** — on hover, surface a small `MessageSquarePlus` icon (right-aligned, `opacity-0 group-hover:opacity-100`). Click → opens drawer pre-scoped to that field's `path` and `label`.
- **`CommentDrawer`** — right-side slide-over (`w-96`):
  - Header: section title and current path breadcrumb.
  - Severity selector pills:
    - `Info` — `bg-blue-50 text-blue-700`
    - `Suggestion` — `bg-amber-50 text-amber-700`
    - `Issue` — `bg-red-50 text-red-700`
  - Textarea + Save / Cancel buttons.
  - Existing comments list grouped chronologically with author, time, resolve toggle.
- **Comment indicator on field** — a thin red left border (`border-l-2 border-red-400`) plus the small red note text **below** the answer (`text-xs text-red-600 italic`) that reads the most recent unresolved comment body, e.g. _"Reviewer suggests confirming this passport's expiry date."_

### 10.4 Surface in applicant portal (this repo)

> Out of scope for actual code in this plan, but documented here so the future implementation knows the contract:

1. **`/api/review-comments/[appId]`** read-only endpoint added to the **applicant portal** that returns all `status: "open"` comments for the active user's application.
2. **Bell icon notification badge** — the existing header bell in `src/components/AppHeader.jsx` should subscribe to a `notifications` collection. New comment → a notification doc:
   ```
   notifications/{id}
     { userId, appId, kind: "review_comment", commentId, path, body, createdAt, readAt: null }
   ```
3. **Inline red note on the matching intake page** — every form field can declare its `path` (mirror the admin path keying). On mount, the page fetches comments for the application and renders an inline note under any field whose `path` matches. Style:
   ```
   ┌─ Field input ─┐
   └───────────────┘
   ⚑ Reviewer note: Please double-check this passport's expiry date.
       — J. Doe • 30 Apr 2026                              [Mark resolved]
   ```
   - Wrapper: `mt-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2`.
   - Icon: `AlertCircle` `h-3.5 w-3.5 mt-0.5`.
   - Resolution writes back to the same Firestore doc, flipping `status` to `resolved` and clearing the bell notification.

### 10.5 Path keying convention

To make admin path strings round-trip with applicant-portal field names, agree on this format:

| Section type | Path examples |
|---|---|
| Legacy main applicant (482/186) | `mainApplicant.details.family_name`, `mainApplicant.identity.passports[0].document_number` |
| All-applicants shared section | `allApplicants.health.examinations[1].country` |
| Per-profile data | `profile:{profileId}.details.family_name`, `profile:{profileId}.education.educations[0].institution_name` |
| Non-migrating member | `nonMigratingMember:{memberId}.passport.document_number` |
| Profile card itself | `profileCard:{profileId}.given_names` |

Renderer takes the current parent path as it recurses into objects/arrays, so a comment can attach to any depth.

---

## 11. Notifications integration (high level)

| Trigger | Resulting record(s) |
|---|---|
| Admin saves a new comment | `notifications/{id}` for the applicant's `userId`, with `kind: "review_comment"` and a deep link `/applications/{slug}/{appId}/intake/{deepRoute}`. |
| Admin marks a comment `resolved` | Mark the related notification `readAt = now()`. |
| Applicant marks the inline red note resolved | Comment status flips to `resolved`; notification gets `readAt`. |
| Applicant edits a field that has an open comment | Optional: tag comment as `stale` (so reviewer can re-open or accept). |

The applicant portal's existing bell icon (`Bell` in `src/components/AppHeader.jsx`) already has UI room for an unread badge. Wire to a Firestore listener on `notifications` filtered by `userId` and `readAt == null`.

---

## 12. Full question/section catalog

> Source = the actual intake pages in this repo under `app/intake/temporary-work/**/page.js` and `src/lib/routes.js` (`TEMPORARY_WORK_VISA_ROUTES`, `EMPLOYER_NOMINATION_ROUTES`, `CHARACTER_QUESTIONS`).
> The admin portal does **not** ship its own question copy — it derives labels via `formatLabel(key)` from the live data, but having the canonical list here is essential for designers, comment authoring, and PDF templating.

### 12.1 Common to **482 (Skills in Demand)** AND **186 (Employer Nomination)**

#### A. Getting Started
| # | Question / Field | Notes |
|---|---|---|
| A.1 | Have you previously started or imported a Skills in Demand / Employer Nomination application? | Boolean toggle. |
| A.2 | Do you accept the privacy notice & terms of intake? | Required gate before continuing. |

#### B. Application Profile
This is a single page that captures **everyone** who will be on the application: main applicant, spouse/de facto partner, dependent children, and non-migrating relatives. Each row produces a `profile` (or `non_migrating_member`) record.

| # | Field per profile | Notes |
|---|---|---|
| B.1 | Relationship to Main Applicant | `main_applicant` / `spouse` / `child` / `other`. |
| B.2 | Relationship Status (de facto vs married, etc.) | Spouse only. |
| B.3 | Family Name (passport spelling) | |
| B.4 | Given Names (passport spelling) | |
| B.5 | Sex | Male / Female / Other / Prefer not to say. |
| B.6 | Date of Birth (Day / Month / Year) | |
| B.7 | Town or City of birth | |
| B.8 | State or Province of birth | |
| B.9 | Country of birth | |
| B.10 | Other Names / Spellings (repeater) | Family + Given + Type (Maiden / Alias / Translation). |
| B.11 | Citizenship countries (comma-separated) | |
| B.12 | Health — quick declaration (yes/no per category) | Triages whether full Health page is needed. |
| B.13 | Identity Documents quick reference | passport number, country, expiry. |

> The admin sidebar collapses the entire profile section into the "Applicant N (Role) — Name" group, exactly mirroring the portal's left rail in the screenshot.

#### C. Main Applicant — Personal sub-pages

##### C.1 Details
- Are you the main applicant? (yes/no — gate)
- If "no": **Person completing questionnaire** — Family Name, Given Names, Preferred Names, Gender, DOB.
- Title / Prefix
- Family Name
- Given Names
- Preferred Names
- Gender (Male / Female / Other)
- Date of Birth (Day / Month / Year)
- Country of Birth
- City or Town of Birth
- State or Province of Birth
- Marital Status (Never Married / Married / De Facto / Divorced / Widowed / Separated)
- Date of Marriage / De Facto / Divorce / Death of Spouse / Separation (conditional on status above)
- Does the applicant hold citizenship in any country other than country of birth? (yes/no)
  - Per citizenship: Country, How obtained, Date obtained.

##### C.2 Other Names
- Have you ever been known by any other Name or Alias, or had a different name spelling? (yes/no)
- Per other-name (repeater): Family Name, Given Names, Reason for Change, Date of Change, Use this name in the application? (yes/no)
- Other-name **evidence** (yes/no) — Evidence Type, Date of Document Issue, Document Reference Number, Issuing Country, Issuing State / Province, Place of Issue / Issuing Authority.
- Do you have a Chinese Commercial Code? (yes/no)
- Do you have Russian descent? (yes/no) → Patronymic Family Name, Patronymic Given Names.
- Have you previously had a different date of birth? (yes/no) → previous DOB + reason.

##### C.3 Identity (Passports & National IDs)
- Passports (repeater)
  - Type of Document (passport / travel doc)
  - Passport / Document Number
  - Passport Country
  - Place of Issue / Issuing Authority
  - Nationality
  - Gender as shown on this document
  - Name as shown on document
  - Date of Issue, Original Date of Issue (if renewed), Date of Expiry
  - Document Status (current / expired / lost / damaged)
- Do you hold a national identity card other than your passport country's? (yes/no) → repeater
  - National ID Card: Family name, Given names, Identification number, Country of issue, Date of issue, Date of expiry.

##### C.4 Contact Details
- Email address
- Mobile phone (with country code)
- Home phone
- Business phone
- Preferred contact method
- Best time to contact

##### C.5 Employment
- Are you currently employed? (yes/no)
- Current Employer / Position / Country / Employment Type / Date Started / Current Address.
- Employment History (last **5 years** for 482, last **10 years** for 186) — repeater of:
  - Date From / Date To (blank if ongoing)
  - Status (employed / unemployed / business owner / student / other)
  - Position Type
  - Position / Occupation
  - Employer / Organization
  - Country
  - What visa(s) were held during this period?
  - City / Town
  - Duties / Notes (max 300 chars)
  - Is this related to the nominated occupation? (yes/no)

##### C.6 Education
- Have you completed post-secondary education? (yes/no)
- Education records (repeater):
  - Qualification level (Secondary / Diploma-Certificate / Bachelor's / Master's / Doctorate-PhD / Other)
  - Course Status (Completed / Current-Ongoing / Deferred / Withdrawn)
  - Institution name
  - Country
  - State / Province
  - City
  - Course / Programme name
  - Start date / End date
  - Language of instruction
  - Was this course conducted entirely in English? (yes/no)

##### C.7 Skills (482/186-specific)
- Does the applicant hold any **Registrations / Licences / Memberships** for the nominated occupation? (yes/no)
  - Per registration (repeater): Authority, Title/Name, Licence Number, Country, Issue Date, Expiry Date, English-language requirement (yes/no) + details, Occupation.
- Has a **Skills Assessment** been completed? (yes/no)
  - Per assessment (repeater): Name of Skills Assessing Authority, Type of Skills Assessment, ANZSCO Code, Lodgement Date, Receipt Number, Outcome (Suitable / Not Suitable / Pending), Outcome Date, Outcome Reference Number.

##### C.8 Language
- Languages spoken (repeater): Language, Proficiency.
- Has the applicant taken an English-language test? (yes/no)
  - Per test (repeater): Test Type (IELTS / PTE / TOEFL / Cambridge / OET), Date, Location / Test Centre, Reference / Registration Number, Overall Score, Listening, Reading, Writing, Speaking.

#### D. Spouse / Partner — sub-pages
| Sub-page | 482 | 186 |
|---|---|---|
| Details | ✓ | ✓ |
| Identity | ✓ | ✓ |
| Education | — | ✓ (extra) |
| Language | — | ✓ (extra) |

Question content matches the main-applicant equivalents.

#### E. Children (dependents) — `/intake/temporary-work/children/[childId]/...`
| Sub-page | Fields |
|---|---|
| Details | Family Name, Given Names, Sex, DOB, Country of birth, Town/City, State/Province, Relationship to main applicant, Nationality, Will this child migrate? |
| Identity | Passports repeater (same shape as main applicant Identity). |
| Custody | Does any parent or guardian other than the main applicant have legal custody? Custody arrangement details, Consent letter on file (yes/no), Court order reference (if any). |

#### F. Non-migrating family members — `/intake/temporary-work/non-migrating/[memberId]/...`
| Sub-page | Fields |
|---|---|
| Details | Relationship, Family Name, Given Names, Sex, DOB, Country of birth, Town/City, State/Province, Will this person be included on application? (no, since non-migrating). |
| Passport | Does this person have a current passport? (yes/no) → Family Name, Given Names, Sex, DOB, Document number, Country, Issue date, Expiry. |
| Identity Documents | National ID card details. |
| Other Names | Other names / spellings repeater. |
| Citizenship | Citizenship countries (comma-separated). |
| Health | Does this person require a health examination? (yes/no) → details. |

#### G. All Applicants — shared sections

##### G.1 Visas (`allApplicants.visas` / `temporary_work_visas`)
- Has anyone on the application held a visa to Australia or any other country? (yes/no)
- Per visa (repeater): Country, Visa Type / Subclass, Visa Number, Date Granted, Date Expires, Date Departed, Status (Granted / Refused / Withdrawn / Expired), Reason refused/cancelled (if applicable).

##### G.2 Travel History (`allApplicants.travelHistory` / `temporary_work_travel`)
- Has anyone travelled outside their passport country in the last 10 years? (yes/no)
- Per travel record (repeater):
  - Which applicant(s)?
  - Country
  - Is this the main applicant's current location? (yes/no)
  - Reason for being in this Country (Tourism / Business / Study / Family / Work / Transit / Medical / Other) → details
  - Legal Status in this Country
  - Date Arrived
  - Date Departed (or current)

##### G.3 Countries of Residence (`temporary_work_countries_of_residence`)
- Has the main applicant lived in any country other than their country of birth for more than 12 months? (yes/no)
- Per country of residence (repeater): Name (descriptive), Date from, Date to (blank if current), Country, Address, Suburb / Town, State / Territory, Postcode.

##### G.4 Health (`allApplicants.health` / `temporary_work_health`)
The health page bundles many yes/no triages. For each, if yes, a sub-repeater is collected.

| Question | Sub-repeater shape |
|---|---|
| Health examinations done? | Per examination: which applicant, Date Completed, Country of Examination, HAP ID. |
| Visited outside passport country (TB-relevant)? | Per trip: which applicant, Country, Date from, Date to. |
| Worked at a hospital / health-care facility? | Per role: which applicant, Role, Give details. |
| Health-care work generally? | Per role. |
| Aged-care / disability-care work? | Per role. |
| Worked at a child-care centre? | Per role. |
| Worked / studied in a classroom? | Per role. |
| TB history? | Per applicant: details. |
| Other health conditions? | Per condition: applicant, Condition, Give details. |
| Ongoing medical care? | Per applicant: details. |
| Will any applicant need disability assistance during travel? | Yes/no + details. |

##### G.5 Character (`allApplicants.character` / `temporary_work_character`)
17 yes/no questions (canonical list in `src/lib/routes.js → CHARACTER_QUESTIONS`):
1. Charged with any offence currently awaiting legal action?
2. Convicted of an offence in any country?
3. Acquitted of any offence on the grounds of mental illness?
4. Found guilty of a sexually based offence?
5. Subject to any outstanding arrest warrant?
6. Subject to an arrest warrant or Interpol notice?
7. Involved in war crimes, crimes against humanity or genocide?
8. Involved in people smuggling or trafficking?
9. Associated with a group involved in criminal conduct?
10. Associated with a person involved in criminal conduct?
11. Had any military service?
12. Undergone any weapons training?
13. Involved in acts of genocide or torture?
14. Removed or deported from any country?
15. Excluded from any country?
16. Overstayed a visa in any country?
17. Outstanding debts to any government?

Plus follow-up repeaters:
- Criminal convictions (per: applicant, country, offence, date, sentence, details).
- Military service (per: applicant, country, branch, rank, dates, role).
- Deportations / exclusions / overstays (per: applicant, country, dates, details).

#### H. Submit
- Final declaration checkbox: "All information provided is true and complete to the best of my knowledge."
- Date of declaration.
- Signed by (name).

### 12.2 Differences specific to **186 (Employer Nomination)**

1. Employment History lookback = **10 years** (482 = 5).
2. Spouse adds **Education** and **Language** sub-pages (482 spouse only has Details + Identity).
3. `visaContext` = `"186"` rather than `"482"` (drives `EMPLOYER_NOMINATION_ROUTES`).
4. The "Skills" sub-page emphasises **direct nominated occupation match** rather than just registration; admins should look for the ANZSCO code that matches the nominator's nomination.

### 12.3 Differences specific to **482 (Skills in Demand)**

1. Employment History lookback = **5 years**.
2. Spouse limited to **Details + Identity**.
3. Children flow has 3 sub-pages (Details / Identity / Custody).
4. ANZSCO code in Skills must match the **TSS occupation** rather than the ENS occupation list.

---

## 13. Search and PDF behaviors with comments

- **Search bar** must also match comment bodies (so an admin can find which forms have "passport" mentioned in their notes).
- **PDF print** layer should optionally include comments (toggle: "Include reviewer notes"). Comments render under the relevant Q/A as a small italicised block:
  ```
  Reviewer note (J. Doe, 30 Apr 2026 — Issue): "Please confirm passport expiry date."
  ```

---

## 14. Permissions / RBAC

| Role | Read questionnaire | Read comments | Write comments | Resolve comments |
|---|---|---|---|---|
| Applicant | ✓ (their own only) | ✓ (their own app) | ✗ (read-only feedback) | ✓ (mark their own resolved) |
| Reviewer / Admin | ✓ (any) | ✓ | ✓ | ✓ |
| Read-only Admin (auditor) | ✓ | ✓ | ✗ | ✗ |

Firestore rules sketch:

```
match /applications/{appId}/data/reviewComments/{commentId} {
  allow read: if isAdmin() || isOwner(appId);
  allow create, update: if isAdmin();
  allow delete: if isAdmin();
}
```

---

## 15. Implementation roadmap (when actually building)

| Phase | Deliverable |
|---|---|
| **0. Plan freeze** | This document, sign-off from product/legal. |
| **1. Tabs trim** | Layout reduced to Questionnaire only; default redirect to `/questionnaire`. |
| **2. Visual polish** | Confirm screenshot-parity for matter hero, completion ring, sidebar, section accordion, badges, search, and print layout. |
| **3. Profiles rendering** | Ensure each profile and non-migrating member appears as its own sidebar group + main pane section, named "Applicant N (Role) — Full Name". |
| **4. Comment data layer** | Create Firestore subcollection + 3 API routes + Firestore rules. |
| **5. Comment UI** | `CommentBubble`, `CommentDrawer`, `CommentBadge`. Hover affordance on every leaf row. Sidebar amber dots. |
| **6. Notifications** | Top-level `notifications` collection, listener on applicant portal, badge on bell icon. |
| **7. Inline red note in applicant portal** | Path-keyed lookup on every intake form field, render `<RedReviewerNote>` if `status === "open"`. Mark-resolved hook back to comment doc. |
| **8. PDF integration** | Optional comment inclusion in `PrintQARenderer`. |
| **9. RBAC + audit** | Role checks, audit trail (createdAt/updatedAt/resolvedBy). |

---

## 16. Open questions / risks

1. **Single-source for question labels** — admin currently auto-derives labels via `formatLabel`. For comments to be meaningful in notifications, we need to capture the **actual question text** at write time (`label` field on the comment doc). For non-leaf paths the renderer should walk up the recursion to use the closest known label.
2. **Path stability** — if the applicant edits an array (e.g. removes the 2nd passport), `mainApplicant.identity.passports[2]` no longer exists. Comments need a fallback (perhaps a `signature` of the row's stable values like `documentNumber`).
3. **Real-time updates** — should the admin see new applicant edits without a refresh? If yes, switch the matter API call to a Firestore client listener (would require auth + read rules adjustments).
4. **Mobile UX** — sidebar already collapses; CommentDrawer should slide from bottom on small screens.
5. **Multiple admins** — concurrent comment editing — prefer optimistic locking via `updatedAt` checks.
6. **Hashed deal IDs** — same lookup pattern used in admin matter route is needed for the new comment endpoint (zohoId vs Firebase doc ID).

---

## 17. Quick-reference checklist for the admin portal questionnaire page

- [x] Read-only: never render `<input>` / `<textarea>`.
- [x] Hide empty values (label-on-only-when-answered).
- [x] Search across labels + values.
- [x] Expand all / Collapse all.
- [x] Sticky sidebar 280px on desktop, FAB drawer on mobile.
- [x] Brand color `#285646` for active states & accents.
- [x] Booleans → Yes (emerald-600) / No (gray-400).
- [x] Arrays → "Item N" chip cards.
- [x] Print layout matches admin "Download PDF".
- [x] Completion ring uses `completedSections / totalSections`.
- [ ] **NEW** Comment bubble on every leaf row (hover).
- [ ] **NEW** Sidebar amber dot when section has unresolved comments.
- [ ] **NEW** Severity-pill comment editor.
- [ ] **NEW** Notification doc + applicant portal bell badge.
- [ ] **NEW** Inline red note on the same form field in applicant portal.
- [ ] **REMOVE** Documents tab from `matter/[matterId]/layout.js`.
- [ ] **REMOVE** Messages tab from `matter/[matterId]/layout.js`.
- [ ] **REMOVE** `src/app/matter/[matterId]/documents/*` and `src/app/api/documents/*`.
- [ ] **REMOVE** `src/app/matter/[matterId]/messages/*` and `src/app/api/messages/*`.

---

> **End of plan**. No code changes have been made — this is the brief for the admin questionnaire review feature including 482, 186, comments, notifications, and the inline red note.
