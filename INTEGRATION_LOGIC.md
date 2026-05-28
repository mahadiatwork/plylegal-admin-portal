# Integration Logic Overview

This document explains the architecture and underlying logic of how the Validify Pro Admin Portal integrates with **Zoho CRM** and **Google Firebase Firestore**, and how the application queries information from both systems.

## 1. Firebase Firestore Integration

The application interacts with Firebase primarily on the backend using the **Firebase Admin SDK**. This ensures privileged, server-side access to all documents without relying on client-side security rules or passing sensitive API keys to the browser.

### Initialization & Authentication
The logic is placed in `src/lib/firebase-admin.js`. 
- **Method 1:** The app sequentially checks for a base64 encoded service account string under `FIREBASE_SERVICE_ACCOUNT_BASE64` which is highly robust for CI/CD environments like Vercel.
- **Method 2:** It attempts to parse `FIREBASE_SERVICE_ACCOUNT_KEY` raw string.
- **Method 3:** It falls back to looking for physical files such as `service.json` or `service-account.json` at the root of the project, or via `GOOGLE_APPLICATION_CREDENTIALS` / `FIREBASE_SERVICE_ACCOUNT_PATH`.
- Once initialized, it exposes the Firestore standard instances (`db`) globally across route handlers.

### Data Structure & Retrieval
Matter information is retrieved from Firestore using API routes (e.g. `src/app/api/matter/[matterId]/route.js`). 
The core data is nested within multiple documents and subcollections:
- **`applications` collection:** Represents the core application/matter document.
- **`data` subcollection:** Contains modular chunks of application data, mostly specifically `questionnaire` and `completion`.
- **`reviewComments` subcollection:** Lives beneath the application document, storing timestamps, fields, and paths for any admin-level reviews.

## 2. Zoho CRM Integration

The application interfaces directly with Zoho CRM via the Zoho CRM API v7 endpoints using a custom wrapper (`src/lib/zohoClient.js`).

### Authentication Strategy
Zoho tokens are ephemeral (usually expiring after an hour). The app dynamically requests short-lived access tokens without storing sensitive OAuth refresh credentials in the codebase:
- Calls are made to a middleware token URL defined via `ACCESSTOKEN_URL` or `ZOHO_ACCESS_TOKEN_URL`. This is usually a Zoho Function or a backend that returns a valid access token securely.
- The returned token can be delivered in varying JSON formats (using `details.output`, raw strings, etc.) to encompass different types of endpoint configurations.
- The token is cached in-memory inside the `ZohoCRMClient` instance for 50 minutes to optimize repeated requests without hitting rate limits.
- Valid requests add the `Authorization: Zoho-oauthtoken <TOKEN>` header.
- The CRM region is dynamically chosen using `ZOHO_DATACENTER` with `com.au` as the default fallback.

## 3. How the Pieces Connect (The Linking Logic)

The primary linkage between a Firestore application and a Zoho CRM Matter (which maps to a Deal) relies on the `matterId` parameter. 

When you ping `GET /api/matter/[matterId]`:
1. **Fallback ID Resolution:** The system performs a reverse lookup in Firestore (`src/app/api/matter/[matterId]/route.js`). It searches the `applications` collection for a document where `zohoId == [matterId]`. 
2. If it finds a match, it uses that document's unique Firebase ID.
3. If it does not find a match, it assumes the param *is* the Firebase Document ID and attempts a direct `appsRef.doc(matterId).get()` lookup.

This resilient approach allows the Next.js portal to function seamlessly whether referring to an internal Firebase UUID or an external Zoho CRM `Deal ID`.

For fetching exact Client info/Documents natively stored in Zoho CRM endpoints, the platform can utilize `zohoClient.getRecord('Deals', dealId)` alongside the Firestore questionnaire payload to give a 360-degree view of the matter completion status simultaneously.

## 4. API Endpoints and Thorough Implementation Details

The Next.js App Router exposes API routes to interact with the backend services seamlessly. These API routes abstract away the direct database/CRM connections from the frontend, enabling secure, server-side data manipulation and retrieval.

### Core Endpoints

#### `GET /api/matter/[matterId]`
This is the primary endpoint for resolving an application and fetching its comprehensive state.

**Logic & Flow:**
1. **Parameter Resolution**: Awaits and extracts `matterId` from the request parameters (compatible with Next.js 15+ async params).
2. **Database Initialization Check**: Verifies that the `db` (Firebase Admin SDK instance) is correctly initialized. Returns a `500` status with error details if not.
3. **Smart ID Lookup**: First, performs a query on the `applications` collection looking for a document where `zohoId == matterId`.
   - If found, it maps `appId` to the resolved Firebase document ID.
   - If not found, it falls back to a direct fetch (`appsRef.doc(matterId).get()`), assuming the provided `matterId` is actually the Firebase Document ID.
   - Returns a `404` if the matter is not found via either method.
4. **Subcollection Data Fetching (Parallelization)**: Uses `Promise.all` to fetch the `questionnaire` and `completion` documents simultaneously from the application's `data` subcollection.
5. **Progress/Percentage Calculation**:
   - Analyzes the `visaTypeCode` (defaults to 'partner') and `visaContext`.
   - Uses a helper `getAllRoutes(visaTypeCode, visaContext, profiles)` to determine the total expected sections for this specific visa subclass.
   - Compares the total routes against the `true` entries in the `completion` mapping.
   - Calculates a rounded integer completion percentage, capped safely at 100%.
6. **Data Sanitization**: Converts Firebase-specific data types (like server Timestamp objects for `createdAt` and `updatedAt`) into ISO standard strings before serialization.
7. **Consolidated Response**: Returns a composite JSON object:
   ```json
   {
     "success": true,
     "application": { /* Core application metadata */ },
     "questionnaire": { /* nested answer data */ },
     "completion": { /* true/false section flags */ },
     "percentage": 100
   }
   ```

#### Review Comments Endpoints (Pending/Planned)
Based on the admin review requirement, endpoints designed to facilitate inline comments are also required:

*   **`GET /api/review-comments/[matterId]`**
    *   **Purpose**: Fetch all review comments for a specific matter.
    *   **Logic**: Query the `reviewComments` subcollection on the matched `application` document.
*   **`POST /api/review-comments/[matterId]`**
    *   **Purpose**: Add a new inline reviewer comment to a specific field.
    *   **Payload Expectation**: `{ fieldPath: string, commentText: string, reviewerId: string }`
    *   **Logic**: Insert a document into the `reviewComments` subcollection and potentially trigger a notification in the global `notifications` collection so it reflects in the client's applicant portal.
*   **`PATCH/DELETE /api/review-comments/[matterId]/[commentId]`**
    *   **Purpose**: Update or remove an existing comment (e.g., when an issue is resolved).

### Technical Choices & Best Practices Implemented
* **Error Handling**: Comprehensive `try/catch` wrapping for database queries with specific HTTP status codes (400, 404, 500) and actionable JSON error payloads.
* **Performance**: Concurrent fetching using `Promise.all` minimizes latency when reading multiple subcollections.
* **Loose Coupling**: The `getAllRoutes` helper provides a clean abstraction for visa logic away from the API routing layer itself, keeping the route handler lean.