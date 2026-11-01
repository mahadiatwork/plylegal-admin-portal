"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  buildQuestionnaireAnswerGroups,
  calculateQuestionnaireAnswerProgress,
  isQuestionnaireAnswerSectionComplete,
  isQuestionVisible,
} from "@/lib/questionnaireAnswerModel";
import { formatLabel } from "@/lib/questionnaireSections";
import QuestionnairePdfLink from "@/components/QuestionnairePdfLink";

const inputClass = "flex min-h-9 w-full rounded-md border-2 border-slate-200 bg-white px-3 py-2 text-sm text-slate-900";
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const internalKeys = new Set(["id", "profileId", "profile_id", "relationship", "createdAt", "updatedAt", "lastUpdated", "zohoDependentId", "zoho_dependent_id"]);

function answerValue(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return value === null || value === undefined ? "" : String(value);
}

function getValue(values, key) {
  if (!key) return undefined;
  return Object.hasOwn(values || {}, key) ? values[key]
    : key.split(".").reduce((value, part) => value?.[part], values);
}

function hasRecordedAnswer(value) {
  if (Array.isArray(value)) return value.some(hasRecordedAnswer);
  if (value && typeof value === "object") return Object.values(value).some(hasRecordedAnswer);
  return value !== undefined && value !== null && value !== "";
}

function FieldLabel({ question }) {
  return <span className="block text-sm font-medium text-black">{question.label}{question.required && <span className="ml-1 text-red-600">*</span>}</span>;
}

function TextAnswer({ label, ariaLabel, value, placeholder, multiline = false }) {
  const text = answerValue(value);
  return (
    <label className="block space-y-2">
      {label && <span className="block text-sm font-medium text-black">{label}</span>}
      {multiline || text.includes("\n") ? (
        <textarea readOnly aria-readonly="true" aria-label={ariaLabel} className={`${inputClass} min-h-24 resize-none`} value={text} placeholder={placeholder || "Not answered"} />
      ) : (
        <input readOnly aria-readonly="true" aria-label={ariaLabel} className={inputClass} value={text} placeholder={placeholder || "Not answered"} />
      )}
    </label>
  );
}

function SelectAnswer({ label, value, placeholder, ariaLabel }) {
  const displayed = answerValue(value);
  return <div className="space-y-2">
    {label && <span className="block text-sm font-medium text-black">{label}</span>}
    <div className={`${inputClass} items-center justify-between`} aria-label={ariaLabel || label}><span className={displayed ? "" : "text-gray-500"}>{displayed || placeholder || "Not answered"}</span><ChevronDown className="h-4 w-4 text-gray-500" /></div>
  </div>;
}

function SavedFields({ values }) {
  if (Array.isArray(values)) return <div className="space-y-4">{values.map((value, index) => <div key={index} className="rounded-lg border border-[#dde8e1] p-4"><SavedFields values={value} /></div>)}</div>;
  if (!values || typeof values !== "object") return <TextAnswer value={values} />;
  const entries = Object.entries(values).filter(([key]) => !internalKeys.has(key));
  if (!entries.length) return <p className="text-sm text-gray-500">No answers recorded yet.</p>;
  return <div className="space-y-5">{entries.map(([key, value]) => value && typeof value === "object"
    ? <section key={key} className="space-y-3"><h3 className="text-base font-medium">{formatLabel(key)}</h3><SavedFields values={value} /></section>
    : <TextAnswer key={key} label={formatLabel(key)} value={value} />)}</div>;
}

function ReadOnlyQuestion({ question: providedQuestion, values, applicantOptions, legacy = false }) {
  if (!isQuestionVisible(providedQuestion, values)) return null;
  const labelRule = providedQuestion.metadata?.labelByValue;
  const mappedLabel = labelRule?.labels?.[getValue(values, labelRule.field)];
  const label = mappedLabel === providedQuestion.metadata?.originalLabel ? providedQuestion.label : mappedLabel;
  const question = label ? { ...providedQuestion, label } : providedQuestion;
  const value = getValue(values, question.answerKey);
  const options = question.optionsSource === "applicants" ? applicantOptions
    : question.options?.length ? question.options
      : question.type === "yesNo" ? [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] : [];
  let field;
  if (question.type === "dateParts") {
    const parts = question.parts || Object.fromEntries(["day", "month", "year"].map((part) => [part, `${question.answerKey}_${part}`]));
    field = <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{["day", "month", "year"].map((part) => {
      const raw = getValue(values, parts[part]);
      const displayed = part === "month" ? question.monthOptions?.find((option) => String(option.value) === String(raw))?.label || months[Number(raw) - 1] || raw : raw;
      return <SelectAnswer key={part} label={part === "day" && question.metadata?.hideDateHeading ? question.label : question.metadata?.partLabels?.[part] || formatLabel(part)} value={displayed} placeholder={`Choose ${formatLabel(part)}`} />;
    })}</div>;
  } else if (["yesNo", "radio"].includes(question.type)) {
    field = <div className="flex flex-wrap gap-x-6 gap-y-2" role="radiogroup" aria-label={question.label} aria-readonly="true">{options.map((option) => {
      const checked = String(option.value).toLowerCase() === String(value).toLowerCase()
        || (value === true && option.value === "yes") || (value === false && option.value === "no");
      return <label key={String(option.value)} className="flex items-center gap-2 text-sm text-black"><input type="radio" disabled checked={checked} readOnly className="h-4 w-4 accent-[#4F726B] disabled:opacity-100" />{option.label}</label>;
    })}</div>;
  } else if (question.type === "checkbox") {
    field = <input type="checkbox" aria-label={question.label} disabled checked={value === true || value === "true" || value === "yes"} readOnly className="h-4 w-4 accent-[#4F726B] disabled:opacity-100" />;
  } else if (question.type === "select" || question.metadata?.clientControl === "select") {
    const displayed = options.find((option) => String(option.value) === String(value))?.label || answerValue(value);
    field = <SelectAnswer value={displayed} ariaLabel={question.label} placeholder={question.placeholder} />;
  } else if (question.type === "repeater") {
    const rows = question.metadata?.collection === "object" ? [value || {}]
      : Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
    const fields = question.metadata?.fields || [];
    field = rows.length ? <div className="space-y-4">{rows.map((row, index) => <div key={index} className="space-y-4 rounded-lg border border-[#dde8e1] p-4"><p className="text-xs font-semibold text-gray-500">{question.label} {index + 1}</p>{fields.length
      ? <ReadOnlyQuestions questions={fields} values={row} applicantOptions={applicantOptions} legacy={legacy} />
      : <SavedFields values={row} />}</div>)}</div> : <p className="rounded-lg border border-dashed border-[#bdd2c8] bg-[#E9F0FE] p-4 text-sm text-gray-500">No records added yet.</p>;
  } else {
    field = <TextAnswer ariaLabel={question.label} value={value} placeholder={question.placeholder} multiline={question.type === "textarea"} />;
  }
  return <section className={`space-y-3 ${legacy ? "" : "border-b border-[#dde8e1] pb-6 last:border-0 last:pb-0"}`}>
    {!question.metadata?.partLabels && <FieldLabel question={question} />}
    {question.description && <p className="text-sm text-gray-600">{question.description}</p>}
    {field}
    {question.followUps?.length > 0 && <div className="mt-4 space-y-4 rounded-lg border border-[#dde8e1] bg-gray-50/50 p-4"><ReadOnlyQuestions questions={question.followUps} values={values} applicantOptions={applicantOptions} legacy={legacy} /></div>}
  </section>;
}

function ReadOnlyQuestions({ questions, values, applicantOptions, legacy = false }) {
  return <div className="space-y-6">{questions.map((question, index) => <div key={question.id} className="space-y-6">
    {question.metadata?.group && question.metadata.group !== questions[index - 1]?.metadata?.group && <h2 className="border-b border-[#dde8e1] pb-2 text-lg font-medium">{question.metadata.group}</h2>}
    <ReadOnlyQuestion question={question} values={values} applicantOptions={applicantOptions} legacy={legacy} />
  </div>)}</div>;
}

function questionKeys(questions) {
  return questions.flatMap((question) => [
    question.answerKey,
    ...(question.type === "dateParts" ? Object.values(question.parts || Object.fromEntries(["day", "month", "year"].map((part) => [part, `${question.answerKey}_${part}`]))) : []),
    ...questionKeys(question.followUps || []),
  ]).filter(Boolean);
}

function ReviewPage({ active, applicantOptions }) {
  if (!active) return <p className="rounded-2xl bg-white p-6">The questionnaire is not available yet.</p>;
  const { group, item } = active;
  const title = item.page?.title || item.title;
  const legacy = item.page?.metadata?.renderer === "legacy";
  const displayTitle = legacy && title === item.page.metadata.originalDisplayTitle
    ? item.page.metadata.originalTitle || title : title;
  const definedKeys = new Set(questionKeys(item.page?.questions || []));
  const hiddenKeys = new Set(item.page?.metadata?.hiddenAnswerKeys || []);
  const additionalAnswers = Object.fromEntries(Object.entries(item.data || {}).filter(([key, value]) => !internalKeys.has(key) && !hiddenKeys.has(key) && !definedKeys.has(key) && hasRecordedAnswer(value)));
  const intro = item.page?.introBlocks?.length > 0 && <div className={`${legacy ? "mt-2 text-gray-600" : "rounded-lg border border-[#dde8e1] bg-gray-50/50 p-4"} space-y-3 text-sm`}>{item.page.introBlocks.map((block, index) => block.type === "list"
    ? <div key={index}>{block.lead && <p>{block.lead}</p>}<ul className="list-disc space-y-1 pl-5">{block.items?.map((text, row) => <li key={row}>{text}</li>)}</ul></div>
    : <p key={index}>{block.text}</p>)}</div>;
  return <article className="rounded-2xl border border-[#dde8e1] bg-white shadow-md" data-testid="client-questionnaire-review">
    <div className="space-y-1.5 p-6">
      <h1 className="font-heading text-2xl font-semibold leading-tight">{displayTitle}{legacy && item.page.metadata.titleIncludesPerson === true && ["applicant", "nonMigrating"].includes(group.type) ? ` — ${group.title}` : ""}</h1>
      {!legacy && ["applicant", "nonMigrating"].includes(group.type) && <p className="text-sm text-gray-600">{group.title} · {group.subtitle}</p>}
      {legacy && intro}
    </div>
    <div className="px-6 pb-6"><div className={`space-y-6 ${legacy ? "" : "rounded-lg border border-[#dde8e1] p-6"}`}>
      {!legacy && intro}
      {item.page?.questions?.length ? <ReadOnlyQuestions questions={item.page.questions} values={item.data || {}} applicantOptions={applicantOptions} legacy={legacy} /> : <SavedFields values={item.data} />}
      {!item.page?.metadata?.sharedStorage && item.page?.questions?.length > 0 && Object.keys(additionalAnswers).length > 0 && <section className="space-y-4"><h2 className="text-base font-semibold">Other recorded answers</h2><SavedFields values={additionalAnswers} /></section>}
    </div></div>
  </article>;
}

function MatterCrmSyncControls({ matterId }) {
  const [changes, setChanges] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function run(mode) {
    if (!matterId) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const response = await fetch(`/api/matter/${encodeURIComponent(matterId)}/crm-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        setError(payload.error || "CRM synchronization failed");
        return;
      }
      setChanges(payload.changes || []);
      const definitionTitle = payload.questionnaireDefinition?.title;
      if (payload.preview) {
        setStatus(`Preview ready${definitionTitle ? ` for ${definitionTitle}` : ""}. No CRM data was changed.`);
      } else if (payload.skipped) {
        setStatus("CRM synchronization is disabled. The preview below is safe to review.");
      } else if (payload.dryRun) {
        setStatus("CRM dry run completed. No CRM data was changed.");
      } else {
        setStatus("CRM synchronization completed successfully.");
      }
    } catch {
      setError("CRM synchronization failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 print:hidden">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !matterId} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium" onClick={() => run("preview")}>
          Preview CRM changes
        </button>
        <button type="button" disabled={busy || !matterId} className="rounded-md bg-[#244D42] px-3 py-1.5 text-xs font-medium text-white" onClick={() => run("full")}>
          Synchronize now
        </button>
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      {status ? <p role="status" className="text-xs text-[#31564a]">{status}</p> : null}
      {changes ? (
        <ul className="max-h-48 space-y-1 overflow-auto text-xs text-slate-700">
          {changes.map((change, index) => (
            <li key={`${change.questionId}-${change.fieldApiName || "none"}-${index}`}>
              {change.module || "portal"} {change.fieldApiName || change.questionId}: {change.action}
              {change.reason ? ` (${change.reason})` : ""}
              {change.value ? ` ${change.value}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function ClientQuestionnaireReview({ questionnaire = {}, definition, completion = {}, application = {} }) {
  const groups = useMemo(() => buildQuestionnaireAnswerGroups(definition, questionnaire), [definition, questionnaire]);
  const items = useMemo(() => groups.flatMap((group) => group.items.map((item) => ({ group, item }))), [groups]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const activeIndex = Math.max(0, items.findIndex(({ item }) => item.key === selectedKey));
  const active = items[activeIndex];
  const progress = calculateQuestionnaireAnswerProgress(groups, completion);
  const applicantOptions = (questionnaire.profiles || []).map((profile) => {
    const name = [profile.given_names, profile.family_name].filter(Boolean).join(" ") || "Unnamed Applicant";
    return { value: name, label: name };
  });
  const select = (key) => { setSelectedKey(key); setSidebarOpen(false); };
  const toggle = (key) => setCollapsedGroups((previous) => {
    const next = new Set(previous);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  return (
    <div className="relative -mx-4 -my-8 min-h-[calc(100vh-210px)] overflow-x-hidden bg-[#E5EAFF] text-slate-900 sm:-mx-6 lg:-mx-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <svg className="absolute -right-16 -top-12 h-[850px] w-[850px] sm:h-[1100px] sm:w-[1100px]" viewBox="0 0 1000 1000" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M320 0 C 460 220, 520 480, 950 780 L 1000 780 L 1000 0 Z" fill="url(#swoosh-gradient-admin-questionnaire-1)" opacity="0.8" />
          <path d="M180 0 C 380 260, 420 540, 850 900 L 1000 900 L 1000 0 Z" fill="url(#swoosh-gradient-admin-questionnaire-2)" opacity="0.45" />
          <defs>
            <linearGradient id="swoosh-gradient-admin-questionnaire-1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.75" />
              <stop offset="60%" stopColor="#EEF2FF" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#E2E7FE" stopOpacity="0.1" />
            </linearGradient>
            <linearGradient id="swoosh-gradient-admin-questionnaire-2" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#DEE3FF" stopOpacity="0.05" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="relative z-10">
      <div className="border-b border-[#E2DDD5] bg-[#FAF8F5] px-4 py-3 lg:hidden print:hidden">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Section progress</span>
              <span>{progress.completedSections} of {progress.totalSections} complete</span>
            </div>
            <Progress value={progress.percentage} className="mt-1.5 h-1.5 rounded-full bg-slate-100 [&>div]:bg-[#244D42]" />
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            className="h-8 shrink-0 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700"
          >
            {sidebarOpen ? "Hide steps" : "View steps"}
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1608px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="overflow-hidden rounded-2xl border border-white/70 bg-[#FAF8F5] shadow-[0_4px_24px_rgba(20,40,30,0.03)]">
          <div className="flex flex-col lg:flex-row lg:items-stretch">
            <aside className={`${sidebarOpen ? "block" : "hidden lg:block"} w-full shrink-0 p-5 sm:p-6 lg:w-[320px] lg:border-r lg:border-[#EBE7DF]/80 print:hidden`}>
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Questionnaire</span>
                  <p className="text-sm font-medium text-slate-700">{progress.completedSections} of {progress.totalSections} sections complete</p>
                  <Progress value={progress.percentage} className="mt-2.5 h-1.5 rounded-full bg-slate-100 [&>div]:bg-[#244D42]" />
                  <div className="mt-4">
                    <MatterCrmSyncControls matterId={application.zohoId || application.id} />
                  </div>
                </div>
                <button type="button" aria-label="Close steps" onClick={() => setSidebarOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 lg:hidden"><X className="h-4 w-4" /></button>
              </div>

              <nav aria-label="Questionnaire sections" className="space-y-1">
                {groups.map((group) => {
                  const isStandalone = group.items.length === 1 && group.type === "standalone";
                  const groupIsActive = active?.group.key === group.key;
                  const groupIsOpen = !collapsedGroups.has(group.key);

                  if (isStandalone) {
                    const item = group.items[0];
                    const isActive = active?.item.key === item.key;
                    const isComplete = isQuestionnaireAnswerSectionComplete(item, completion);
                    return (
                      <button
                        key={group.key}
                        type="button"
                        onClick={() => select(item.key)}
                        aria-current={isActive ? "page" : undefined}
                        className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${isActive ? "bg-[#EEF7F2] font-semibold text-[#244D42]" : "text-slate-700 hover:bg-slate-50"}`}
                      >
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${isActive ? "bg-[#244D42] font-bold text-white" : isComplete ? "bg-[#EEF7F2] font-semibold text-[#244D42]" : "border border-slate-200 text-slate-400"}`}>
                          {isComplete && !isActive ? <Check className="h-3.5 w-3.5" /> : "•"}
                        </span>
                        <span className="flex-1 truncate">{group.title}</span>
                        {isComplete && <Check className="h-3.5 w-3.5 shrink-0 text-[#244D42]" />}
                      </button>
                    );
                  }

                  return (
                    <div key={group.key} className="space-y-1">
                      <button
                        type="button"
                        aria-expanded={groupIsOpen}
                        onClick={() => toggle(group.key)}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${groupIsActive ? "bg-slate-100 text-slate-900" : "text-slate-700 hover:bg-slate-50"}`}
                      >
                        <span className="min-w-0 truncate">
                          <span className="block truncate">{group.title}</span>
                          {group.subtitle && <span className="mt-0.5 block truncate text-xs font-normal text-slate-400">{group.subtitle}</span>}
                        </span>
                        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${groupIsOpen ? "rotate-180" : ""}`} />
                      </button>
                      {groupIsOpen && (
                        <ul className="ml-3 space-y-0.5 border-l-2 border-slate-100 pl-3">
                          {group.items.map((item, index) => {
                            const isActive = active?.item.key === item.key;
                            const isComplete = isQuestionnaireAnswerSectionComplete(item, completion);
                            return (
                              <li key={item.key}>
                                <button
                                  type="button"
                                  onClick={() => select(item.key)}
                                  aria-current={isActive ? "page" : undefined}
                                  className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${isActive ? "bg-[#EEF7F2] font-semibold text-[#244D42]" : "text-slate-600 hover:bg-slate-50"}`}
                                >
                                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${isActive ? "bg-[#244D42] font-bold text-white" : isComplete ? "bg-[#EEF7F2] font-semibold text-[#244D42]" : "border border-slate-200 text-slate-400"}`}>
                                    {isComplete && !isActive ? <Check className="h-3 w-3" /> : index + 1}
                                  </span>
                                  <span className="flex-1 truncate">{item.title}</span>
                                  {isComplete && <Check className="h-3 w-3 shrink-0 text-[#244D42]" />}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </nav>
            </aside>

            <main className="min-w-0 flex-1 p-6 sm:p-8 lg:p-10">
              <div className="mx-auto max-w-4xl">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
                  <span>Client answers · Read only</span>
                  <QuestionnairePdfLink matterId={application.id} />
                  {application.stage || application.status ? <span>Current stage: {application.stage || application.status}</span> : null}
                </div>
                <ReviewPage active={active} applicantOptions={applicantOptions} />
                <div className="mt-6 flex items-center justify-between gap-4 print:hidden">
                  <button type="button" disabled={activeIndex === 0} onClick={() => select(items[activeIndex - 1].item.key)} className="flex items-center gap-2 rounded-lg border border-[#dde8e1] bg-white px-4 py-2.5 text-sm disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous</button>
                  <button type="button" disabled={activeIndex >= items.length - 1} onClick={() => select(items[activeIndex + 1].item.key)} className="flex items-center gap-2 rounded-lg bg-[#244D42] px-4 py-2.5 text-sm text-white transition-colors hover:bg-[#1C3E35] disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
