# Review UI: expandables, search, print, and PDF

This document describes how the **Visa application review** screen in this project presents questionnaire data in expandable sections, and how **Print** / **Download PDF** work today. Use it as a recipe when building a similar “long-form data review” UI in another application.

The primary implementation is in `app/page.js` (the review when `?matter_id=...` is present). A lighter route exists at `app/[matterId]/page.js` with a different visual style.

---

## 1. How sections are built

### Dynamic sections (default)

The draft document from the API is turned into a list of **sections** in `buildDynamicSections(draft)`:

- Each **top-level key** of the JSON draft becomes a **section title** (label formatting turns `snake_case` / `camelCase` into readable titles).
- If the value is a **plain object**, each sub-key becomes a **row** (`question` = label, `answer` = value, `type: 'dynamic'`).
- If the value is a **primitive**, a single row is used for that key.
- Empty objects/arrays/values are skipped.

This keeps the UI in sync with whatever shape the backend returns, without hand-maintaining a field list.

### Legacy fallback

If the dynamic list is empty, the app falls back to a **hardcoded** mapping of known paths (e.g. `mainApplicant`, `allApplicants`, etc.) into the same `section` + `questions` shape. Prefer the dynamic path for new work so new fields appear automatically.

### Section shape (conceptual)

```text
{
  title: string,
  questions: { question: string, answer: unknown, type?: 'array' | 'dynamic' }[]
}
```

`QuestionAnswer` and `DynamicValue` / `DynamicObject` turn nested objects and arrays into a readable grid (label column + value column, with recursion for deep structures).

---

## 2. How expandables work

### Component stack

- **Radix UI** `Collapsible` (`@radix-ui/react-collapsible`) wrapped in `components/ui/collapsible.jsx`.
- Each section is a **`SectionCard`**: a card with a header row (`CollapsibleTrigger`) and body (`CollapsibleContent`).

### Controlled open state

Per section, **open/closed** is **fully controlled** from React state:

- `open={expanded}` on `Collapsible`
- `onOpenChange={onToggle}` — in this app, `onToggle` is `() => toggleSection(index)`; toggling re-runs when the user clicks the header (Radix will call `onOpenChange` with a boolean, but the handler can ignore it and only flip the index in a `Set`).

### “Expand all” / “Collapse all”

Global state is separate on purpose:

- `expandedSections`: a **`Set<number>`** of section indices that are open.
- `expandAll`: a **boolean** used only to drive the label on the bar (“Expand All” vs “Collapse All”).

`handleExpandAll` either clears the set and sets `expandAll` to false, or fills the set with every index and sets `expandAll` to true. Individual toggles use `toggleSection` to add/remove a single index.

**When porting:** keep the same idea — either one global “all expanded” boolean plus per-id toggles, or a single `Set` of open ids. Avoid mixing uncontrolled `Collapsible` and “expand all” without syncing state, or the UI will get out of sync.

### Visual behavior (this app’s dark theme)

- **Expanded:** header shows “**Hide Details**” (and a blue-tinted header background); chevron rotates.
- **Collapsed:** header shows the **section title** and an **“N items”** chip when there are questions.

### Search interaction

- A single **`searchQuery`** string filters **questions** inside each section (match on question text or stringified answers; array answers check any element).
- If a query is set and a section has **no matching questions**, the whole **section is not rendered** (`return null`).

**Print/PDF note:** If you hide sections with CSS when printing, consider **expanding all** before print so nothing is missing (see below).

---

## 3. Print and Download PDF in this project

### Current behavior

In `app/page.js` (and similarly in `app/[matterId]/page.js`):

- **Print** calls **`window.print()`** — the browser’s native print dialog (user can print to a physical printer or “Save as PDF” from the system dialog on most platforms).
- **Download PDF** is implemented the **same way** today: **`window.print()`** again, with an inline comment that a future option could be **jsPDF** or **server-side PDF** generation.

There is **no** dedicated `@media print` block in `app/globals.css` yet, so the printed page largely mirrors the on-screen **dark** layout. For production-quality PDFs, you typically add print styles (next section).

### How to implement print well (recommended for any similar app)

1. **Add print CSS** in your global CSS (or a `print.css`):
   - `@media print { ... }` set **background to white**, **text to near-black**, optional **force expanded content** (e.g. `display: block !important` on collapsible bodies) so hidden accordions still print.
2. **Hide non-content chrome** in print:
   - Add a class such as `no-print` to the top bar (Expand/Collapse, Print, Download, search) and use `@media print { .no-print { display: none !important; } }`.
3. **Optional: expand all before `window.print()`**  
   In the print handler, call your “expand all” function, then `requestAnimationFrame` (or a short `setTimeout`) and then `window.print()` so the DOM is fully open when the print snapshot runs.

### How to implement a real “Download PDF” button

| Approach | When to use |
| -------- | ------------ |
| **Print dialog → Save as PDF** (current) | Fastest, no extra dependencies; good enough for internal review. |
| **Client: html2canvas + jsPDF (or `jspdf` + `html2canvas`)** | Need a one-click file download without the print dialog; quality varies with complex CSS. |
| **Client: `@react-pdf/renderer` or `pdfkit`-style** | You rebuild the layout in PDF primitives; most reliable visual control, more work. |
| **Server: headless Chrome (Puppeteer/Playwright) or a PDF service** | Best for consistent branding, pagination, and server-stored records; point at a print-optimized URL or render HTML to PDF. |

**Tip:** For duplicate buttons (“Print” vs “Download PDF”), you can keep **Print = `window.print()`** and **Download =** either the same, or a function that **triggers a hidden print stylesheet** and then `window.print()`, or a **dedicated client/server PDF** path as above.

---

## 4. Checklist: implementing the same pattern in another app

1. **Normalize** your domain data into `{ title, questions[] }` (or an array of “blocks” with stable ids for state keys).
2. **Use one** expandable primitive (Radix `Collapsible`, MUI `Accordion` with `expanded` + `onChange`, Headless UI Disclosure, etc.).
3. **Store** which sections are open (`Set` of indices or string ids) + **one** “expand/collapse all” action that updates that set in bulk.
4. **Wire** the trigger header: title when collapsed, “Hide details” (or the section title always + chevron) when expanded, matching your design.
5. **Add** a search box that **filters** rows; decide whether to hide **whole sections** with no matches (like this app) or show “no results” inside the section.
6. **For print/PDF:** add `@media print` styles, `no-print` for controls, and optionally **expand all** on print. Upgrade “Download PDF” to a true file download when product requirements need it.
7. **Test** print preview on **Chrome, Edge, and Safari** — print CSS differs slightly between engines.

---

## 5. Related files in this repository

| Area | File |
| ---- | ---- |
| Main review UI (dark theme, `matter_id` query) | `app/page.js` |
| Alternate review route (light `Card` UI) | `app/[matterId]/page.js` |
| Collapsible wrapper | `components/ui/collapsible.jsx` |
| Global styles (no print rules yet) | `app/globals.css` |

This should be enough to replicate the **expandable questionnaire review**, **search**, and **print/PDF** behavior in another stack while knowing exactly what this application does today and what to add for a polished print experience.
