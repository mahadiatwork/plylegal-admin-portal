"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Printer } from "lucide-react";
import { buildQuestionnairePrintSections } from "@/lib/questionnairePrintSections";

export default function QuestionnaireAnswersPage() {
  const { matterId } = useParams();
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const printed = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/matter/${encodeURIComponent(matterId)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = await response.json();
        if (!controller.signal.aborted) {
          if (!response.ok || !data.success) setError(data.error || "Questionnaire could not be loaded.");
          else setResult(data);
        }
      } catch {
        if (!controller.signal.aborted) setError("Questionnaire could not be loaded.");
      }
    }
    load();
    return () => controller.abort();
  }, [matterId]);

  const sections = useMemo(() => result
    ? buildQuestionnairePrintSections(result.questionnaire || {}, result.questionnaireDefinition)
    : [], [result]);

  useEffect(() => {
    if (!result) return;
    const previousTitle = document.title;
    document.title = `${result.application?.reference || "Matter"} questionnaire Q&A`;
    return () => { document.title = previousTitle; };
  }, [result]);

  useEffect(() => {
    if (!result || printed.current || !sections.length || !new URLSearchParams(window.location.search).has("print")) return;
    if (result.application?.id && String(result.application.id) !== String(matterId)) return;
    let cancelled = false;
    Promise.resolve(document.fonts?.ready).then(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!cancelled && !printed.current) {
          printed.current = true;
          window.print();
        }
      }));
    });
    return () => { cancelled = true; };
  }, [matterId, result, sections]);

  if (!result && !error) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-[#4F726B]" /></div>;
  if (error) return <div role="alert" className="rounded-xl bg-white p-8 text-red-700">{error}</div>;

  return (
    <div className="questionnaire-print-page mx-auto max-w-4xl rounded-xl bg-white p-6 text-gray-900 shadow-sm sm:p-10 print:max-w-none print:rounded-none print:p-0 print:shadow-none">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#4F726B] pb-5 print:mb-5">
        <div>
          <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-[#4F726B]">Ply Legal</p>
          <h1 className="text-2xl font-bold">Questionnaire questions and answers</h1>
          <p className="mt-1 text-sm text-gray-600">{result.application?.reference || "Matter"}</p>
        </div>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-[#4F726B] px-4 py-2 text-sm font-medium text-white hover:bg-[#3c5f57] print:hidden">
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </button>
      </div>
      {sections.length ? sections.map((section) => (
        <section key={section.key} className="mb-8 break-inside-auto">
          <h2 className="mb-3 border-b border-gray-300 pb-2 text-lg font-semibold">{section.title}</h2>
          <dl className="space-y-3">
            {section.answers.map((item, index) => (
              <div key={`${section.key}-${index}`} className="break-inside-avoid border-b border-gray-100 pb-2 last:border-b-0">
                <dt className="text-sm font-semibold text-gray-800">{item.question}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm text-gray-700">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      )) : <p className="text-sm text-gray-600">No recorded answers are available yet.</p>}
    </div>
  );
}
