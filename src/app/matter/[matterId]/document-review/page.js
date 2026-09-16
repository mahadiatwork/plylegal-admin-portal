"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getWorkDrivePreviewUrl } from "@/lib/workDrivePreviewUrl.mjs";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  Loader2,
  Plus,
  Send,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DOCUMENT_SOURCE = "documentReview";
const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024;
const ZOHO_CORRECTION_NOTIFY_STATUS = "Correction Made - Notify Client";
const REVIEW_COMMENT_STATUSES = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
];
const CORRECTION_ITEM_STATUSES = [
  { value: "todo", label: "To Do" },
  { value: "done", label: "Done" },
];

const documentUrlPaths = [
  "Final_File_For_Visa_Submission",
  "documentReviewUrl",
  "reviewDocumentUrl",
  "governmentDocumentUrl",
  "generatedDocumentUrl",
  "submittedDocumentUrl",
  "documentPreviewUrl",
  "completedFormUrl",
  "pdfUrl",
  "documentUrl",
  "documentReview.url",
  "documentReview.publicUrl",
  "documentReview.downloadUrl",
  "reviewDocument.url",
  "reviewDocument.publicUrl",
  "reviewDocument.downloadUrl",
];

function getNestedValue(source, path) {
  if (!source || !path) return null;

  return path.split(".").reduce((current, key) => {
    if (!current || typeof current !== "object") return null;
    return current[key] ?? null;
  }, source);
}

function looksLikeDocumentReviewResource(resource) {
  const haystack = [
    resource.title,
    resource.description,
    resource.category,
    resource.fileName,
    resource.url,
    resource.publicUrl,
    resource.downloadUrl,
    resource.externalUrl,
    resource.source,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return [
    "document review",
    "review document",
    "government document",
    "government form",
    "completed form",
    "submitted form",
  ].some((needle) => haystack.includes(needle));
}

function getResourceUrl(resource) {
  return normalizeDocumentUrl(
    resource?.downloadUrl || resource?.publicUrl || resource?.externalUrl || resource?.url
  );
}

function getResourcePreviewUrl(resource) {
  return normalizeDocumentUrl(
    getWorkDrivePreviewUrl(resource?.workDriveShareUrl) ||
      getWorkDrivePreviewUrl(resource?.workDriveEmbedUrl) ||
      getWorkDrivePreviewUrl(resource?.publicUrl) ||
      getWorkDrivePreviewUrl(resource?.externalUrl) ||
      getWorkDrivePreviewUrl(resource?.url) ||
      getResourceUrl(resource)
  );
}

function findDocumentResources(resources) {
  return resources.filter(
    (resource) =>
      (resource.status !== "archived" || resource.workDriveCleanupPending === true) &&
      (resource.source === DOCUMENT_SOURCE || looksLikeDocumentReviewResource(resource)) &&
      getResourceUrl(resource)
  );
}

function normalizeDocumentUrl(url) {
  if (typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return "";
}

function findApplicationDocumentUrl(application) {
  for (const path of documentUrlPaths) {
    const value = normalizeDocumentUrl(getNestedValue(application, path));
    if (value) return value;
  }

  return "";
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function normalizeCommentStatus(status) {
  return status === "resolved" ? "resolved" : "open";
}

function statusClasses(status) {
  return normalizeCommentStatus(status) === "resolved"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
}

function normalizeCorrectionItemStatus(status) {
  return status === "done" || status === "Done" ? "done" : "todo";
}

function itemStatusClasses(status) {
  return normalizeCorrectionItemStatus(status) === "done"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
}

function getCorrectionItems(comment) {
  return Array.isArray(comment?.correctionItems) ? comment.correctionItems : [];
}

function allCorrectionItemsDone(comment) {
  const items = getCorrectionItems(comment);
  return items.length > 0 && items.every((item) => normalizeCorrectionItemStatus(item.status) === "done");
}

function isNotifyClientStatus(comment) {
  return (
    comment?.zohoStatus === ZOHO_CORRECTION_NOTIFY_STATUS ||
    normalizeCommentStatus(comment?.status) === "resolved"
  );
}

export default function DocumentReviewPage() {
  const params = useParams();
  const matterId = params.matterId;

  const [application, setApplication] = useState(null);
  const [resources, setResources] = useState([]);
  const [comments, setComments] = useState([]);
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [activeDocumentId, setActiveDocumentId] = useState("");
  const documentInputRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [removingDocumentId, setRemovingDocumentId] = useState("");
  const [updatingCommentId, setUpdatingCommentId] = useState("");
  const [updatingCorrectionItemId, setUpdatingCorrectionItemId] = useState("");
  const [notifyingCorrectionId, setNotifyingCorrectionId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadDocumentReview() {
      try {
        setIsLoading(true);
        setError("");

        const [matterResponse, resourceResponse, commentsResponse] = await Promise.all([
          fetch(`/api/matter/${matterId}`),
          fetch(`/api/matter/${matterId}/resources`),
          fetch(`/api/review-comments/${matterId}?source=${DOCUMENT_SOURCE}`),
        ]);

        const [matterData, resourceData, commentsData] = await Promise.all([
          matterResponse.json(),
          resourceResponse.json().catch(() => ({})),
          commentsResponse.json().catch(() => ({})),
        ]);

        if (!matterResponse.ok || !matterData.success) {
          throw new Error(matterData.error || "Unable to load this matter.");
        }

        if (!isMounted) return;

        setApplication(matterData.application || null);
        setResources(resourceData.resources || []);
        setComments(
          (commentsData.comments || []).filter((comment) => comment.source === DOCUMENT_SOURCE)
        );
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    if (matterId) {
      loadDocumentReview();
    }

    return () => {
      isMounted = false;
    };
  }, [matterId]);

  const documentResources = useMemo(() => findDocumentResources(resources), [resources]);
  const documentResource =
    documentResources.find((resource) => resource.id === activeDocumentId) ||
    documentResources[0] ||
    null;
  const documentUrl = useMemo(
    () => getResourceUrl(documentResource) || findApplicationDocumentUrl(application),
    [application, documentResource]
  );
  const documentPreviewUrl = useMemo(
    () =>
      documentResource?.id
        ? `/api/matter/${encodeURIComponent(matterId)}/resources/${encodeURIComponent(documentResource.id)}/preview`
        : getWorkDrivePreviewUrl(findApplicationDocumentUrl(application)) ||
          findApplicationDocumentUrl(application),
    [application, documentResource, matterId]
  );

  const openIssues = useMemo(
    () => comments.filter((comment) => normalizeCommentStatus(comment.status) === "open"),
    [comments]
  );

  const handleDocumentSelect = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length || isUploadingDocument) return;

    setError("");
    setMessage("");

    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setError(`"${file.name}" is not a PDF. Only PDF files can be uploaded.`);
        return;
      }
      if (!file.size || file.size > MAX_DOCUMENT_SIZE) {
        setError(
          !file.size
            ? `"${file.name}" is empty. Choose a PDF with content.`
            : `"${file.name}" exceeds the 50 MB limit.`
        );
        return;
      }
    }

    setSelectedDocuments((current) => {
      const next = [...current];
      for (const file of files) {
        if (!next.some((item) =>
          item.name === file.name && item.size === file.size && item.lastModified === file.lastModified
        )) {
          next.push(file);
        }
      }
      return next;
    });
  };

  const handleUploadDocument = async () => {
    if (isUploadingDocument) return;
    setError("");
    setMessage("");

    if (!selectedDocuments.length) {
      setError("Choose at least one document before uploading.");
      return;
    }

    let uploadedCount = 0;
    const failures = [];
    setIsUploadingDocument(true);

    try {
      // Keep WorkDrive folder creation and the legacy matter URL updates in order.
      for (const file of selectedDocuments) {
        try {
          const payload = new FormData();
          payload.append("type", "file");
          payload.append("file", file);
          payload.append("source", DOCUMENT_SOURCE);
          payload.append("category", "Document Review");
          payload.append("title", `Document Review - ${file.name}`);
          payload.append("description", "Document uploaded for review.");

          const response = await fetch(`/api/matter/${matterId}/resources`, {
            method: "POST",
            body: payload,
          });
          const data = await response.json();

          if (!response.ok || !data.success || !data.resource?.id) {
            throw new Error(data.error || "Failed to upload document.");
          }

          setResources((current) => [data.resource, ...current]);
          setActiveDocumentId(data.resource.id);
          setApplication((current) =>
            current
              ? { ...current, Final_File_For_Visa_Submission: getResourcePreviewUrl(data.resource) }
              : current
          );
          setSelectedDocuments((current) => current.filter((item) => item !== file));
          uploadedCount += 1;
        } catch (submitError) {
          failures.push(`"${file.name}": ${submitError.message}`);
        }
      }

      const result = `${uploadedCount} ${uploadedCount === 1 ? "document" : "documents"} uploaded.`;
      if (failures.length) {
        setError(`${result} ${failures.join(" ")} The remaining documents can be retried.`);
      } else {
        setMessage(result);
      }
    } finally {
      setIsUploadingDocument(false);
    }
  };

  const handleRemoveDocument = async () => {
    if (!documentResource?.id) return;

    const confirmed = window.confirm("Remove this document from review?");
    if (!confirmed) return;

    try {
      setRemovingDocumentId(documentResource.id);
      setError("");
      setMessage("");

      const response = await fetch(
        `/api/matter/${matterId}/resources/${documentResource.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "archived" }),
        }
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to remove document.");
      }

      setResources((current) => current.filter((resource) => resource.id !== documentResource.id));
      setApplication((current) =>
        current ? { ...current, Final_File_For_Visa_Submission: data.finalFileUrl ?? null } : current
      );
      setActiveDocumentId("");
      setMessage("Document removed.");
    } catch (removeError) {
      setError(removeError.message);
    } finally {
      setRemovingDocumentId("");
    }
  };

  const handleCommentStatusChange = async (comment, status) => {
    if (!comment.id || status === normalizeCommentStatus(comment.status)) return;

    try {
      setUpdatingCommentId(comment.id);
      setError("");
      setMessage("");

      const response = await fetch(`/api/review-comments/${matterId}/${comment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update issue status.");
      }

      const updatedAt = new Date().toISOString();
      setComments((current) =>
        current.map((item) =>
          item.id === comment.id
            ? data.correction || { ...item, status, updatedAt }
            : item
        )
      );
      setMessage(status === "resolved" ? "Correction marked resolved." : "Correction reopened.");
    } catch (statusError) {
      setError(statusError.message);
    } finally {
      setUpdatingCommentId("");
    }
  };

  const handleCorrectionItemStatusChange = async (comment, correctionItem, status) => {
    const itemId = correctionItem.zohoSubformId || correctionItem.id;
    if (!comment.id || !itemId || status === normalizeCorrectionItemStatus(correctionItem.status)) {
      return;
    }

    const busyId = `${comment.id}:${itemId}`;

    try {
      setUpdatingCorrectionItemId(busyId);
      setError("");
      setMessage("");

      const response = await fetch(`/api/review-comments/${matterId}/${comment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateCorrectionItemStatus",
          itemId,
          status,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update correction item.");
      }

      setComments((current) =>
        current.map((item) => (item.id === comment.id ? data.correction || item : item))
      );
      setMessage(status === "done" ? "Correction item marked done." : "Correction item reopened.");
    } catch (statusError) {
      setError(statusError.message);
    } finally {
      setUpdatingCorrectionItemId("");
    }
  };

  const handleNotifyClient = async (comment) => {
    if (!comment.id || !allCorrectionItemsDone(comment) || isNotifyClientStatus(comment)) return;

    try {
      setNotifyingCorrectionId(comment.id);
      setError("");
      setMessage("");

      const response = await fetch(`/api/review-comments/${matterId}/${comment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "notifyClient" }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to mark correction ready to notify.");
      }

      setComments((current) =>
        current.map((item) => (item.id === comment.id ? data.correction || item : item))
      );
      setMessage("Correction marked ready to notify client.");
    } catch (notifyError) {
      setError(notifyError.message);
    } finally {
      setNotifyingCorrectionId("");
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#4F726B]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Document Review
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Upload prepared PDFs for client review and track client-submitted corrections.
          </p>
        </div>
        {documentUrl ? (
          <Button asChild variant="outline" className="h-10 bg-white">
            <a href={documentUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Open document
            </a>
          </Button>
        ) : null}
      </section>

      {(error || message) && (
        <div
          role={error ? "alert" : "status"}
          className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{error || message}</span>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,460px)]">
        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Document Preview</h2>
                {documentResource?.fileName ? (
                  <p className="mt-1 text-sm text-gray-500">{documentResource.fileName}</p>
                ) : null}
              </div>

              {documentResource?.id ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRemoveDocument}
                  disabled={Boolean(removingDocumentId) || isUploadingDocument}
                  className="h-10 bg-white text-red-600 hover:text-red-700"
                >
                  {removingDocumentId === documentResource.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Remove document
                </Button>
              ) : null}
            </div>

            {documentResources.length > 1 ? (
              <div className="mt-4 space-y-2">
                <label htmlFor="review-document" className="text-sm font-medium text-gray-700">
                  Document to preview ({documentResources.length})
                </label>
                <select
                  id="review-document"
                  value={documentResource?.id || ""}
                  onChange={(event) => setActiveDocumentId(event.target.value)}
                  disabled={Boolean(removingDocumentId) || isUploadingDocument}
                  className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                >
                  {documentResources.map((resource) => (
                    <option key={resource.id} value={resource.id}>
                      {resource.fileName || resource.title || "Review document"}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-3">
              <Input
                ref={documentInputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                aria-label="Choose review PDFs"
                disabled={isUploadingDocument || Boolean(removingDocumentId)}
                onChange={handleDocumentSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => documentInputRef.current?.click()}
                disabled={isUploadingDocument || Boolean(removingDocumentId)}
                className="h-10 bg-white"
              >
                <Plus className="h-4 w-4" />
                Add documents
              </Button>
              <Button
                type="button"
                onClick={handleUploadDocument}
                disabled={isUploadingDocument || !selectedDocuments.length || Boolean(removingDocumentId)}
                className="h-10 bg-[#4F726B] text-white hover:bg-[#456760]"
              >
                {isUploadingDocument ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UploadCloud className="h-4 w-4" />
                )}
                {isUploadingDocument
                  ? "Uploading documents…"
                  : selectedDocuments.length > 1
                    ? `Upload ${selectedDocuments.length} documents`
                    : "Upload document"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Add one or more PDFs, then upload them together. Maximum 50 MB per document.
            </p>
            {selectedDocuments.length ? (
              <ul aria-label="Documents ready to upload" className="mt-3 space-y-2">
                {selectedDocuments.map((file, index) => (
                  <li key={index} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2">
                    <span className="min-w-0 break-all text-sm text-gray-700">{file.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${file.name} from upload`}
                      onClick={() => setSelectedDocuments((current) => current.filter((item) => item !== file))}
                      disabled={isUploadingDocument}
                      className="shrink-0 text-gray-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="h-[72vh] min-h-[560px] bg-gray-50">
            {documentUrl ? (
              <iframe
                title="Document review preview"
                src={documentPreviewUrl}
                allowFullScreen
                className="h-full w-full border-0 bg-white"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-gray-200 bg-white text-[#4F726B]">
                  <FileSearch className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">
                  No review document is available yet
                </h3>
                <p className="mt-2 max-w-md text-sm text-gray-500">
                  Upload the prepared document to show it here for review.
                </p>
              </div>
            )}
          </div>
        </section>

        <aside>
          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                Corrections
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {openIssues.length} open {openIssues.length === 1 ? "correction" : "corrections"}
              </p>
            </div>

            {comments.length ? (
              <div className="divide-y divide-gray-100">
                {comments.map((comment) => {
                  const correctionItems = getCorrectionItems(comment);
                  const hasCorrectionItems = correctionItems.length > 0;
                  const allItemsDone = allCorrectionItemsDone(comment);
                  const notifyStatus = isNotifyClientStatus(comment);
                  const showZohoCorrectionControls =
                    comment.origin === "zohoCorrections" && hasCorrectionItems;
                  const notifyDisabled =
                    notifyingCorrectionId === comment.id || !allItemsDone || notifyStatus;

                  return (
                  <article key={comment.id} className="px-5 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-gray-900">
                            {comment.label || "Document section"}
                          </h3>
                          {comment.origin === "zohoCorrections" ? (
                            <Badge variant="outline" className={statusClasses(comment.status)}>
                              {comment.zohoStatus || comment.status || "Open"}
                            </Badge>
                          ) : null}
                        </div>
                        {hasCorrectionItems ? (
                          <p className="mt-1 text-xs text-gray-500">
                            {comment.doneItemCount || 0} of {comment.totalItemCount || correctionItems.length} done
                          </p>
                        ) : null}
                      </div>

                      {showZohoCorrectionControls ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleNotifyClient(comment)}
                          disabled={notifyDisabled}
                          className={
                            notifyStatus
                              ? "h-9 bg-white text-[#4F726B] border border-[#d8e4de]"
                              : "h-9 bg-[#4F726B] text-white hover:bg-[#456760]"
                          }
                        >
                          {notifyingCorrectionId === comment.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : notifyStatus ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          {notifyStatus ? "Ready to notify" : "Notify client"}
                        </Button>
                      ) : (
                        <>
                          <label className="sr-only" htmlFor={`status-${comment.id}`}>
                            Issue status
                          </label>
                          <select
                            id={`status-${comment.id}`}
                            value={normalizeCommentStatus(comment.status)}
                            disabled={updatingCommentId === comment.id}
                            onChange={(event) =>
                              handleCommentStatusChange(comment, event.target.value)
                            }
                            className={`h-8 rounded-md border px-2 text-xs font-semibold capitalize ${statusClasses(
                              comment.status
                            )}`}
                          >
                            {REVIEW_COMMENT_STATUSES.map((status) => (
                              <option key={status.value} value={status.value}>
                                {status.label}
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                    </div>

                    {hasCorrectionItems ? (
                      <div className="mt-3 overflow-x-auto rounded-md border border-gray-200">
                        <table className="w-full min-w-[560px] table-fixed text-left text-xs">
                          <thead className="bg-gray-50 text-gray-500">
                            <tr>
                              <th className="w-16 px-3 py-2 font-semibold">No</th>
                              <th className="w-20 px-3 py-2 font-semibold">Page</th>
                              <th className="w-24 px-3 py-2 font-semibold">Question</th>
                              <th className="px-3 py-2 font-semibold">Details</th>
                              <th className="w-28 px-3 py-2 font-semibold">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white text-gray-700">
                            {correctionItems.map((item) => {
                              const itemId = item.zohoSubformId || item.id;
                              const busyId = `${comment.id}:${itemId}`;

                              return (
                                <tr key={item.id}>
                                  <td className="px-3 py-3 align-top">{item.correctionNo || "-"}</td>
                                  <td className="px-3 py-3 align-top">{item.pageNo || "-"}</td>
                                  <td className="px-3 py-3 align-top">{item.questionNo || "-"}</td>
                                  <td className="px-3 py-3 align-top leading-5">
                                    {item.details || "Correction detail"}
                                  </td>
                                  <td className="px-3 py-3 align-top">
                                    <label className="sr-only" htmlFor={`item-status-${comment.id}-${item.id}`}>
                                      Correction item status
                                    </label>
                                    <select
                                      id={`item-status-${comment.id}-${item.id}`}
                                      value={normalizeCorrectionItemStatus(item.status)}
                                      disabled={updatingCorrectionItemId === busyId}
                                      onChange={(event) =>
                                        handleCorrectionItemStatusChange(
                                          comment,
                                          item,
                                          event.target.value
                                        )
                                      }
                                      className={`h-8 w-24 rounded-md border px-2 text-xs font-semibold ${itemStatusClasses(
                                        item.status
                                      )}`}
                                    >
                                      {CORRECTION_ITEM_STATUSES.map((status) => (
                                        <option key={status.value} value={status.value}>
                                          {status.label}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-gray-600">{comment.body}</p>
                    )}

                    <p className="mt-2 text-xs text-gray-400">{formatDate(comment.createdAt)}</p>
                  </article>
                  );
                })}
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-sm text-gray-500">
                  No corrections have been submitted for this matter.
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
