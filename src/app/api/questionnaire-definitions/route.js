import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { isSameOriginRequest } from "@/lib/adminLoginProtection";
import { db, initResult } from "@/lib/firebase-admin";
import { getRegisteredQuestionnaireRoutes } from "@/lib/routes";
import {
  QUESTIONNAIRE_DEFINITION_LIMITS,
  QUESTIONNAIRE_DEFINITION_REVISIONS_COLLECTION,
  QUESTIONNAIRE_DEFINITIONS_COLLECTION,
  QuestionnaireDefinitionValidationError,
  generateQuestionnaireDefinitionId,
  normalizeQuestionnaireDefinition,
  serializeQuestionnaireDefinitionDoc,
  sortQuestionnaireDefinitions,
  visaContextsOverlap,
} from "@/lib/questionnaireDefinitions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class ApiError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function errorResponse(error, status = 500, details = null) {
  return NextResponse.json({ success: false, error, details }, { status });
}

function requireDatabase() {
  if (!db) {
    throw new ApiError(
      "Database not initialized",
      500,
      initResult?.error || "Unknown error"
    );
  }
  return db.collection(QUESTIONNAIRE_DEFINITIONS_COLLECTION);
}

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) throw new ApiError("Admin session is required", 401);
  return session.role || "admin";
}

function requireSafeMutationRequest(request, { expectsJson = false } = {}) {
  if (!isSameOriginRequest(request)) {
    throw new ApiError("Request origin is not allowed", 403);
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError("Cross-site requests are not allowed", 403);
  }
  if (
    expectsJson &&
    request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !==
      "application/json"
  ) {
    throw new ApiError("Content-Type must be application/json", 415);
  }
}

function requireRegisteredActiveRoutes(definition) {
  if (definition.status !== "active") return;
  const registered = new Set(
    getRegisteredQuestionnaireRoutes(definition.visaType, definition.visaContexts)
      .map((route) => route.href)
  );
  const unknownRoutes = definition.pages
    .map((page) => page.route)
    .filter((route) => !registered.has(route));
  if (unknownRoutes.length) {
    throw new ApiError(
      `Cannot publish routes that are not registered in the client portal: ${unknownRoutes.join(", ")}`,
      400
    );
  }
}

async function parseJsonBody(request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > QUESTIONNAIRE_DEFINITION_LIMITS.maxBytes
  ) {
    throw new ApiError("Questionnaire definition is too large", 413);
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > QUESTIONNAIRE_DEFINITION_LIMITS.maxBytes) {
    throw new ApiError("Questionnaire definition is too large", 413);
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new ApiError("Request body must be valid JSON", 400);
  }
}

async function getLegacyPages(doc) {
  const data = doc.data() || {};
  if (Object.prototype.hasOwnProperty.call(data, "pages")) return undefined;
  const snapshot = await doc.ref.collection("pages").get();
  return snapshot.docs.map((pageDoc) => ({ id: pageDoc.id, ...pageDoc.data() }));
}

function hasSameAudience(existing, nextDefinition) {
  const existingContexts = [...(
    existing.visaContexts?.length
      ? existing.visaContexts
      : existing.visaContext
        ? [existing.visaContext]
        : []
  )].sort();
  const nextContexts = [...(
    nextDefinition.visaContexts?.length
      ? nextDefinition.visaContexts
      : nextDefinition.visaContext
        ? [nextDefinition.visaContext]
        : []
  )].sort();
  return existing.visaType === nextDefinition.visaType &&
    existingContexts.length === nextContexts.length &&
    existingContexts.every((context, index) => context === nextContexts[index]);
}

async function archiveConflictingDefinitions(transaction, snapshot, nextDefinition, actor, now) {
  const conflicts = [];
  for (const existingDoc of snapshot.docs) {
    if (existingDoc.id === nextDefinition.id) continue;
    const existing = existingDoc.data() || {};
    if (existing.status !== "active" || !visaContextsOverlap(existing, nextDefinition)) continue;
    if (!hasSameAudience(existing, nextDefinition)) {
      throw new ApiError(
        "An active questionnaire overlaps only part of this audience; archive or split it before publishing",
        409
      );
    }
    const legacyPages = Object.prototype.hasOwnProperty.call(existing, "pages")
      ? undefined
      : await transaction.get(existingDoc.ref.collection("pages"));
    const currentRecord = {
      ...existing,
      id: existingDoc.id,
      pages: legacyPages
        ? legacyPages.docs.map((pageDoc) => ({ id: pageDoc.id, ...pageDoc.data() }))
        : existing.pages,
      revision: Number.isInteger(existing.revision) ? existing.revision : 0,
    };
    const currentRevisionRef = revisionRefFor(currentRecord);
    const currentRevisionSnapshot = await transaction.get(currentRevisionRef);
    conflicts.push({
      existingDoc,
      currentRecord,
      currentRevisionRef,
      currentRevisionSnapshot,
    });
  }

  for (const {
    existingDoc,
    currentRecord,
    currentRevisionRef,
    currentRevisionSnapshot,
  } of conflicts) {
    if (!currentRevisionSnapshot.exists) {
      transaction.create(
        currentRevisionRef,
        revisionSnapshot(currentRecord, now)
      );
    }
    const archivedRecord = {
      ...currentRecord,
      status: "archived",
      archivedAt: now,
      archivedBy: actor,
      updatedAt: now,
      updatedBy: actor,
      revision: currentRecord.revision + 1,
    };
    transaction.set(existingDoc.ref, archivedRecord, { merge: true });
    transaction.create(
      revisionRefFor(archivedRecord),
      revisionSnapshot(archivedRecord, now)
    );
  }
}

function revisionRefFor(record) {
  return db.collection(QUESTIONNAIRE_DEFINITION_REVISIONS_COLLECTION)
    .doc(`${record.id}__${record.revision}`);
}

function revisionSnapshot(record, now) {
  return {
    ...record,
    definitionId: record.id,
    capturedAt: now,
  };
}

function handleError(error, operation) {
  if (error instanceof ApiError || error instanceof QuestionnaireDefinitionValidationError) {
    return errorResponse(error.message, error.status || 400, error.details || error.issues || null);
  }
  console.error(`Error ${operation} questionnaire definitions:`, error);
  return errorResponse(`Failed to ${operation} questionnaire definitions`, 500);
}

export async function GET() {
  try {
    await requireAdmin();
    const collectionRef = requireDatabase();
    const snapshot = await collectionRef.get();
    const definitions = await Promise.all(
      snapshot.docs.map(async (doc) =>
        serializeQuestionnaireDefinitionDoc(doc, await getLegacyPages(doc))
      )
    );
    return NextResponse.json({
      success: true,
      definitions: sortQuestionnaireDefinitions(definitions),
    });
  } catch (error) {
    return handleError(error, "load");
  }
}

export async function POST(request) {
  try {
    const actor = await requireAdmin();
    requireSafeMutationRequest(request, { expectsJson: true });
    const collectionRef = requireDatabase();
    const body = await parseJsonBody(request);
    const definitionId = typeof body.id === "string" && body.id.trim()
      ? body.id.trim()
      : generateQuestionnaireDefinitionId(body);
    const normalized = normalizeQuestionnaireDefinition(
      { ...body, id: definitionId, revision: 0 },
      { id: definitionId }
    );
    requireRegisteredActiveRoutes(normalized);
    const now = new Date();
    const record = {
      ...normalized,
      revision: 1,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
    };
    if (record.status === "active") {
      record.publishedAt = now;
      record.publishedBy = actor;
    }
    if (record.status === "archived") {
      record.archivedAt = now;
      record.archivedBy = actor;
    }

    const definitionRef = collectionRef.doc(definitionId);
    await db.runTransaction(async (transaction) => {
      const existingSnap = await transaction.get(definitionRef);
      if (existingSnap.exists) {
        throw new ApiError("A questionnaire definition with this ID already exists", 409);
      }
      const firstRevisionRef = revisionRefFor(record);
      const previousIdentitySnap = await transaction.get(
        db.collection(QUESTIONNAIRE_DEFINITION_REVISIONS_COLLECTION)
          .where("definitionId", "==", definitionId)
          .limit(1)
      );
      if (!previousIdentitySnap.empty) {
        throw new ApiError("This questionnaire definition ID was used previously; choose a new ID", 409);
      }
      let conflicts = null;
      if (record.status === "active") {
        conflicts = await transaction.get(
          collectionRef.where("visaType", "==", record.visaType)
        );
      }
      if (conflicts) {
        await archiveConflictingDefinitions(transaction, conflicts, record, actor, now);
      }
      transaction.set(definitionRef, record);
      transaction.create(firstRevisionRef, revisionSnapshot(record, now));
    });

    return NextResponse.json(
      {
        success: true,
        definition: serializeQuestionnaireDefinitionDoc({
          id: definitionId,
          data: () => record,
        }),
      },
      { status: 201 }
    );
  } catch (error) {
    return handleError(error, "create");
  }
}
