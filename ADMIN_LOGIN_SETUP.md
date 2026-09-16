# Admin access and questionnaire editing

The portal now requires sign-in before opening the dashboard or a matter. All admin APIs independently verify the signed admin session. Sessions last 12 hours and use an HttpOnly, SameSite=Lax cookie (Secure in production). Signing out clears the cookie.

## Local demo

The ignored `.env.local` is configured for this workspace with username `demo.admin` and password `PlyLegalDemo!2026`. Run `npm run dev`, then open `http://localhost:3000`. These demo credentials are not a built-in production fallback and are not displayed on the public login page.

## Deployment settings

Set these server-only environment variables in the admin hosting project, then redeploy:

```text
PORTAL_ADMIN_USERNAME=demo.admin
PORTAL_ADMIN_PASSWORD=PlyLegalDemo!2026
SESSION_SECRET=<a private random value of at least 32 bytes>
```

Use a private password before sharing access beyond the agreed demo. Keep an existing private `SESSION_SECRET` if already configured; rotating it invalidates sessions. Never prefix these variables with `NEXT_PUBLIC_`. For existing deployments, `PORTAL_ADMIN_KEY` remains a password fallback and the username defaults to `admin` when no new username is configured. The login endpoint requires both username and password; key-only login is retired.

Wrong credentials receive a generic error. Login has a bounded per-instance throttle (eight attempts per 15 minutes); distributed production rate limits should be configured at the hosting layer if needed. Missing credentials or signing secret fail closed, and a setup message appears when attempting login.

## Where to work

- Dashboard → **Questionnaires** (`/admin/questionnaires`): choose a saved questionnaire or starter, edit questions and answer options, save a draft, and publish.
- The **482 Character** starter includes the existing 18 character questions and conditional follow-ups. It opens as an unsaved draft. Existing built-in sections without a saved template are not automatically imported; new templates can target registered questionnaire pages.
- Editing a published questionnaire creates a separate draft. The published version stays available until the draft is published.
- Dashboard → **Resource Centre** (`/admin/resources`): reusable resources and folders. The older shared library is retained at `/admin/resources/legacy`.
- **Open a matter** → **Client answers** shows submitted answers; **Resources** includes the matter-specific resources.

Questionnaire/resource records still require functioning Firebase Admin credentials. Authentication itself does not require Firebase. A successful login does not repair a revoked service-account key. The client portal also has a published-definition fallback endpoint for deployments where direct questionnaire Firestore reads are denied; deploy that client change together with the admin changes and ensure its Firebase server credential is valid.
