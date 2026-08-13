"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { getWorkDrivePreviewUrl } from "@/lib/workDrivePreviewUrl.mjs";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  Loader2,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DOCUMENT_SOURCE = "documentReview";
const REVIEW_COMMENT_STATUSES = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
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

function findDocumentResource(resources) {
  return (
    resources.find(
      (resource) => resource.source === DOCUMENT_SOURCE && getResourceUrl(resource)
    ) ||
    resources.find((resource) => looksLikeDocumentReviewResource(resource) && getResourceUrl(resource)) ||
    null
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

export default function DocumentReviewPage() {
  const params = useParams();
  const matterId = params.matterId;

  const [application, setApplication] = useState(null);
  const [resources, setResources] = useState([]);
  const [comments, setComments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [removingDocumentId, setRemovingDocumentId] = useState("");
  const [updatingCommentId, setUpdatingCommentId] = useState("");
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

  const documentResource = useMemo(() => findDocumentResource(resources), [resources]);
  const documentUrl = useMemo(
    () => getResourceUrl(documentResource) || findApplicationDocumentUrl(application),
    [application, documentResource]
  );
  const documentPreviewUrl = useMemo(
    () =>
      getResourcePreviewUrl(documentResource) ||
      getWorkDrivePreviewUrl(findApplicationDocumentUrl(application)) ||
      findApplicationDocumentUrl(application),
    [application, documentResource]
  );

  const openIssues = useMemo(
    () => comments.filter((comment) => normalizeCommentStatus(comment.status) === "open"),
    [comments]
  );

  const handleDocumentSelect = (event) => {
    const file = event.target.files?.[0] || null;

    if (file && !file.name.toLowerCase().endsWith(".pdf")) {
      event.target.value = "";
      setSelectedDocument(null);
      setError("Only PDF files can be uploaded.");
      setMessage("");
      return;
    }

    setSelectedDocument(file);
    setError("");
    setMessage("");
  };

  const handleUploadDocument = async () => {
    setError("");
    setMessage("");

    if (!selectedDocument) {
      setError("Choose a document before uploading.");
      return;
    }

    try {
      setIsUploadingDocument(true);

      const payload = new FormData();
      payload.append("type", "file");
      payload.append("file", selectedDocument);
      payload.append("source", DOCUMENT_SOURCE);
      payload.append("category", "Document Review");
      payload.append("title", `Document Review - ${selectedDocument.name}`);
      payload.append("description", "Document uploaded for review.");

      const response = await fetch(`/api/matter/${matterId}/resources`, {
        method: "POST",
        body: payload,
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to upload document.");
      }

      setResources((current) => [data.resource, ...current]);
      setApplication((current) =>
        current
          ? { ...current, Final_File_For_Visa_Submission: getResourcePreviewUrl(data.resource) }
          : current
      );
      setSelectedDocument(null);
      setFileInputKey((key) => key + 1);
      setMessage("Document uploaded.");
    } catch (submitError) {
      setError(submitError.message);
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
        current ? { ...current, Final_File_For_Visa_Submission: null } : current
      );
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
          item.id === comment.id ? { ...item, status, updatedAt } : item
        )
      );
      setMessage(status === "resolved" ? "Issue marked resolved." : "Issue reopened.");
    } catch (statusError) {
      setError(statusError.message);
    } finally {
      setUpdatingCommentId("");
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
            Upload the prepared document and track client-submitted issues.
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
                  disabled={removingDocumentId === documentResource.id}
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

            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                key={fileInputKey}
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleDocumentSelect}
                className="h-10 bg-white"
              />
              <Button
                type="button"
                onClick={handleUploadDocument}
                disabled={isUploadingDocument || !selectedDocument}
                className="h-10 bg-[#4F726B] text-white hover:bg-[#456760]"
              >
                {isUploadingDocument ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UploadCloud className="h-4 w-4" />
                )}
                {documentResource ? "Upload replacement" : "Upload document"}
              </Button>
            </div>
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
                Issues
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {openIssues.length} open {openIssues.length === 1 ? "issue" : "issues"}
              </p>
            </div>

            {comments.length ? (
              <div className="divide-y divide-gray-100">
                {comments.map((comment) => (
                  <article key={comment.id} className="px-5 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <h3 className="text-sm font-semibold text-gray-900">
                        {comment.label || "Document section"}
                      </h3>
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
                    </div>
                    <p className="mt-2 text-sm leading-6 text-gray-600">{comment.body}</p>
                    <p className="mt-2 text-xs text-gray-400">{formatDate(comment.createdAt)}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-sm text-gray-500">
                No issues have been submitted for this document.
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
