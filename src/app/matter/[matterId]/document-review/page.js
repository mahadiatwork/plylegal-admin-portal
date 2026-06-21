"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  Loader2,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const DOCUMENT_SOURCE = "documentReview";

const documentUrlPaths = [
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

const emptyCorrection = () => ({
  fieldName: "",
  details: "",
});

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

function normalizeDocumentUrl(url) {
  if (typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return "";
}

function findDocumentUrl(application, resources) {
  for (const path of documentUrlPaths) {
    const value = normalizeDocumentUrl(getNestedValue(application, path));
    if (value) return value;
  }

  const reviewResource = resources.find(looksLikeDocumentReviewResource);
  if (reviewResource) {
    return normalizeDocumentUrl(
      reviewResource.publicUrl || reviewResource.downloadUrl || reviewResource.url
    );
  }

  return "";
}

function slugify(value) {
  return String(value || "section")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || "section";
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

export default function DocumentReviewPage() {
  const params = useParams();
  const matterId = params.matterId;

  const [application, setApplication] = useState(null);
  const [resources, setResources] = useState([]);
  const [comments, setComments] = useState([]);
  const [corrections, setCorrections] = useState([emptyCorrection()]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
          fetch(`/api/review-comments/${matterId}`),
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

  const documentUrl = useMemo(
    () => findDocumentUrl(application, resources),
    [application, resources]
  );

  const openCorrections = useMemo(
    () => comments.filter((comment) => comment.status === "open"),
    [comments]
  );

  const updateCorrection = (index, key, value) => {
    setCorrections((current) =>
      current.map((correction, correctionIndex) =>
        correctionIndex === index ? { ...correction, [key]: value } : correction
      )
    );
  };

  const addCorrection = () => {
    setCorrections((current) => [...current, emptyCorrection()]);
  };

  const removeCorrection = (index) => {
    setCorrections((current) =>
      current.length === 1 ? [emptyCorrection()] : current.filter((_, i) => i !== index)
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const validCorrections = corrections
      .map((correction) => ({
        fieldName: correction.fieldName.trim(),
        details: correction.details.trim(),
      }))
      .filter((correction) => correction.fieldName && correction.details);

    if (validCorrections.length === 0) {
      setError("Add at least one section name and description before submitting.");
      return;
    }

    try {
      setIsSubmitting(true);

      const createdComments = [];
      for (const correction of validCorrections) {
        const response = await fetch(`/api/review-comments/${matterId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: `${DOCUMENT_SOURCE}.${slugify(correction.fieldName)}.${Date.now()}`,
            label: correction.fieldName,
            body: correction.details,
            severity: "issue",
            source: DOCUMENT_SOURCE,
            documentUrl,
          }),
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to submit one of the corrections.");
        }
        createdComments.push(data.comment);
      }

      setComments((current) => [...current, ...createdComments]);
      setCorrections([emptyCorrection()]);
      setMessage("Your document corrections were submitted.");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmitting(false);
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
            Review the prepared document and submit any sections that need correction.
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
            <h2 className="text-base font-semibold text-gray-900">Document Preview</h2>
          </div>
          <div className="h-[72vh] min-h-[560px] bg-gray-50">
            {documentUrl ? (
              <iframe
                title="Document review preview"
                src={documentUrl}
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
                  Once the prepared government document is attached to this matter, it will appear here for review.
                </p>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-gray-900">Correction Details</h2>
              <p className="mt-1 text-sm text-gray-500">
                Add one entry for each section that needs attention.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {corrections.map((correction, index) => (
                <div key={index} className="space-y-3 border-b border-gray-100 pb-5 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-gray-900">
                      Correction #{index + 1}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeCorrection(index)}
                      className="h-8 px-2 text-gray-500 hover:text-red-600"
                      title="Remove correction"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700" htmlFor={`field-${index}`}>
                      Section or field name
                    </label>
                    <Input
                      id={`field-${index}`}
                      value={correction.fieldName}
                      onChange={(event) =>
                        updateCorrection(index, "fieldName", event.target.value)
                      }
                      placeholder="e.g. Date of birth"
                      className="h-10 bg-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700" htmlFor={`details-${index}`}>
                      Description
                    </label>
                    <Textarea
                      id={`details-${index}`}
                      value={correction.details}
                      onChange={(event) =>
                        updateCorrection(index, "details", event.target.value)
                      }
                      placeholder="Describe the correction needed"
                      rows={5}
                      className="bg-white"
                    />
                  </div>
                </div>
              ))}

              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={addCorrection}
                  className="h-10 bg-white"
                >
                  <Plus className="h-4 w-4" />
                  Add another
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-10 bg-[#4F726B] text-white hover:bg-[#456760]"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Submit
                </Button>
              </div>
            </form>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                Submitted Corrections
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {openCorrections.length} open {openCorrections.length === 1 ? "correction" : "corrections"}
              </p>
            </div>

            {comments.length ? (
              <div className="divide-y divide-gray-100">
                {comments.map((comment) => (
                  <article key={comment.id} className="px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-gray-900">
                        {comment.label || "Document section"}
                      </h3>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-xs font-semibold capitalize ${
                          comment.status === "resolved"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        }`}
                      >
                        {comment.status || "open"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-gray-600">{comment.body}</p>
                    <p className="mt-2 text-xs text-gray-400">{formatDate(comment.createdAt)}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-sm text-gray-500">
                No corrections have been submitted for this document.
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
