# Zoho Matter Data Guide

This guide explains how this portal uses `ZOHO_ACCESS_TOKEN_URL` to fetch Zoho CRM data for a matter, including related documents and client messages.

## Environment Setup

Add the token endpoint to your server-side environment:

```env
ZOHO_ACCESS_TOKEN_URL=https://your-token-endpoint.example.com
ZOHO_DATACENTER=com.au
```

`ZOHO_DATACENTER` is optional. If it is not set, the app defaults to `com.au`.

The code also supports `ACCESSTOKEN_URL`. If both variables are present, `ACCESSTOKEN_URL` is used first:

```js
const tokenUrl = process.env.ACCESSTOKEN_URL || process.env.ZOHO_ACCESS_TOKEN_URL;
```

Do not expose the token URL in browser code. It should only be read from server routes or server-side libraries.

## Token Endpoint Contract

`ZOHO_ACCESS_TOKEN_URL` should point to an endpoint, usually a Zoho Function or secure backend endpoint, that returns a valid Zoho OAuth access token.

The portal accepts any of these response shapes:

```json
{
  "access_token": "1000.example-access-token"
}
```

```json
{
  "details": {
    "output": "1000.example-access-token"
  }
}
```

```json
{
  "output": "1000.example-access-token"
}
```

```txt
1000.example-access-token
```

If the token includes the `Zoho-oauthtoken` prefix, the client strips it before storing it. The prefix is added back when calling Zoho:

```http
Authorization: Zoho-oauthtoken 1000.example-access-token
```

## Verify Token Access

Use the built-in test route to confirm the token endpoint is configured and the returned token can call Zoho CRM:

```bash
curl http://localhost:3000/api/test/zoho-verify-token
```

Expected success response:

```json
{
  "success": true,
  "tokenFetched": true,
  "tokenValid": true,
  "datacenter": "com.au"
}
```

## Fetch Matter Data

In this project, a matter is represented by a Zoho CRM `Deals` record. The matter ID used by portal routes is the Zoho Deal ID.

The Zoho base URL is built from `ZOHO_DATACENTER`:

```txt
https://www.zohoapis.{ZOHO_DATACENTER}/crm/v7
```

To fetch a matter directly from Zoho:

```http
GET /crm/v7/Deals/{dealId}
Authorization: Zoho-oauthtoken {accessToken}
```

In app code, use:

```js
const zohoClient = new ZohoCRMClient();
const matter = await zohoClient.getRecord('Deals', dealId);
```

The portal also has this route for fetching Deal document JSON fields:

```bash
curl http://localhost:3000/api/deals/{dealId}
```

## Fetch Related Documents

Matter documents are stored in the `Matter_Documents` related list under the `Deals` module.

Direct Zoho CRM call:

```http
GET /crm/v7/Deals/{dealId}/Matter_Documents?fields=id,Matter_Document_Name,Document_Name,Name,Document_Status,Created_Time,File_Name,File_Size,Modified_Time,Owner,Parent_Id,document_Serial,Comments,Rejection_Comments,Decline_Reason
Authorization: Zoho-oauthtoken {accessToken}
```

In app code:

```js
const documents = await zohoClient.getRelatedRecords(
  'Deals',
  dealId,
  'Matter_Documents',
  'id,Matter_Document_Name,Document_Name,Name,Document_Status,Created_Time,File_Name,File_Size,Modified_Time,Owner,Parent_Id,document_Serial,Comments,Rejection_Comments,Decline_Reason'
);
```

Built-in portal route:

```bash
curl "http://localhost:3000/api/uploads/matter-documents?dealId={dealId}"
```

The route returns:

```json
{
  "success": true,
  "documents": []
}
```

Documents are sorted by `document_Serial` when available.

## Upload a Matter Document

The upload route finds or creates a `Matter_Documents` record, then uploads the file as a Zoho CRM attachment to that `Matter_Documents` record.

```bash
curl -X POST http://localhost:3000/api/uploads/zoho \
  -F "dealId={dealId}" \
  -F "documentName=Passport" \
  -F "file=@passport.pdf"
```

The route validates file type and size, uploads using the Zoho CRM v8 attachment endpoint, and updates `Document_Status` to `Awaiting Approval`.

Direct attachment endpoint used internally:

```http
POST /crm/v8/Matter_Documents/{matterDocumentId}/Attachments
Authorization: Zoho-oauthtoken {accessToken}
Content-Type: multipart/form-data
```

## Add or Update a Document Comment

Use this route to update the `Comments` field on a `Matter_Documents` record:

```bash
curl -X POST http://localhost:3000/api/uploads/matter-documents/comment \
  -H "Content-Type: application/json" \
  -d "{\"documentId\":\"{matterDocumentId}\",\"comment\":\"Please upload a clearer copy.\"}"
```

## Fetch Related Messages

Client messages are stored in the `Client_Messages` related list under the `Deals` module.

Direct Zoho CRM call:

```http
GET /crm/v7/Deals/{dealId}/Client_Messages?fields=id,Name,Message_from_Client,Reply_Message,Time_Sent,Time_Replied,Created_Time,Modified_Time
Authorization: Zoho-oauthtoken {accessToken}
```

In app code:

```js
const messages = await zohoClient.getRelatedRecords(
  'Deals',
  dealId,
  'Client_Messages',
  'id,Name,Message_from_Client,Reply_Message,Time_Sent,Time_Replied,Created_Time,Modified_Time'
);
```

Built-in portal route:

```bash
curl "http://localhost:3000/api/messages/fetch?dealId={dealId}"
```

The route returns messages sorted oldest first by `Time_Sent`, falling back to `Created_Time`.

## Create a Message

Use the message creation route to add a portal message to Zoho CRM:

```bash
curl -X POST http://localhost:3000/api/messages/create \
  -F "dealId={dealId}" \
  -F "message=Hello, I have uploaded the requested document." \
  -F "attachments=@supporting-file.pdf"
```

The route:

1. Fetches the Deal to get the matter name.
2. Creates a `Client_Messages` record.
3. Links it to the matter with `Matter: { id: dealId }`.
4. Uploads any provided files as attachments on the new `Client_Messages` record.

Message fields created:

```json
{
  "Name": "{matterName} - {dateTime}",
  "Matter": {
    "id": "{dealId}"
  },
  "Message_from_Client": "Message text",
  "Time_Sent": "2026-04-28T00:00:00.000Z",
  "Reply_Message": "",
  "Time_Replied": null
}
```

## Upload an Attachment to an Existing Message

```bash
curl -X POST "http://localhost:3000/api/messages/upload-attachment?messageId={messageId}" \
  -F "file=@supporting-file.pdf"
```

The route uploads the file to:

```http
POST /crm/v8/Client_Messages/{messageId}/Attachments
Authorization: Zoho-oauthtoken {accessToken}
Content-Type: multipart/form-data
```

## Troubleshooting

- `ZOHO_ACCESS_TOKEN_URL` must be available to the server process. Restart the dev server after changing `.env` values.
- If `/api/test/zoho-verify-token` says the token is invalid, confirm the token endpoint returns a fresh OAuth access token for the correct Zoho datacenter.
- If related documents or messages return an empty array, confirm the Deal ID is correct and that the related list API names are `Matter_Documents` and `Client_Messages`.
- If file uploads fail, confirm the token has attachment permissions and the file is under the route limit of 5 MB for matter document uploads.
- If Zoho returns `INVALID_MODULE`, check the module or related list API name in Zoho CRM setup.
