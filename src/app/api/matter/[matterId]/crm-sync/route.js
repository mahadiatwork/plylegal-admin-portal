import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { isSameOriginRequest } from "@/lib/adminLoginProtection";
import { db, initResult } from "@/lib/firebase-admin";
import { resolveMatterApplication } from "@/lib/matterResolver";
import { inferQuestionnaireAudience, loadQuestionnaireReviewDefinition } from "@/lib/questionnaireReviewDefinitions";
import { getBuiltInQuestionnaireDefinition } from "@/lib/questionnaireBuiltIns";
import { buildAdminCrmProjection } from "@/lib/questionnaireCrmProjection";
import { ZohoCRMClient } from "@/lib/zohoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request, { params }) {
  if (!(await getAdminSession())) return json({ success: false, error: "Admin session is required" }, 401);
  if (!isSameOriginRequest(request)) return json({ success: false, error: "Request origin is not allowed" }, 403);

  const { matterId } = await params;
  const body = await request.json().catch(() => ({}));
  const mode = body?.mode === "full" ? "full" : "preview";
  if (!db) return json({ success: false, error: "Database not initialized", details: initResult?.error }, 500);

  const resolved = await resolveMatterApplication(db, matterId);
  if (!resolved) return json({ success: false, error: "Matter not found" }, 404);

  const application = { id: resolved.appId, ...resolved.appDoc.data() };
  const questionnaireSnap = await db.collection("applications").doc(resolved.appId).collection("data").doc("questionnaire").get();
  const draft = questionnaireSnap.exists ? questionnaireSnap.data() : {};
  const audience = inferQuestionnaireAudience(application, draft);
  const builtIn = getBuiltInQuestionnaireDefinition(audience);
  const loaded = await loadQuestionnaireReviewDefinition(db, audience, builtIn);
  const definition = loaded?.definition;
  if (!definition) return json({ success: false, error: "Questionnaire definition was not found" }, 409);

  let userProfile = {};
  if (application.userId) {
    const userSnap = await db.collection("users").doc(application.userId).get();
    userProfile = userSnap.exists ? userSnap.data() : {};
  }

  const projection = buildAdminCrmProjection({ definition, draft, application, userProfile });
  const publicChanges = projection.changes.map(({ writeValue, ...change }) => change);
  if (mode === "preview") {
    return json({ success: true, preview: true, changes: publicChanges });
  }

  const enabled = ["true", "1"].includes(String(process.env.CRM_QUESTIONNAIRE_SYNC_ENABLED || "").toLowerCase());
  const dryRun = ["true", "1"].includes(String(process.env.CRM_QUESTIONNAIRE_SYNC_DRY_RUN || "").toLowerCase());
  if (!enabled) return json({ success: true, skipped: true, reason: "feature_disabled", changes: publicChanges });
  if (dryRun) return json({ success: true, dryRun: true, changes: publicChanges });

  const zoho = new ZohoCRMClient();
  const token = await zoho.getAccessToken();
  if (!token) return json({ success: false, error: "Zoho access token is unavailable" }, 502);

  const groups = new Map();
  for (const change of projection.changes) {
    if (!change.recordId || !change.module || !change.fieldApiName || change.action === "preserved" || change.action === "skipped") {
      continue;
    }
    const key = `${change.module}:${change.recordId}`;
    if (!groups.has(key)) groups.set(key, { module: change.module, recordId: change.recordId, fields: {} });
    if (change.writeValue !== undefined) groups.get(key).fields[change.fieldApiName] = change.writeValue;
  }
  for (const group of groups.values()) {
    if (!Object.keys(group.fields).length) continue;
    const result = await zoho.updateRecord(group.module, group.recordId, group.fields);
    if (!result || result.status === "error") {
      return json({ success: false, error: result?.message || "Zoho update failed", changes: publicChanges }, 502);
    }
  }
  return json({ success: true, changes: publicChanges });
}
