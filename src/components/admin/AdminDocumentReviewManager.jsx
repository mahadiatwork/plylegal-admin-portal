"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileSearch,
  Loader2,
  RefreshCcw,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const statusTabs = [
  { id: "open", label: "Open" },
  { id: "resolved", label: "Resolved" },
  { id: "all", label: "All" },
];

function formatDate(value) {
  if (!value) return "Not set";

  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getApplicationTitle(correction) {
  const application = correction.application || {};
  return (
    application.reference ||
    application.applicantName ||
    application.zohoId ||
    correction.applicationId ||
    "Unknown matter"
  );
}

function correctionMatches(correction, query) {
  if (!query) return true;
  const lowerQuery = query.toLowerCase();
  const application = correction.application || {};

  return [
    correction.label,
    correction.body,
    correction.status,
    application.reference,
    application.applicantName,
    application.visaType,
    application.zohoId,
    correction.applicationId,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(lowerQuery));
}

function statusClasses(status) {
  if (status === "resolved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}

function CorrectionRow({ correction, isBusy, onStatusChange }) {
  const application = correction.application || {};
  const nextStatus = correction.status === "resolved" ? "open" : "resolved";
  const isResolved = correction.status === "resolved";

  return (
    <article className="rounded-lg border border-white/80 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-[#17372e]">
              {correction.label || "Document section"}
            </h3>
            <Badge variant="outline" className={statusClasses(correction.status)}>
              {correction.status || "open"}
            </Badge>
            <Badge variant="outline" className="border-[#d6e3dd] bg-[#f5f8f6] text-[#4f6d61]">
              Document review
            </Badge>
          </div>

          <p className="text-sm leading-6 text-[#425c52]">{correction.body}</p>

          <div className="flex flex-wrap items-center gap-2 text-sm text-[#60786d]">
            <span className="font-semibold text-[#17372e]">{getApplicationTitle(correction)}</span>
            {application.visaType ? <span>{application.visaType}</span> : null}
            {application.zohoId ? <span>Deal ID: {application.zohoId}</span> : null}
            <span>Submitted {formatDate(correction.createdAt)}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {correction.documentUrl ? (
            <Button asChild variant="outline" size="sm" className="h-9 bg-white">
              <a href={correction.documentUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Document
              </a>
            </Button>
          ) : null}

          {correction.applicationId ? (
            <Button asChild variant="outline" size="sm" className="h-9 bg-white">
              <Link href={`/matter/${correction.applicationId}/document-review`}>
                <FileSearch className="h-4 w-4" />
                Matter
              </Link>
            </Button>
          ) : null}

          <Button
            type="button"
            size="sm"
            disabled={isBusy}
            onClick={() => onStatusChange(correction, nextStatus)}
            className={
              isResolved
                ? "h-9 bg-white text-[#4F726B] border border-[#d8e4de] hover:bg-[#f5faf7]"
                : "h-9 bg-[#4F726B] text-white hover:bg-[#456760]"
            }
          >
            {isBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isResolved ? (
              <Clock3 className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {isResolved ? "Reopen" : "Resolve"}
          </Button>
        </div>
      </div>
    </article>
  );
}

export default function AdminDocumentReviewManager() {
  const [corrections, setCorrections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());

  const loadCorrections = async () => {
    try {
      setIsLoading(true);
      setError("");
      const response = await fetch("/api/admin/document-review");
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load document corrections");
      }

      setCorrections(data.corrections || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    fetch("/api/admin/document-review")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to load document corrections");
        }
        return data.corrections || [];
      })
      .then((nextCorrections) => {
        if (isMounted) {
          setCorrections(nextCorrections);
        }
      })
      .catch((loadError) => {
        if (isMounted) {
          setError(loadError.message);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const open = corrections.filter((correction) => correction.status !== "resolved").length;
    const resolved = corrections.filter((correction) => correction.status === "resolved").length;
    return { open, resolved, total: corrections.length };
  }, [corrections]);

  const filteredCorrections = useMemo(
    () =>
      corrections.filter((correction) => {
        if (statusFilter !== "all") {
          const isResolved = correction.status === "resolved";
          if (statusFilter === "open" && isResolved) return false;
          if (statusFilter === "resolved" && !isResolved) return false;
        }
        return correctionMatches(correction, deferredSearchQuery);
      }),
    [corrections, deferredSearchQuery, statusFilter]
  );

  const handleStatusChange = async (correction, status) => {
    if (!correction.applicationId) return;

    try {
      setBusyId(correction.id);
      setError("");
      setMessage("");

      const response = await fetch(
        `/api/review-comments/${correction.applicationId}/${correction.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update correction");
      }

      setCorrections((current) =>
        current.map((item) =>
          item.id === correction.id
            ? { ...item, status, updatedAt: new Date().toISOString() }
            : item
        )
      );
      setMessage(status === "resolved" ? "Correction marked resolved." : "Correction reopened.");
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#70877e]">
            Review Document
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#17372e]">
            Document Corrections
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#60786d]">
            Triage client-submitted correction notes from the document review page.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={loadCorrections}
          disabled={isLoading}
          className="h-10 bg-white"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          { label: "Open", value: stats.open },
          { label: "Resolved", value: stats.resolved },
          { label: "Total", value: stats.total },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-white/80 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-[#60786d]">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold text-[#17372e]">{stat.value}</p>
          </div>
        ))}
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

      <section className="rounded-lg border border-white/80 bg-white/80 p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid gap-2 sm:grid-cols-3">
            {statusTabs.map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`rounded-md border px-4 py-2 text-sm font-semibold transition-colors ${
                    active
                      ? "border-[#4F726B] bg-[#4F726B] text-white"
                      : "border-[#d8e4de] bg-white text-[#4b655b] hover:border-[#8ac6ad]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8ac6ad]" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search corrections, matters, applicants"
              className="h-10 bg-white pl-9"
            />
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="flex items-center justify-center p-12 text-[#4F726B]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : filteredCorrections.length ? (
        <section className="space-y-4">
          {filteredCorrections.map((correction) => (
            <CorrectionRow
              key={correction.id}
              correction={correction}
              isBusy={busyId === correction.id}
              onStatusChange={handleStatusChange}
            />
          ))}
        </section>
      ) : (
        <section className="rounded-lg border border-white/80 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-[#d8e4de] bg-[#f5faf7] text-[#4F726B]">
            <FileSearch className="h-6 w-6" />
          </div>
          <h2 className="text-sm font-semibold text-[#17372e]">No document corrections found</h2>
          <p className="mt-2 text-sm text-[#60786d]">
            New correction submissions from client document review pages will appear here.
          </p>
        </section>
      )}
    </div>
  );
}
