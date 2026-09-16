import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { isSameOriginRequest } from "@/lib/adminLoginProtection";
import { db, initResult } from "@/lib/firebase-admin";
import { getRegisteredQuestionnaireRoutes } from "@/lib/routes";
import { getLegacyQuestionnairePublishIssues } from "@/lib/questionnaireLegacyProtection";
import {
  QUESTIONNAIRE_DEFINITION_LIMITS,
  QUESTIONNAIRE_DEFINITION_REVISIONS_COLLECTION,
  QUESTIONNAIRE_DEFINITIONS_COLLECTION,
  QuestionnaireDefinitionValidationError,
  assertQuestionnaireDefinitionStructureEditable,
  isSafeQuestionnaireDefinitionId,
  mergeQuestionnaireDefinition,
  normalizeQuestionnaireDefinition,
  serializeQuestionnaireDefinitionDoc,
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
  const legacyIssues = getLegacyQuestionnairePublishIssues(definition);
  if (legacyIssues.length) throw new ApiError("Built-in questionnaire structure must be preserved", 400, legacyIssues);
  const registered = new Set(
    getRegisteredQuestionnaireRoutes(definition.visaType, definition.visaContexts)
      .map((route) => route.href)
  );
  const unknownRoutes = definition.pages
    .map((page) => page.route)
    .filter((route) => !registered.has(route));
  if (unknownRoutes.length) {
    throw new ApiError(
      `These routes are not registered in the client portal: ${unknownRoutes.join(", ")}`,
      400
    );
  }
}

async function getDefinitionRef(collectionRef, params) {
  const { definitionId: rawDefinitionId } = await params;
  const definitionId = typeof rawDefinitionId === "string" ? rawDefinitionId.trim() : "";
  if (!isSafeQuestionnaireDefinitionId(definitionId)) {
    throw new ApiError("Questionnaire definition ID is invalid", 400);
  }
  return { definitionId, definitionRef: collectionRef.doc(definitionId) };
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

function parseRevision(value) {
  if (typeof value === "string") value = value.replace(/^W\//, "").replace(/^"|"$/g, "");
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : NaN;
}

function getExpectedRevision(request, body, { required = true } = {}) {
  const bodyRevision = Object.prototype.hasOwnProperty.call(body || {}, "revision")
    ? body.revision
    : undefined;
  const revision = parseRevision(bodyRevision ?? request.headers.get("if-match"));
  if (revision === null && required) {
    throw new ApiError("Current revision is required", 428);
  }
  if (Number.isNaN(revision)) {
    throw new ApiError("Revision must be a non-negative integer", 400);
  }
  return revision;
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
        "Another questionnaire covers part of this audience. Choose one complete audience before saving",
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
    const currentRevisionRef = revisionRefFor(existingDoc.id, currentRecord.revision);
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
        revisionSnapshot(currentRecord, existingDoc.id, now)
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
      revisionRefFor(existingDoc.id, archivedRecord.revision),
      revisionSnapshot(archivedRecord, existingDoc.id, now)
    );
  }
}

function revisionRefFor(definitionId, revision) {
  return db.collection(QUESTIONNAIRE_DEFINITION_REVISIONS_COLLECTION)
    .doc(`${definitionId}__${revision}`);
}

function revisionSnapshot(record, definitionId, now) {
  return {
    ...record,
    id: definitionId,
    definitionId,
    capturedAt: now,
  };
}

function handleError(error, operation) {
  if (error instanceof ApiError || error instanceof QuestionnaireDefinitionValidationError) {
    return errorResponse(error.message, error.status || 400, error.details || error.issues || null);
  }
  console.error(`Error ${operation} questionnaire definition:`, error);
  return errorResponse(`Failed to ${operation} questionnaire definition`, 500);
}

async function getLegacyPages(definitionRef, data, transaction = null) {
  if (Object.prototype.hasOwnProperty.call(data, "pages")) return undefined;
  const pagesRef = definitionRef.collection("pages");
  const snapshot = transaction
    ? await transaction.get(pagesRef)
    : await pagesRef.get();
  return snapshot.docs.map((pageDoc) => ({ id: pageDoc.id, ...pageDoc.data() }));
}

export async function GET(_request, { params }) {
  try {
    await requireAdmin();
    const collectionRef = requireDatabase();
    const { definitionRef } = await getDefinitionRef(collectionRef, params);
    const snapshot = await definitionRef.get();
    if (!snapshot.exists) throw new ApiError("Questionnaire definition not found", 404);
    const legacyPages = await getLegacyPages(definitionRef, snapshot.data() || {});
    return NextResponse.json({
      success: true,
      definition: serializeQuestionnaireDefinitionDoc(snapshot, legacyPages),
    });
  } catch (error) {
    return handleError(error, "load");
  }
}

async function updateDefinition(request, params, { replace }) {
  try {
    const actor = await requireAdmin();
    requireSafeMutationRequest(request, { expectsJson: true });
    const collectionRef = requireDatabase();
    const { definitionId, definitionRef } = await getDefinitionRef(collectionRef, params);
    const body = await parseJsonBody(request);
    const expectedRevision = getExpectedRevision(request, body);
    let savedRecord = null;

    await db.runTransaction(async (transaction) => {
      const currentSnap = await transaction.get(definitionRef);
      if (!currentSnap.exists) throw new ApiError("Questionnaire definition not found", 404);
      const currentData = currentSnap.data() || {};
      const currentRevision = Number.isInteger(currentData.revision) ? currentData.revision : 0;
      if (expectedRevision !== currentRevision) {
        throw new ApiError(
          "Questionnaire definition was changed by another editor",
          409,
          { expectedRevision, currentRevision }
        );
      }

      const legacyPages = await getLegacyPages(definitionRef, currentData, transaction);
      const current = serializeQuestionnaireDefinitionDoc(currentSnap, legacyPages);
      const currentRevisionRef = revisionRefFor(definitionId, currentRevision);
      const currentRevisionSnapshot = await transaction.get(currentRevisionRef);
      const currentRevisionRecord = {
        ...currentData,
        id: definitionId,
        pages: legacyPages || currentData.pages || [],
        revision: currentRevision,
      };
      const bodyForSave = { ...body, status: "active" };
      const normalized = replace
        ? normalizeQuestionnaireDefinition({ ...bodyForSave, id: definitionId }, { id: definitionId })
        : mergeQuestionnaireDefinition(current, bodyForSave, { id: definitionId });
      requireRegisteredActiveRoutes(normalized);
      assertQuestionnaireDefinitionStructureEditable(current, normalized, { id: definitionId });

      let conflicts = null;
      if (normalized.status === "active") {
        conflicts = await transaction.get(
          collectionRef.where("visaType", "==", normalized.visaType)
        );
      }

      const now = new Date();
      savedRecord = {
        ...normalized,
        revision: currentRevision + 1,
        createdAt: currentData.createdAt || now,
        createdBy: currentData.createdBy || actor,
        updatedAt: now,
        updatedBy: actor,
      };
      savedRecord.publishedAt = currentData.publishedAt || now;
      savedRecord.publishedBy = currentData.publishedBy || actor;
      savedRecord.archivedAt = null;
      savedRecord.archivedBy = null;

      if (conflicts) {
        await archiveConflictingDefinitions(transaction, conflicts, savedRecord, actor, now);
      }
      if (!currentRevisionSnapshot.exists) {
        transaction.create(
          currentRevisionRef,
          revisionSnapshot(currentRevisionRecord, definitionId, now)
        );
      }
      transaction.set(definitionRef, savedRecord);
      transaction.create(
        revisionRefFor(definitionId, savedRecord.revision),
        revisionSnapshot(savedRecord, definitionId, now)
      );
    });

    return NextResponse.json({
      success: true,
      definition: serializeQuestionnaireDefinitionDoc({
        id: definitionId,
        data: () => savedRecord,
      }),
    });
  } catch (error) {
    return handleError(error, "update");
  }
}

export async function PUT(request, { params }) {
  return updateDefinition(request, params, { replace: true });
}

export async function PATCH(request, { params }) {
  return updateDefinition(request, params, { replace: false });
}

export async function DELETE(request, { params }) {
  try {
    await requireAdmin();
    requireSafeMutationRequest(request);
    const collectionRef = requireDatabase();
    const { definitionId, definitionRef } = await getDefinitionRef(collectionRef, params);
    const url = new URL(request.url);
    const expectedRevision = getExpectedRevision(
      request,
      { revision: url.searchParams.get("revision") }
    );

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(definitionRef);
      if (!snapshot.exists) throw new ApiError("Questionnaire definition not found", 404);

      const currentRevision = Number.isInteger(snapshot.data()?.revision)
        ? snapshot.data().revision
        : 0;
      if (expectedRevision !== currentRevision) {
        throw new ApiError(
          "Questionnaire definition was changed by another editor",
          409,
          { expectedRevision, currentRevision }
        );
      }

      const legacyPages = await transaction.get(definitionRef.collection("pages"));
      if (legacyPages.size > 400) {
        throw new ApiError("Too many legacy page records to delete safely in one transaction", 409);
      }
      const revisionRef = revisionRefFor(definitionId, currentRevision);
      const revisionSnapshotDoc = await transaction.get(revisionRef);
      if (!revisionSnapshotDoc.exists) {
        const currentData = snapshot.data() || {};
        const pages = Object.prototype.hasOwnProperty.call(currentData, "pages")
          ? currentData.pages
          : legacyPages.docs.map((pageDoc) => ({ id: pageDoc.id, ...pageDoc.data() }));
        transaction.create(
          revisionRef,
          revisionSnapshot({ ...currentData, pages }, definitionId, new Date())
        );
      }
      legacyPages.docs.forEach((pageDoc) => transaction.delete(pageDoc.ref));
      transaction.delete(definitionRef);
    });

    return NextResponse.json({ success: true, deletedId: definitionId });
  } catch (error) {
    return handleError(error, "delete");
  }
}
