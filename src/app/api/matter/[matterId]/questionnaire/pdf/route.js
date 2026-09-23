import { GET as getMatterQuestionnaire } from "@/app/api/matter/[matterId]/route";
import { createQuestionnairePdfBytes } from "@/lib/questionnairePdf";
import { buildQuestionnairePrintGroups } from "@/lib/questionnairePrintSections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encodeContentDispositionFilename(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));
}

export async function GET(request, context) {
  try {
    // Reuse the authenticated matter response so the PDF and on-screen answers
    // always resolve the same application, definition, and saved values.
    const matterResponse = await getMatterQuestionnaire(request, context);
    if (!matterResponse.ok) return matterResponse;

    const result = await matterResponse.json();
    const groups = buildQuestionnairePrintGroups(
      result.questionnaire || {},
      result.questionnaireDefinition,
    );
    const { bytes, metadata } = createQuestionnairePdfBytes({
      application: result.application || {},
      questionnaire: result.questionnaire || {},
      definition: result.questionnaireDefinition || {},
      groups,
    });

    return new Response(bytes, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${metadata.filename}"; filename*=UTF-8''${encodeContentDispositionFilename(metadata.utf8Filename)}`,
        "Content-Length": String(bytes.byteLength),
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Questionnaire PDF generation failed:", error);
    return Response.json(
      { success: false, error: "Questionnaire PDF could not be generated" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
