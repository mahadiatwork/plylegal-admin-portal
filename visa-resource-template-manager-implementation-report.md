# Visa Resource Template Manager Implementation Report

Date: June 11, 2026
Project: `validify-pro-admin-portal`

## Summary

Implemented a visa-type resource template workflow inside the existing matter Resources screen. The Shared tab now lets admins select a visa type, organize resources by category, and publish files, notes, and links for Partner, Protection, Subclass 482, and Subclass 186 visa applications without using a separate template-management page.

Files are uploaded to the configured Zoho WorkDrive root folder for each visa type. Category assignment and note content are stored in Firestore so the client portal can fetch the matching `resourceTemplates/{visaSlug}/items` records based on the matter's visa type.

## Implemented Changes

### Resource Template Configuration

Added `src/lib/resourceTemplates.js` to centralize template definitions, validation, serialization, WorkDrive folder mapping, and upload helpers.

Configured visa templates:

| Visa slug | Template title | WorkDrive folder ID |
| --- | --- | --- |
| `partner` | Partner Visa | `hf3e6c83ab75e91074b409d245dff4c1dc630` |
| `protection` | Protection Visa | `hf3e62a84dfc392b9461dbb061e126f09e2c9` |
| `482` | Subclass 482 | `hf3e63bcec93d5faf412cb6fbcb3075f4f2e2` |
| `186` | Subclass 186 | `hf3e66da96e2822c344cfb9927deb2ab9f216` |

The helper supports environment-variable overrides for each WorkDrive folder ID while keeping the supplied IDs as defaults.

### Admin APIs

Added the following admin API routes:

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/resource-templates` | `GET` | Seed/upsert the four template docs and return template summaries. |
| `/api/resource-templates/[visaSlug]` | `GET`, `PATCH` | Fetch one template with sorted items, or update template title/status. |
| `/api/resource-templates/[visaSlug]/items` | `POST` | Create folder, file, note, or link items under a template. |
| `/api/resource-templates/[visaSlug]/items/[itemId]` | `PATCH`, `DELETE` | Edit item metadata or delete an item. Delete removes the WorkDrive resource first when present, then deletes the Firestore item. |

API behavior implemented:

- Does not require an admin access key or signed admin session cookie in this portal.
- Uses Next 16 route-handler conventions with `runtime = "nodejs"` and awaited dynamic `params`.
- Seeds missing `resourceTemplates/{visaSlug}` docs as `active`.
- Stores client-facing fields: `parentId`, `kind`, `name`, `category`, `order`, `status`, `externalUrl`, `workdriveId`, `mimeType`, and `size`.
- Stores note items with `kind: "note"` plus `noteText` and `content`.
- Stores admin metadata such as `fileName`, `workDriveFolderId`, `workDrivePublicLinkId`, timestamps, and actor fields.
- Validates that `parentId` points to a folder in the same template.
- Prevents folder move cycles.
- Uploads file items to the selected visa template root folder in WorkDrive, creates an external share link, and stores it as `externalUrl`.
- Deletes file items from Zoho WorkDrive and Firestore when the admin uses the delete action.

### Admin UI

Added `src/components/admin/AdminResourceTemplatesManager.jsx` as the reusable template dashboard and mounted it inside `src/app/matter/[matterId]/resources/page.js` when the Shared tab is selected.

The Shared tab now replaces the old flat shared-resource upload/list UI with the resource-management dashboard workflow:

- Header summary for total resources, active categories, and last updated metadata.
- Visa selector cards for All Resources, Partner Visa, Protection Visa, Subclass 482, and Subclass 186.
- Category sidebar with default categories: Uncategorized, Guides, Policies, and Helpful Links.
- New category creation with selectable category icons, persisted to template metadata.
- Category workspace with drag-and-drop multi-file upload.
- Create/edit form for file, note, and link items.
- Visa type selector so admins can publish to a specific visa template from the dashboard.
- Resource list with search, sort, name, uploaded date, type, an external-link icon, and a working delete action.
- The list no longer shows URL/detail descriptions or horizontal scrolling.
- After a successful file upload, the success alert shows a clickable external WorkDrive link saved from the Firebase `externalUrl`.
- Hidden resources remain visible to admins while staying available for client-side exclusion by `status: "hidden"`.

### Matter Resources Entry Point

Updated `src/app/matter/[matterId]/resources/page.js` so:

- The Shared tab renders the visa template dashboard directly.
- The old Shared upload form, Add new buttons, and shared resource list are no longer shown on this screen.
- The Individual tab keeps the existing matter-specific file, note, and link workflow.
- The page no longer links out to `/admin/resource-templates`.

### Admin Navigation

Updated the admin shell:

- `/admin` now redirects to `/admin/resources`.
- Admin access is open; `requireAdminSession` now returns an admin actor without redirecting to `/login`.
- Header navigation keeps the legacy shared-resource library available as `Legacy library`.
- The standalone `/admin/resource-templates` page was removed because template management now lives under the matter Resources Shared tab.

The existing `/admin/resources` page and `/api/resources` routes remain intact.

## Firestore Shape

Template documents are stored at:

```txt
resourceTemplates/{visaSlug}
```

Template item documents are stored at:

```txt
resourceTemplates/{visaSlug}/items/{itemId}
```

Item documents follow the planned client contract:

```txt
parentId: string | null
kind: "folder" | "file" | "link" | "note"
name: string
category: string
order: number
status: "active" | "hidden"
externalUrl: string | null
workdriveId: string | null
mimeType: string | null
size: number | null
```

Note items also store:

```txt
noteText: string
content: string
```

Template documents also store category metadata:

```txt
categories: Array<{ name: string, icon: string }>
```

## Verification

Completed verification:

- `npm run lint` passed.
- `npm run build` passed.
- Browser sanity check opened `/matter/102555000001354231/resources` and confirmed the Shared tab renders the embedded template dashboard.
- Authenticated API check confirmed the four templates were seeded as `active` with the expected WorkDrive folder IDs.

Known lint warnings remaining are pre-existing warnings outside this implementation:

- Existing `<img>` usage warnings in older pages.
- Existing anonymous default export warning in `src/lib/zohoClient.js`.

## Notes And Follow-Up

- No real WorkDrive file upload was performed during verification to avoid creating external test files.
- Firestore security rules are not tracked in this admin project and should be updated/deployed separately for client portal reads.
- The legacy shared-resource library is preserved for migration safety.
- WorkDrive subfolder creation and WorkDrive tree import were intentionally excluded from this v1 implementation.
