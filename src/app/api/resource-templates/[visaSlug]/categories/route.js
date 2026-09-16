import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { db } from "@/lib/firebase-admin";
import {
  DEFAULT_RESOURCE_TEMPLATE_CATEGORIES,
  getResourceTemplateDefinitions,
  normalizeVisaSlug,
} from "@/lib/resourceTemplates";
import {
  deleteResourceTemplateCategory,
  renameResourceTemplateCategory,
} from "@/lib/resourceTemplateCategories.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveRequest(params) {
  const session = await getAdminSession();
  if (!session) {
    return { response: NextResponse.json({ success: false, error: "Admin session is required" }, { status: 401 }) };
  }
  if (!db) {
    return { response: NextResponse.json({ success: false, error: "Database not initialized" }, { status: 500 }) };
  }

  const { visaSlug: rawVisaSlug } = await params;
  const visaSlug = normalizeVisaSlug(rawVisaSlug);
  const supportedSlugs = getResourceTemplateDefinitions().map((definition) => definition.visaSlug);
  if (visaSlug !== "all" && !supportedSlugs.includes(visaSlug)) {
    return { response: NextResponse.json({ success: false, error: "Unsupported visa template" }, { status: 404 }) };
  }

  return {
    actor: session.role || "admin",
    visaSlugs: visaSlug === "all" ? supportedSlugs : [visaSlug],
  };
}

function categoryMutationError(error, fallback) {
  console.error(fallback, error);
  return NextResponse.json(
    { success: false, error: error.status ? error.message : `${fallback}. Refresh resources before retrying.` },
    { status: error.status || 500 }
  );
}

export async function PATCH(request, { params }) {
  try {
    const context = await resolveRequest(params);
    if (context.response) return context.response;

    const body = await request.json().catch(() => ({}));
    const result = await renameResourceTemplateCategory({
      db,
      visaSlugs: context.visaSlugs,
      name: typeof body?.name === "string" ? body.name : "",
      nextName: typeof body?.nextName === "string" ? body.nextName : "",
      actor: context.actor,
      defaultCategories: DEFAULT_RESOURCE_TEMPLATE_CATEGORIES,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return categoryMutationError(error, "Failed to rename category");
  }
}

export async function DELETE(request, { params }) {
  try {
    const context = await resolveRequest(params);
    if (context.response) return context.response;

    const body = await request.json().catch(() => ({}));
    const result = await deleteResourceTemplateCategory({
      db,
      visaSlugs: context.visaSlugs,
      name: typeof body?.name === "string" ? body.name : "",
      actor: context.actor,
      defaultCategories: DEFAULT_RESOURCE_TEMPLATE_CATEGORIES,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return categoryMutationError(error, "Failed to delete category");
  }
}
