"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, Menu, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  buildQuestionnaireAnswerGroups,
  calculateQuestionnaireAnswerProgress,
  isQuestionnaireAnswerSectionComplete,
  isQuestionVisible,
} from "@/lib/questionnaireAnswerModel";
import { formatLabel } from "@/lib/questionnaireSections";

const inputClass = "flex min-h-9 w-full rounded-md border border-[#bdd2c8] bg-[#E9F0FE] px-3 py-2 text-sm text-black";
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
  return <div className="-mx-4 -my-8 min-h-[calc(100vh-210px)] bg-[#E4E9FF] sm:-mx-6 lg:-mx-8">
    <button type="button" onClick={() => setSidebarOpen(true)} className="m-4 flex items-center gap-2 rounded-lg bg-[#4F726B] px-4 py-2 text-sm text-white lg:hidden print:hidden"><Menu className="h-4 w-4" />Questionnaire sections</button>
    {sidebarOpen && <button aria-label="Close questionnaire menu" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-40 bg-black/40 lg:hidden" />}
    <div className="flex items-start">
      <aside className={`${sidebarOpen ? "flex" : "hidden"} fixed inset-y-0 left-0 z-50 w-[88vw] max-w-[20.75rem] shrink-0 flex-col border-r border-white/10 bg-[#4F726B] text-white shadow-[18px_0_50px_rgba(12,43,34,0.14)] lg:sticky lg:z-20 lg:flex lg:w-[20.75rem] print:hidden`} style={{ top: sidebarOpen ? 0 : "var(--matter-header-height, 255px)", height: sidebarOpen ? "100dvh" : "calc(100dvh - var(--matter-header-height, 255px))" }}>
        <div className="px-8 pb-7 pt-7">
          <button aria-label="Close menu" onClick={() => setSidebarOpen(false)} className="mb-3 lg:hidden"><X className="h-5 w-5" /></button>
          <Image src="/Ply_Logo_White.png" alt="PlyLegal" width={210} height={70} priority className="h-14 w-auto" />
          <p className="mt-1 text-sm text-white/70">Client Portal</p>
          <a href={`/matter/${encodeURIComponent(application.id || "")}`} className="mt-6 flex items-center gap-2 text-sm font-medium text-white/80"><ArrowLeft className="h-4 w-4" />Back to Application</a>
        </div>
        <div className="mx-8 border-t border-white/20 py-6">
          <div className="mb-2 flex items-center justify-between text-sm text-[#E6F2EC]"><span>Completion</span><span className="font-semibold">{progress.percentage}%</span></div>
          <Progress value={progress.percentage} className="h-3 rounded-full bg-[#2F4A43] [&>div]:bg-[#A7E0C2]" />
          <p className="mt-3 text-sm font-medium text-[#E6F2EC]">{progress.completedSections} of {progress.totalSections} sections complete</p>
        </div>
        <nav aria-label="Questionnaire sections" className="flex-1 space-y-2 overflow-y-auto px-5 pb-8 pt-1">
          {groups.map((group) => group.items.length === 1 && group.type === "standalone"
            ? <button key={group.key} type="button" onClick={() => select(group.items[0].key)} aria-current={active?.item.key === group.items[0].key ? "page" : undefined} className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-4 text-left text-sm font-semibold hover:bg-white/10 ${active?.item.key === group.items[0].key ? "bg-white/10" : "text-white/80"}`}><Check className={`h-4 w-4 ${isQuestionnaireAnswerSectionComplete(group.items[0], completion) ? "" : "invisible"}`} />{group.title}</button>
            : <div key={group.key} className="space-y-1">
              <button type="button" aria-expanded={!collapsedGroups.has(group.key)} onClick={() => toggle(group.key)} className={`mt-2 flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left text-white/90 hover:bg-white/10 ${active?.group.key === group.key ? "bg-white/10" : ""}`}><span><span className="block text-sm font-semibold">{group.title}</span>{group.subtitle && <span className="block text-xs text-white/70">({group.subtitle})</span>}</span><ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${collapsedGroups.has(group.key) ? "" : "rotate-180"}`} /></button>
              {!collapsedGroups.has(group.key) && <ul className="mb-1 ml-6 mt-1 space-y-1">{group.items.map((item) => <li key={item.key} className="flex items-center gap-3"><span aria-hidden="true" className="text-sm text-[#f2d887]">•</span><button type="button" onClick={() => select(item.key)} aria-current={active?.item.key === item.key ? "page" : undefined} className={`flex min-h-7 flex-1 items-center gap-2 py-1 text-left text-[13px] hover:text-white ${active?.item.key === item.key ? "font-semibold text-white" : isQuestionnaireAnswerSectionComplete(item, completion) ? "text-white/50" : "text-white/80"}`}>{isQuestionnaireAnswerSectionComplete(item, completion) && <Check className="h-3 w-3 shrink-0" />}{item.title}</button></li>)}</ul>}
            </div>)}
        </nav>
      </aside>
      <div className="min-w-0 flex-1 px-5 pb-16 pt-5 sm:px-8 lg:px-12 lg:pt-10">
        <div className="mx-auto max-w-4xl">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600"><span>Client answers · Read only</span>{application.stage || application.status ? <span>Current stage: {application.stage || application.status}</span> : null}</div>
          <ReviewPage active={active} applicantOptions={applicantOptions} />
          <div className="mt-6 flex items-center justify-between gap-4 print:hidden">
            <button type="button" disabled={activeIndex === 0} onClick={() => select(items[activeIndex - 1].item.key)} className="flex items-center gap-2 rounded-lg border border-[#dde8e1] bg-white px-4 py-2.5 text-sm disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous</button>
            <button type="button" disabled={activeIndex >= items.length - 1} onClick={() => select(items[activeIndex + 1].item.key)} className="flex items-center gap-2 rounded-lg bg-[#4F726B] px-4 py-2.5 text-sm text-white disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </div>
  </div>;
}
