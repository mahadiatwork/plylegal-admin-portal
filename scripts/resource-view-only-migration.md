# Restrict existing Resource Center uploads

New uploads receive view-only WorkDrive links. Existing uploads need their existing share links restricted as well; creating another link would leave the old downloadable link usable.

Run from the admin portal project root using Node.js 22.12 or newer and the same Firebase service-account and WorkDrive environment configuration as the application. Environment files load through `@next/env`, and Firebase initialization uses `src/lib/firebase-admin.js`.

```powershell
node scripts/migrate-resource-view-only.mjs
```

The default is a dry run: it reads Firestore, reports document paths and counts, and makes no WorkDrive calls or writes. Review any `BLOCKED` records. This inventory cannot verify the current remote share permissions. Run the changes explicitly with:

```powershell
node scripts/migrate-resource-view-only.mjs --apply
```

The migration visits `resourceTemplates/{visaSlug}/items` where `kind == "file"`, top-level `resources` where `type == "file"`, and file records in `applications/{appId}/resources`. It includes hidden and archived Resource Centre files but excludes matter files whose source is `documentReview`, along with links, notes, folders, categories, and document corrections.

For each file it identifies existing share IDs from stored link IDs and every WorkDrive `/external/{id}` URL alias, including nested raw response fields. It restricts **every identified existing link** with `allow_download: false`, requires verified viewer URLs from WorkDrive, and only then saves `downloadAllowed: false`. Template items retain `externalUrl`; shared and matter resources retain `publicUrl` and `url`. It removes previous URL/download/permalink/raw response aliases and preserves other file metadata.

Files without an identifiable existing share link, malformed aliases and links from unsupported providers are reported as blocked. A raw WorkDrive file/permalink URL alone is insufficient. Resolve these records in WorkDrive by finding and disabling every old external share, then provide the appropriate existing share ID/URL before rerunning. The script never creates a replacement share or treats an upload/download URL as a viewer fallback.

Record updates use Firestore update-time preconditions. If an editor changes a record during the run, the migration cannot overwrite that edit. A failure after one provider link has been restricted leaves that provider change in place and leaves the Firestore record unchanged; rerunning safely retries the remaining work. Repeated apply runs reassert remote restrictions without rewriting documents already in the desired shape. Exit code `1` means at least one blocked/failed record or an initialization failure; inspect the summary before considering migration complete. Provider responses, tokens and signed URLs are suppressed from console output.

This can restrict only share links identifiable from stored records. Separately created WorkDrive shares and raw signed URLs already copied outside the portal require review or revocation in WorkDrive; removing an alias from Firestore does not revoke a previously issued raw URL. After migration, verify a representative PDF and DOCX in the client portal and the old external-share download links using a signed-out browser. WorkDrive preview availability depends on its support for each format.

The focused offline checks do not load credentials or call either service:

```powershell
node --test scripts/resource-view-only-plan.test.mjs
node scripts/migrate-resource-view-only.mjs --help
```
