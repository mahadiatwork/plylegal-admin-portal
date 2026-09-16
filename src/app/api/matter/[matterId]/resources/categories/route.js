import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { db } from "@/lib/firebase-admin";
import { resolveMatterApplication } from "@/lib/matterResolver";
import {
  createMatterResourceCategory,
  deleteMatterResourceCategory,
  renameMatterResourceCategory,
} from "@/lib/matterResourceCategories.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function mutateCategory(request, params, mutate, fallback) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Admin session is required" }, { status: 401 });
    }
    if (!db) {
      return NextResponse.json({ success: false, error: "Database not initialized" }, { status: 500 });
    }
    const { matterId } = await params;
    if (!matterId) {
      return NextResponse.json({ success: false, error: "Matter ID is required" }, { status: 400 });
    }
    const resolved = await resolveMatterApplication(db, matterId);
    if (!resolved) {
      return NextResponse.json({ success: false, error: "Matter not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const result = await mutate({
      db,
      appId: resolved.appId,
      name: typeof body?.name === "string" ? body.name : "",
      nextName: typeof body?.nextName === "string" ? body.nextName : "",
      icon: body?.icon === undefined ? "folder" : body.icon,
      actor: session.role || "admin",
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error(fallback, error);
    return NextResponse.json(
      { success: false, error: error.status ? error.message : `${fallback}. Refresh resources before retrying.` },
      { status: error.status || 500 }
    );
  }
}

export async function POST(request, { params }) {
  return mutateCategory(request, params, createMatterResourceCategory, "Failed to create folder");
}

export async function PATCH(request, { params }) {
  return mutateCategory(request, params, renameMatterResourceCategory, "Failed to rename folder");
}

export async function DELETE(request, { params }) {
  return mutateCategory(request, params, deleteMatterResourceCategory, "Failed to delete folder");
}
