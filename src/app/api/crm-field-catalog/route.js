import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { serializeCrmFieldCatalog } from "@/lib/crmFieldCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ success: false, error: "Admin session is required" }, { status: 401 });
  }
  return NextResponse.json(
    { success: true, catalog: serializeCrmFieldCatalog() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
