import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { db } from "@/lib/firebase-admin";
import { resolveMatterApplication } from "@/lib/matterResolver";
import zohoClient from "@/lib/zohoClient";
import { getMatterSharedFolderUrl } from "@/lib/matterSharedFolder.mjs";

const respond = (body, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});

export async function GET(_request, { params }) {
  try {
    if (!(await getAdminSession())) return respond({ success: false, error: "Admin session is required" }, 401);
    const { matterId } = await params;
    if (!matterId || matterId.includes("/")) return respond({ success: false, error: "A valid matter ID is required" }, 400);
    if (!db) return respond({ success: false, error: "Database not initialized" }, 500);

    const resolved = await resolveMatterApplication(db, matterId);
    if (!resolved) return respond({ success: false, error: "Matter not found" }, 404);
    const application = resolved.application || resolved.appDoc.data();
    const dealId = String(application.zohoId || application.zohoDealId || application.dealId || "").trim();
    if (!/^\d+$/.test(dealId)) return respond({ success: true, folderUrl: null });

    const deal = await zohoClient.getRecord("Deals", dealId, "id,Matter_Workdrive_Folder_URL");
    if (!deal) throw new Error("Zoho Deal could not be loaded");
    return respond({ success: true, folderUrl: getMatterSharedFolderUrl(deal.Matter_Workdrive_Folder_URL) });
  } catch (error) {
    console.error("[matter/shared-folder] Load failed", { code: error.name });
    return respond({ success: false, error: "Unable to load the shared folder. Please try again." }, 502);
  }
}
