# Admin access, staff roles, and questionnaire editing

The portal requires sign-in before opening the dashboard or a matter. All admin APIs independently verify the signed admin session. Sessions last 12 hours and use an HttpOnly, SameSite=Lax cookie (Secure in production). Signing out clears the cookie.

There are three portal roles:

- **Super admin** can use all existing portal tools, manage portal users, and open the questionnaire builder.
- **Admin** can use matter and resource workflows, but cannot see or call the questionnaire builder.
- **Sales / support** can use matter and resource workflows, but cannot see or call the questionnaire builder.

All staff accounts are stored in Firebase Authentication. Their portal role and temporary-password state are Firebase custom claims; no names, emails, roles, or passwords are stored in Vercel environment variables. Super admins can add staff from **Settings**, assign one of the three roles, and reset a temporary password. New and reset passwords must be changed by that user before the rest of the portal becomes available.

## Create the first super admin

Create the first user in Firebase Console → Authentication with their real name, email, and password. Then grant that Firebase user the initial super-admin claim once:

```text
npm run admin:grant-super -- user@example.com
```

After that user signs in, all additional staff accounts and password resets are managed from the portal’s **Settings** page.

## Deployment settings

Keep the session-signing secret and the existing Firebase configuration in the hosting project:

```text
SESSION_SECRET=<a private random value of at least 32 bytes>
NEXT_PUBLIC_FIREBASE_API_KEY=<Firebase web API key>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<Firebase project ID>
FIREBASE_SERVICE_ACCOUNT_KEY=<Firebase Admin service account JSON>
```

Keep the existing private `SESSION_SECRET` if already configured; rotating it invalidates active browser sessions. It signs short-lived portal session cookies but contains no user account data. Staff passwords are stored and verified by Firebase Authentication; the portal never stores them in Firestore or environment variables.

Wrong credentials receive a generic error. Login has a bounded per-instance throttle (eight attempts per 15 minutes); distributed production rate limits should be configured at the hosting layer if needed. Missing Firebase configuration or a missing signing secret fails closed, and a setup message appears when attempting login.

## Where to work

- Dashboard → **Questionnaires** (`/admin/questionnaires`): choose a saved questionnaire or starter, edit questions and answer options, save a draft, and publish.
- Top-right account menu → **Settings** (`/admin/settings`): view the signed-in account, change a Firebase-backed password, and—for super admins—add users or reset temporary passwords.
- The **482 Character** starter includes the existing 18 character questions and conditional follow-ups. It opens as an unsaved draft. Existing built-in sections without a saved template are not automatically imported; new templates can target registered questionnaire pages.
- Editing a published questionnaire creates a separate draft. The published version stays available until the draft is published.
- Dashboard → **Resource Centre** (`/admin/resources`): reusable resources and folders. The older shared library is retained at `/admin/resources/legacy`.
- **Open a matter** → **Client answers** shows submitted answers; **Resources** includes the matter-specific resources.

Questionnaire/resource records and portal user management require functioning Firebase Admin credentials. A successful login does not repair a revoked service-account key. The client portal also has a published-definition fallback endpoint for deployments where direct questionnaire Firestore reads are denied; deploy that client change together with the admin changes and ensure its Firebase server credential is valid.
