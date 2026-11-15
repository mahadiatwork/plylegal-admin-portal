# Task: Audit and speed up the admin portal's data fetching

## Context
This is the **admin portal** for a legal visa-application business. A separate **client portal** repo (Next.js 16 app router, Firebase Auth + Firestore, Zoho CRM) shares the same Firebase project and Zoho CRM as this repo. I just audited and fixed performance problems in the client portal. I want you to check whether this repo has the same problems and fix the ones it has.

**Start by investigating, not editing.** Report what you find in each area below with file and line references. Then implement fixes test-first, in small commits. Don't assume this repo has the same problems; confirm each one in the code before changing anything.

## Shared-backend constraints (important)
Both apps use the same Firestore and Zoho CRM, so a change here can break the client portal.
- **Do NOT change the Firestore data layout or field names.** The client portal reads and writes `applications/{id}`, `applications/{id}/data/questionnaire`, `applications/{id}/data/completion`, `applications/{id}/resources/*`, `users/{uid}` and `questionnaireDefinitions/*`. Treat these as a shared contract.
- **Do NOT deploy `firestore.rules` or change rules that the client portal depends on.** If this repo has its own copy of the rules, tell me and let me reconcile them. Never run `firebase deploy` without asking me.
- The client portal's rules now allow owner-only reads on applications. The old rule `allow read: if resource.data.publicReviewAccess == true` (with no auth check) was removed there because it exposed every application to unauthenticated users. Check whether this repo reads `applications` or `applications/*/data/*` through the client SDK without an admin user, or relies on the `publicReviewAccess` flag. If it does, it will break once those rules are deployed. Find out and report back.
- Admin access in the rules is `users/{uid}.role == "admin"`. Admin reads from the browser must be authenticated as such a user, or go through the Admin SDK on the server.

## What I found in the client portal (check each one here)

### 1. No request cache or deduplication
React Query was installed and configured but never used. Data lived in valtio stores that refetched on every page with no TTL, and the same list was loaded from many pages.
- Find every place this repo fetches lists or documents on page mount. Look for repeated `getDocs`, `getDoc`, `onSnapshot` and `fetch('/api/...')` calls for the same data.
- If React Query (or SWR) is present, check it's actually used, with sensible `staleTime` and stable query keys. If not, add a shared cache layer. Prefer routing existing store loaders through it rather than editing every page.
- Clear caches on logout.

### 2. Sequential awaits that could run in parallel                                                                                             `loadDraft` did three independent Firestore reads one after aawait b(); await c();` chains of independent reads, and `for(...) { await ... }` loops that read or write documents one at a time. Use `Promise.all`, or batch the reads with `getAll`, `writeBatch` or `bul
### 3. Read-before-write and whole-document writes                                                                                              `saveDraft` read the document, merged it in JS, then wrote th`setDoc(..., {merge:true})` already merges on the server. Lookfor `getDoc` followed by `setDoc` or `updateDoc` on the same ref. Remove the read when a server-side merge or a field-level `updateDoc` is enougsend only changed fields. Watch for large single documents thery applicant in one `profiles` array). Firestore documents are capped at 1 MB and every write sends the full array. Report any like this, but **don't restructure the data** without asking me.                
### 4. Blocking on slow external work (Zoho CRM)                                                                                                The client's applications page waited for a full Zoho-to-Fireore showing anything. Check how this repo calls Zoho:
- Does any list or detail page block on a Zoho round trip before rendering? Show what's already in Firestore first and refresh from Zoho in the background.
- Is the Zoho OAuth token cached? In the client portal it was cached only in memory per server instance, so on serverless hosts it was often refetched. Check where the token comes from (a token URL or Zoho Functioest, add a cache with a safe TTL and a retry-once on a 401.Also check whether the token endpoint is rate-limited and whether concurrent requests can stampede it. Share one in-flight promise.
- Are CRM records fetched one by one (N+1)? Use COQL or batchlated-records endpoint. Respect Zoho's API credit limits.
- Is there a throttle so the same sync can't run repeatedly (for example, once per N minutes per user or record)? Is the sync idempotent? Does it write
unchanged records? Skip those writes by comparing fields.
- Does a sync reload the same collection several times between steps? Load once and derive the plan in memory.

### 5. Duplicate in-flight requests from effects
Layouts and pages both triggered the same load in `useEffect`ook for the same fetch initiated in a parent and a child.Dedupe in the data layer (share one in-flight promise per key) rather than editing every page.

### 6. Realtime listeners
Check every `onSnapshot`: is it unsubscribed on unmount, scopth `limit()`? Does listening to a whole collection (for example all applications or all messages) make sense, or should it be a paginated query? Count active listeners on the main dashboard.

### 7. Missing pagination and indexes
Admin lists tend to load everything. Look for `getDocs(collecr cursor, client-side filtering or sorting of large resultsets, and queries that need composite indexes (check `firestore.indexes.json`). Add server-side filters, `limit` and cursor pagination where lists can
grow.

### 8. Bundle and client-side weight
- Is any server-only or heavy code in the client bundle (the Zoho client, axios, firebase-admin, PDF libs, the whole `firebase/firestore` for pages that
don't need it)? Run `next build` and look at the route sizes.eavy, rarely-used pieces.
- Look for dead code paths left over from earlier architectures (alternative database adapters, duplicated sync logic in the browser and on the server).

### 9. Auth and guard waterfalls
In the client portal, nothing rendered until `onAuthStateChanstore profile read finished, and only then did page data startloading. Check this repo's admin guard. Can the page data fetch start in parallel with the role check? Can the role come from a custom claim on the ID
token instead of a Firestore read on every load? (Report this coordinated change with the client portal.)

### 10. Server routes
For each API route: is auth verification doing an extra Firestore read per request (for example loading the user profile just to read the role)? Is anything cached that safely could be? Are Firestore REST or Are they could be parallel? Are internal error messages returned to the client? (They shouldn't be.)

## How to work
1. **Investigate first.** Produce a short findings report: foent / not present / n/a", with file:line evidence and anestimated impact. Rank the confirmed problems by user-visible impact. Stop and show me this before editing.
2. **Fix test-first.** For each approved fix, extract the loghere possible (no Firebase, valtio or React imports) and writethe failing test first. Run it and show that it fails, then write the code, then show it passing. Use the repo's existing test runner. Where logic is
tangled with Firebase and can't be unit-tested, say so and ke
3. **Small commits**, one theme each, with messages explaining the why. Do not mix in unrelated uncommitted changes that are already in the working tree
(check `git status` and `git diff --stat` first and commit ont add -A`.
4. **Verify**: run the full test suite and a production build (`next build`, with a separate `NEXT_DIST_DIR` if a dev server is running) before each
commit.
5. **Be honest about gaps**: tell me what you couldn't verify without live Firebase or Zoho, and what needs a staging check.
6. Preserve existing behaviour. This is a performance pass, n would change what users see or what is written to Firestore,flag it.

## Out of scope unless I say otherwise
- Restructuring Firestore collections or splitting documents
- Deploying rules, functions or hosting.
- Changing custom claims or the auth model.
- Upgrading major dependencies.