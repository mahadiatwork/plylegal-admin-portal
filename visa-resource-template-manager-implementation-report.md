# Visa Resource Template Manager Implementation Report

Date: June 11, 2026
Project: `validify-pro-admin-portal`

## Summary

Implemented a dedicated admin workflow for visa-type resource templates. The new feature lets admins manage live resource template trees for Partner, Protection, Subclass 482, and Subclass 186 visa applications without changing the existing legacy shared-resource library.

Files are uploaded to the configured Zoho WorkDrive root folder for each visa type. Folder nesting is represented in Firestore only, using `folder` item records in each template's `items` subcollection. Notes are stored directly in Firestore as `note` items.

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

Added the following admin-protected API routes:

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/resource-templates` | `GET` | Seed/upsert the four template docs and return template summaries. |
| `/api/resource-templates/[visaSlug]` | `GET`, `PATCH` | Fetch one template with sorted items, or update template title/status. |
| `/api/resource-templates/[visaSlug]/items` | `POST` | Create folder, file, note, or link items under a template. |
| `/api/resource-templates/[visaSlug]/items/[itemId]` | `PATCH` | Edit item metadata, move items, reorder items, update link URL, or hide/show items. |

API behavior implemented:

- Does not require an admin access key or signed admin session cookie in this portal.
- Uses Next 16 route-handler conventions with `runtime = "nodejs"` and awaited dynamic `params`.
- Seeds missing `resourceTemplates/{visaSlug}` docs as `active`.
- Stores client-facing fields: `parentId`, `kind`, `name`, `order`, `status`, `externalUrl`, `workdriveId`, `mimeType`, and `size`.
- Stores note items with `kind: "note"` plus `noteText` and `content`.
- Stores admin metadata such as `fileName`, `workDriveFolderId`, `workDrivePublicLinkId`, timestamps, and actor fields.
- Validates that `parentId` points to a folder in the same template.
- Prevents folder move cycles.
- Uploads file items to the selected visa template root folder in WorkDrive, creates an external share link, and stores it as `externalUrl`.
- Hides items by setting `status: "hidden"` rather than deleting WorkDrive files.

### Admin UI

Added `src/components/admin/AdminResourceTemplatesManager.jsx` and the page route `src/app/admin/resource-templates/page.js`.

The new UI includes:

- Visa template tabs for Partner, Protection, Subclass 482, and Subclass 186.
- Template status control for `active`, `draft`, and `archived`.
- Tree view of nested folders, files, and links.
- Create/edit form for folder, file, note, and link items.
- Parent folder selector for nesting.
- Numeric ordering field.
- Hide/show actions for each item.
- External open action for files and links.
- Admin-visible counts for folders, files, notes, links, hidden items, and visible items.

### Matter Resources Entry Point

Updated `src/app/matter/[matterId]/resources/page.js` to include a visible `Visa templates` action in the Resources header. This connects the existing per-matter Resources workflow to the new visa-template manager, where admins select the visa type and publish reusable template resources.

### Admin Navigation

Updated the admin shell:

- `/admin` now redirects to `/admin/resource-templates`.
- Admin access is open; `requireAdminSession` now returns an admin actor without redirecting to `/login`.
- Header navigation now links to:
  - `Visa templates`
  - `Legacy library`

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

## Verification

Completed verification:

- `npm run lint` passed.
- `npm run build` passed.
- Browser sanity check opened `/admin/resource-templates`.
- Authenticated API check confirmed the four templates were seeded as `active` with the expected WorkDrive folder IDs.

Known lint warnings remaining are pre-existing warnings outside this implementation:

- Existing `<img>` usage warnings in older pages.
- Existing anonymous default export warning in `src/lib/zohoClient.js`.

## Notes And Follow-Up

- No real WorkDrive file upload was performed during verification to avoid creating external test files.
- Firestore security rules are not tracked in this admin project and should be updated/deployed separately for client portal reads.
- The legacy shared-resource library is preserved for migration safety.
- WorkDrive subfolder creation and WorkDrive tree import were intentionally excluded from this v1 implementation.
