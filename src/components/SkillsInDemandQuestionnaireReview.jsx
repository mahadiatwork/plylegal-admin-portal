"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatLabel } from "@/lib/questionnaireSections";
import { calculateTemporaryWorkProgress } from "@/lib/questionnaireProgress";

const MAIN_APPLICANT_SUBPAGES = [
  { key: "details", title: "Details" },
  { key: "other_names", title: "Other Names" },
  { key: "identity", title: "Identity" },
  { key: "contact_details", title: "Contact Details" },
  { key: "employment", title: "Employment" },
  { key: "education", title: "Education" },
  { key: "skills", title: "Skills" },
  { key: "language", title: "Language" },
];

const SPOUSE_SUBPAGES = [
  { key: "details", title: "Details" },
  { key: "other_names", title: "Other Names" },
  { key: "identity", title: "Identity" },
];

const EMPLOYER_NOMINATION_SPOUSE_SUBPAGES = [
  { key: "details", title: "Details" },
  { key: "other_names", title: "Other Names" },
  { key: "identity", title: "Identity" },
  { key: "education", title: "Education" },
  { key: "language", title: "Language" },
];

const CHILD_SUBPAGES = [
  { key: "details", title: "Details" },
  { key: "other_names", title: "Other Names" },
  { key: "identity", title: "Identity" },
  { key: "custody", title: "Custody" },
];

const ALL_APPLICANTS_SUBPAGES = [
  { key: "visas", title: "Visas" },
  { key: "travel", title: "Travel History" },
  { key: "countries_of_residence", title: "Countries of Residence" },
  { key: "health", title: "Health" },
  { key: "character", title: "Character" },
];

const DETAIL_PERSONAL_KEYS = [
  "family_name",
  "given_names",
  "gender",
  "birth_day",
  "birth_month",
  "birth_year",
  "date_of_birth_day",
  "date_of_birth_month",
  "date_of_birth_year",
  "marital_status",
  "marriage_day",
  "marriage_month",
  "marriage_year",
  "date_of_marriage_day",
  "date_of_marriage_month",
  "date_of_marriage_year",
  "marital_status_date_day",
  "marital_status_date_month",
  "marital_status_date_year",
];

const DETAIL_BIRTHPLACE_KEYS = [
  "country_of_birth",
  "birth_country",
  "city_or_town_of_birth",
  "city_of_birth",
  "birth_city",
  "state_or_province_of_birth",
  "state_of_birth",
  "birth_state",
];

const INTERNAL_KEYS = new Set([
  "id",
  "profile_id",
  "profileId",
  "relationship",
  "zohoDependentId",
  "zoho_dependent_id",
  "createdAt",
  "updatedAt",
  "lastUpdated",
]);

const DETAIL_GROUPS = [
  { title: "Personal Information", keys: DETAIL_PERSONAL_KEYS },
  { title: "Birthplace Information", keys: DETAIL_BIRTHPLACE_KEYS },
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function isSkillsInDemandMatter(matterResult, questionnaire) {
  const application = matterResult?.application || {};
  const type = String(application.type || application.reference || "").toLowerCase();
  const visaTypeCode = String(application.visaTypeCode || "").toLowerCase();
  const visaContext = String(questionnaire?.visaContext || "").toLowerCase();

  return (
    visaContext === "186" ||
    visaContext === "482" ||
    visaTypeCode === "temporary-work" ||
    (visaTypeCode === "temporary-work" && !visaContext) ||
    type.includes("186") ||
    type.includes("482") ||
    type.includes("employer nomination") ||
    type.includes("skills in demand")
  );
}

function relationshipLabel(relationship) {
  const map = {
    main_applicant: "Main Applicant",
    spouse: "Spouse/Partner",
    de_facto: "Spouse/Partner",
    child: "Dependent Child",
    other: "Other Applicant",
  };
  return map[relationship] || formatLabel(String(relationship || "Applicant"));
}

function profileDisplayName(profile) {
  const name = [profile?.given_names, profile?.family_name].filter(Boolean).join(" ");
  return name || relationshipLabel(profile?.relationship);
}

function sortProfiles(profiles) {
  const order = { main_applicant: 0, spouse: 1, de_facto: 1, child: 2, other: 3 };
  return [...profiles].sort((a, b) => {
    return (order[a.relationship] ?? 4) - (order[b.relationship] ?? 4);
  });
}

function getQuestionnaireProfiles(questionnaire) {
  const profiles = Array.isArray(questionnaire?.profiles) ? [...questionnaire.profiles] : [];
  const hasMainApplicant = profiles.some((profile) => profile.relationship === "main_applicant");
  const legacyDetails = questionnaire?.mainApplicant?.details || questionnaire?.temporary_work_details || {};

  if (!hasMainApplicant && legacyDetails && Object.keys(legacyDetails).length > 0) {
    profiles.unshift({
      id: "main_applicant",
      relationship: "main_applicant",
      ...legacyDetails,
    });
  }

  return profiles;
}

function normalizeKey(key) {
  return String(key || "")
    .split(".")
    .pop()
    .replace(/^temporary_work_/, "")
    .replace(/-/g, "_")
    .replace(/\s+/g, "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

function normalizeTitle(title) {
  return normalizeKey(title);
}

function slugifyRouteSegment(value) {
  return normalizeKey(value).replace(/_/g, "-");
}

function getSubpageRouteAliases(subpage) {
  const aliases = new Set([
    slugifyRouteSegment(subpage.key),
    slugifyRouteSegment(subpage.title),
  ]);

  if (subpage.key === "other_names") {
    aliases.add("other");
    aliases.add("other-names");
    aliases.add("other-details");
  }
  if (subpage.key === "travel") {
    aliases.add("travel-history");
  }

  return [...aliases].filter(Boolean);
}

function normalizeCompletionKey(key) {
  const raw = String(key || "").trim();
  if (!raw || raw === "updatedAt") return [];

  const [pathPart, queryPart = ""] = raw.replace(/^\/+/, "").split("?", 2);
  const path = pathPart.replace(/^intake\//, "");
  const variants = new Set([raw, raw.replace(/^\/+/, ""), pathPart, path]);

  if (queryPart) {
    const params = new URLSearchParams(queryPart);
    const profileId = params.get("profileId");
    if (profileId) {
      variants.add(`${pathPart}?profileId=${profileId}`);
      variants.add(`${path}?profileId=${profileId}`);
    }
  }

  return [...variants].filter(Boolean);
}

function getCompletedKeys(completion) {
  const keys = new Set();
  Object.entries(completion || {}).forEach(([key, value]) => {
    if (value !== true) return;
    normalizeCompletionKey(key).forEach((variant) => keys.add(variant));
  });
  return keys;
}

function isCandidateCompleted(candidate, completedKeys) {
  const variants = normalizeCompletionKey(candidate);
  return variants.some((variant) => {
    if (completedKeys.has(variant)) return true;
    for (const completedKey of completedKeys) {
      if (completedKey.startsWith(`${variant}__`)) return true;
    }
    return false;
  });
}

function isItemCompleted(item, completedKeys) {
  return (item.completionCandidates || []).some((candidate) =>
    isCandidateCompleted(candidate, completedKeys)
  );
}

function getProfileCompletionCandidates(profile, subpage) {
  const routeAliases = getSubpageRouteAliases(subpage);
  const candidates = [];

  routeAliases.forEach((alias) => {
    if (profile.relationship === "child") {
      candidates.push(`/intake/temporary-work/children/${profile.id}/${alias}`);
      candidates.push(`temporary-work/children/${profile.id}/${alias}`);
    } else {
      const profilePath =
        profile.relationship === "spouse" || profile.relationship === "de_facto"
          ? "spouse-partner"
          : "main-applicant";
      candidates.push(`/intake/temporary-work/${profilePath}/${alias}`);
      candidates.push(`/intake/temporary-work/${profilePath}/${alias}?profileId=${profile.id}`);
      candidates.push(`temporary-work/${profilePath}/${alias}`);
      candidates.push(`temporary-work/${profilePath}/${alias}?profileId=${profile.id}`);
    }
  });

  candidates.push(`temporary_work_${subpage.key}__${profile.id}`);
  candidates.push(`temporary_work_${subpage.key}__profileId=${profile.id}`);
  if (profile.relationship === "main_applicant") {
    candidates.push(`temporary_work_${subpage.key}`);
  }

  return candidates;
}

function getAllApplicantsCompletionCandidates(subpage) {
  const candidates = [];
  getSubpageRouteAliases(subpage).forEach((alias) => {
    candidates.push(`/intake/temporary-work/all-applicants/${alias}`);
    candidates.push(`temporary-work/all-applicants/${alias}`);
  });
  candidates.push(`temporary_work_${subpage.key}`);
  candidates.push(`allApplicants.${subpage.key}`);
  return candidates;
}

function getProfileSubpages(profile, visaContext) {
  if (
    visaContext === "186" &&
    (profile.relationship === "spouse" || profile.relationship === "de_facto")
  ) {
    return EMPLOYER_NOMINATION_SPOUSE_SUBPAGES;
  }
  if (profile.relationship === "spouse" || profile.relationship === "de_facto") {
    return SPOUSE_SUBPAGES;
  }
  if (profile.relationship === "child") {
    return CHILD_SUBPAGES;
  }
  return MAIN_APPLICANT_SUBPAGES;
}

function pickProfileDetails(profile) {
  if (!profile || typeof profile !== "object") return {};
  return Object.fromEntries(
    Object.entries(profile).filter(([key, value]) => {
      if (INTERNAL_KEYS.has(key)) return false;
      if (value === undefined || value === null) return false;
      if (typeof value === "object") return false;
      return true;
    })
  );
}

function indexSubSections(section) {
  const map = new Map();
  (section?.subSections || []).forEach((subSection) => {
    const normalizedFromKey = normalizeKey(subSection.key);
    const normalizedFromTitle = normalizeTitle(subSection.title);
    map.set(normalizedFromKey, subSection);
    map.set(normalizedFromTitle, subSection);
  });
  return map;
}

function findProfileSectionData(profile, profileSection, questionnaire, subpage) {
  const subSectionMap = indexSubSections(profileSection);
  const direct = subSectionMap.get(subpage.key);

  const profileData = questionnaire?.profiles_data?.[profile.id] || {};
  const directProfileData =
    profileData[subpage.key] ||
    profileData[normalizeTitle(subpage.title)] ||
    null;

  const legacyKey = `temporary_work_${subpage.key}`;
  const legacyData =
    profile.relationship === "main_applicant" ? questionnaire?.[legacyKey] : null;

  let data = direct?.data || directProfileData || legacyData || {};
  if (subpage.key === "details") {
    data = { ...pickProfileDetails(profile), ...(data || {}) };
  }

  return data || {};
}

function findAllApplicantsData(allApplicantsSection, questionnaire, subpage) {
  const subSectionMap = indexSubSections(allApplicantsSection);
  const direct = subSectionMap.get(subpage.key);
  const allApplicants = questionnaire?.allApplicants || {};
  const legacyData = questionnaire?.[`temporary_work_${subpage.key}`];

  return (
    direct?.data ||
    allApplicants[subpage.key] ||
    allApplicants[normalizeTitle(subpage.title)] ||
    legacyData ||
    {}
  );
}

function buildIncludedApplicantsData(questionnaire) {
  const profiles = sortProfiles(getQuestionnaireProfiles(questionnaire));
  const nonMigratingMembers = Array.isArray(questionnaire?.non_migrating_members)
    ? questionnaire.non_migrating_members
    : [];

  return {
    applicants: profiles.map((profile) => ({
      name: profileDisplayName(profile),
      role: relationshipLabel(profile.relationship),
      gender: profile.gender || "",
      date_of_birth: [profile.birth_day, displayMonthValue(profile.birth_month), profile.birth_year]
        .filter(Boolean)
        .join(" "),
    })),
    non_migrating_family_members: nonMigratingMembers.map((member) => ({
      name:
        [member.given_names, member.family_name].filter(Boolean).join(" ") ||
        relationshipLabel(member.relationship),
      role: relationshipLabel(member.relationship),
      relationship_status: member.relationship_status || "",
      has_current_passport: member.has_current_passport || "",
    })),
  };
}

function buildNavigation(questionnaire, sections) {
  const visaContext = String(questionnaire?.visaContext || "");
  const profiles = sortProfiles(getQuestionnaireProfiles(questionnaire));
  const profileSections = new Map();
  sections
    .filter((section) => section.category === "applicant" || section.category === "nonMigrating")
    .forEach((section) => {
      if (section.profileId) profileSections.set(section.profileId, section);
    });

  const groups = [
    {
      key: "start",
      type: "standalone",
      title: "Getting Started",
      items: [
        {
          key: "start",
          title: "Getting Started",
          data: { status: questionnaire?.started ? "Started" : "Not started" },
          completionCandidates: ["/intake/temporary-work/start", "temporary-work/start"],
          groupTitle: "Getting Started",
        },
      ],
    },
    {
      key: "applicationProfile",
      type: "standalone",
      title: "Included Applicants",
      items: [
        {
          key: "applicationProfile",
          title: "Included Applicants",
          data: buildIncludedApplicantsData(questionnaire),
          completionCandidates: ["/intake/temporary-work/profile", "temporary-work/profile"],
          groupTitle: "Application Profile",
          view: "includedApplicants",
        },
      ],
    },
  ];

  profiles.forEach((profile) => {
    const profileSection = profileSections.get(profile.id);
    const role = relationshipLabel(profile.relationship);
    const subpages = getProfileSubpages(profile, visaContext);

    groups.push({
      key: `profile:${profile.id}`,
      type: "profile",
      title: profileDisplayName(profile),
      subtitle: role,
      items: subpages.map((subpage) => ({
        ...subpage,
        key: `profile:${profile.id}:${subpage.key}`,
        data: findProfileSectionData(profile, profileSection, questionnaire, subpage),
        completionCandidates: getProfileCompletionCandidates(profile, subpage),
        relationship: profile.relationship,
        groupTitle: profileDisplayName(profile),
      })),
    });
  });

  const allApplicantsSection = sections.find((section) => section.category === "allApplicants");
  groups.push({
    key: "allApplicants",
    type: "allApplicants",
    title: "All Applicants",
    items: ALL_APPLICANTS_SUBPAGES.map((subpage) => ({
      ...subpage,
      key: `allApplicants:${subpage.key}`,
      data: findAllApplicantsData(allApplicantsSection, questionnaire, subpage),
      completionCandidates: getAllApplicantsCompletionCandidates(subpage),
      groupTitle: "All Applicants",
    })),
  });

  groups.push({
    key: "submit",
    type: "submit",
    title: "Submit",
    items: [
      {
        key: "submit",
        title: "Submit",
        data: {},
        groupTitle: "Submit",
      },
    ],
  });

  return groups;
}

function flattenNavigation(groups) {
  return groups.flatMap((group) => group.items.map((item) => ({ group, item })));
}

function SectionStatusMarker({ active, completed }) {
  return (
    <span className="mt-0.5 grid w-11 shrink-0 grid-cols-[0.5rem_1rem] items-center gap-3">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          active ? "bg-[#ffe58c]" : "bg-[#ffe58c]/90"
        )}
      />
      {completed ? (
        <Check className="h-4 w-4 text-white/70" strokeWidth={2.5} />
      ) : (
        <span aria-hidden="true" className="h-4 w-4" />
      )}
    </span>
  );
}

function SidebarGroup({ group, activeKey, onSelect, completedKeys }) {
  const activeInGroup = group.items.some((item) => item.key === activeKey);

  if (group.type === "submit") {
    const submitItem = group.items[0];
    return (
      <button
        type="button"
        onClick={() => onSelect(submitItem.key)}
        className={cn(
          "w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-white transition-colors",
          activeInGroup ? "bg-white/10 text-white" : "hover:bg-white/10"
        )}
      >
        {group.title}
      </button>
    );
  }

  if (group.type === "standalone") {
    const item = group.items[0];
    const active = item.key === activeKey;
    const completed = isItemCompleted(item, completedKeys);
    return (
      <button
        type="button"
        onClick={() => onSelect(item.key)}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold transition-colors",
          active
            ? "bg-white/10 text-white"
            : "text-white/85 hover:bg-white/10 hover:text-white"
        )}
        aria-current={active ? "page" : undefined}
      >
        <SectionStatusMarker active={active} completed={completed} />
        <span className="min-w-0 truncate">{group.title}</span>
      </button>
    );
  }

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold text-white transition-colors hover:bg-white/10">
        <span className="min-w-0">
          <span className="block truncate">{group.title}</span>
          {group.subtitle && (
            <span className="block truncate text-xs font-semibold text-white/65">
              {group.subtitle}
            </span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-white/75" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-1 pl-4">
          {group.items.map((item) => {
            const active = item.key === activeKey;
            const completed = isItemCompleted(item, completedKeys);
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect(item.key)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-xs font-semibold transition-colors",
                  active
                    ? "bg-white/10 text-white"
                    : "text-white/85 hover:bg-white/10 hover:text-white"
                )}
                aria-current={active ? "page" : undefined}
              >
                <SectionStatusMarker active={active} completed={completed} />
                <span className="min-w-0 truncate">{item.title}</span>
              </button>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function QuestionnaireReviewSidebar({
  groups,
  activeKey,
  onSelect,
  questionnaire,
  completion,
  percentage,
}) {
  const progress = useMemo(
    () => calculateTemporaryWorkProgress(completion, questionnaire),
    [completion, questionnaire]
  );
  const completedCount = progress.completedSections;
  const totalCount = progress.totalSections;
  const progressPercentage = percentage ?? progress.percentage;
  const completedKeys = useMemo(() => getCompletedKeys(completion), [completion]);

  return (
    <aside
      className="flex w-full shrink-0 flex-col bg-[#4F726B] text-white lg:sticky lg:z-20 lg:w-[17.5rem]"
      style={{
        top: "var(--matter-header-height, 255px)",
        height: "calc(100vh - var(--matter-header-height, 255px))",
      }}
    >
      <div className="border-b border-white/10 px-6 py-7">
        <Image
          src="/Ply_Logo_White.png"
          alt="PlyLegal"
          width={210}
          height={70}
          className="h-auto w-44"
          priority
        />
        <p className="mt-3 text-sm text-white/70">Client Portal</p>
      </div>

      <div className="border-b border-white/10 px-6 py-7">
        <div className="mb-2 flex items-center justify-between text-sm font-medium text-white/70">
          <span>Completion</span>
          <span className="font-semibold text-white">{progressPercentage || 0}%</span>
        </div>
        <Progress
          value={progressPercentage || 0}
          className="h-2 bg-white/25 [&>div]:bg-white"
        />
        <p className="mt-3 text-xs font-semibold text-white">
          {completedCount} of {totalCount} sections complete
        </p>
      </div>

      <ScrollArea className="flex-1">
        <nav className="space-y-3 px-4 py-6">
          {groups.map((group) => (
            <SidebarGroup
              key={group.key}
              group={group}
              activeKey={activeKey}
              onSelect={onSelect}
              completedKeys={completedKeys}
            />
          ))}
        </nav>
      </ScrollArea>
    </aside>
  );
}

function isEmptyData(data) {
  if (data === null || data === undefined) return true;
  if (typeof data !== "object") return data === "";
  if (Array.isArray(data)) return data.length === 0;
  return Object.keys(data).filter((key) => !INTERNAL_KEYS.has(key)).length === 0;
}

function displayValue(value) {
  if (value === null || value === undefined) return "";
  if (value === true) return "Yes";
  if (value === false) return "No";
  return String(value);
}

function displayMonthValue(value) {
  const text = displayValue(value).trim();
  const monthNumber = Number(text);
  if (Number.isInteger(monthNumber) && monthNumber >= 1 && monthNumber <= 12) {
    return MONTH_NAMES[monthNumber - 1];
  }
  return text;
}

function normalComparable(value) {
  return displayValue(value).trim().toLowerCase();
}

function inferRadioOptions(key, value) {
  const lowerKey = String(key || "").toLowerCase();
  const lowerValue = normalComparable(value);

  if (lowerKey.includes("gender") || ["male", "female", "other"].includes(lowerValue)) {
    return ["Male", "Female", "Other"];
  }

  if (
    typeof value === "boolean" ||
    ["yes", "no", "true", "false"].includes(lowerValue) ||
    lowerKey.startsWith("has_") ||
    lowerKey.startsWith("is_") ||
    lowerKey.startsWith("have_") ||
    lowerKey.includes("_ever_") ||
    lowerKey.includes("currently")
  ) {
    return ["Yes", "No"];
  }

  return null;
}

function valuesMatch(option, value) {
  const normalizedOption = option.toLowerCase();
  const normalizedValue = normalComparable(value);
  if (normalizedValue === "true") return normalizedOption === "yes";
  if (normalizedValue === "false") return normalizedOption === "no";
  return normalizedOption === normalizedValue;
}

function fieldLabel(key) {
  const overrides = {
    family_name: "Family Name",
    given_names: "Given Names",
    marital_status: "What is your marital status?",
    country_of_birth: "Country of Birth",
    city_or_town_of_birth: "City or Town of Birth",
    state_or_province_of_birth: "State or Province of Birth",
    birth_country: "Country of Birth",
    birth_city: "City or Town of Birth",
    birth_state: "State or Province of Birth",
    city_of_birth: "City or Town of Birth",
    state_of_birth: "State or Province of Birth",
  };
  return overrides[key] || formatLabel(key);
}

function ReadOnlyRadioField({ label, value, options }) {
  return (
    <div className="space-y-2 md:col-span-2">
      <p className="text-[15px] font-medium text-black">{label}</p>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {options.map((option) => {
          const checked = valuesMatch(option, value);
          return (
            <div key={option} className="flex items-center gap-2 text-[15px] text-black">
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border",
                  checked ? "border-[#4F726B]" : "border-[#5b8574]/80"
                )}
              >
                {checked && <span className="h-2.5 w-2.5 rounded-full bg-[#4F726B]" />}
              </span>
              <span>{option}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReadOnlyTextField({ label, value }) {
  const text = displayValue(value);
  const useTextarea = text.length > 110 || text.includes("\n");

  return (
    <label className="block space-y-1.5 md:col-span-2">
      <span className="text-[15px] font-medium text-black">{label}</span>
      {useTextarea ? (
        <textarea
          readOnly
          value={text}
          rows={4}
          className="min-h-[6rem] w-full resize-none rounded-lg border border-[#bdd2c8] bg-[#E9F0FE] px-3.5 py-2.5 text-[15px] text-black shadow-inner shadow-white/70 outline-none"
        />
      ) : (
        <input
          readOnly
          value={text}
          className="h-11 w-full rounded-lg border border-[#bdd2c8] bg-[#E9F0FE] px-3.5 text-[15px] text-black shadow-inner shadow-white/70 outline-none"
        />
      )}
    </label>
  );
}

function ReadOnlySelectLikeField({ label, value }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[15px] font-medium text-black">{label}</span>
      <span className="flex h-11 w-full items-center justify-between rounded-lg border border-[#bdd2c8] bg-[#E9F0FE] px-3.5 text-[15px] text-black shadow-inner shadow-white/70">
        <span className="truncate">{displayValue(value)}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[#6f8f82]" />
      </span>
    </label>
  );
}

function DatePartFields({ label, group }) {
  return (
    <div className="space-y-2 md:col-span-2">
      <p className="text-[15px] font-medium text-black">{label}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ReadOnlySelectLikeField label="Day" value={group.day} />
        <ReadOnlySelectLikeField label="Month" value={displayMonthValue(group.month)} />
        <ReadOnlySelectLikeField label="Year" value={group.year} />
      </div>
    </div>
  );
}

function collectDateGroups(entries) {
  const groups = new Map();
  entries.forEach(([key, value]) => {
    const match = String(key).match(/^(.*?)(?:_date_of_birth|_dob|_birth|birth|date_of_birth)?_(day|month|year)$/i);
    if (!match) return;

    let prefix = match[1] || "birth";
    const part = match[2].toLowerCase();
    if (key.startsWith("birth_")) prefix = "birth";
    if (key.startsWith("date_of_birth_")) prefix = "date_of_birth";

    if (!groups.has(prefix)) {
      groups.set(prefix, { keys: new Set(), day: "", month: "", year: "" });
    }
    const group = groups.get(prefix);
    group.keys.add(key);
    group[part] = value;
  });

  return groups;
}

function dateGroupLabel(prefix) {
  if (prefix === "birth" || prefix === "date_of_birth" || prefix === "dob") {
    return "Date of Birth";
  }
  if (prefix === "marriage" || prefix === "date_of_marriage") {
    return "Date of Marriage";
  }
  if (prefix === "marital_status_date") {
    return "Date of Marriage";
  }
  return formatLabel(prefix);
}

function ReadOnlySimpleField({ fieldKey, value }) {
  const options = inferRadioOptions(fieldKey, value);
  if (options) {
    return (
      <ReadOnlyRadioField
        label={fieldLabel(fieldKey)}
        value={value}
        options={options}
      />
    );
  }
  return <ReadOnlyTextField label={fieldLabel(fieldKey)} value={value} />;
}

function ReadOnlyArrayField({ fieldKey, value }) {
  if (value.length === 0) {
    return <ReadOnlyTextField label={fieldLabel(fieldKey)} value="" />;
  }

  if (value.every((item) => typeof item !== "object" || item === null)) {
    return (
      <div className="space-y-3 md:col-span-2">
        <p className="text-[15px] font-medium text-black">{fieldLabel(fieldKey)}</p>
        {value.map((item, index) => (
          <input
            key={`${fieldKey}-${index}`}
            readOnly
            value={displayValue(item)}
            className="h-11 w-full rounded-lg border border-[#bdd2c8] bg-[#E9F0FE] px-3.5 text-[15px] text-black shadow-inner shadow-white/70 outline-none"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 md:col-span-2">
      <h3 className="border-b border-[#dde8e1] pb-2 text-lg font-medium text-black">
        {fieldLabel(fieldKey)}
      </h3>
      {value.map((item, index) => (
        <div key={`${fieldKey}-${index}`} className="rounded-lg border border-[#dde8e1] bg-[#fbfdfb] p-4">
          <p className="mb-4 text-xs font-semibold uppercase text-black">
            Item {index + 1}
          </p>
          <ReadOnlyFieldGrid data={item} />
        </div>
      ))}
    </div>
  );
}

function ReadOnlyObjectField({ fieldKey, value }) {
  return (
    <div className="space-y-4 md:col-span-2">
      <h3 className="border-b border-[#dde8e1] pb-2 text-lg font-medium text-black">
        {fieldLabel(fieldKey)}
      </h3>
      <ReadOnlyFieldGrid data={value} />
    </div>
  );
}

function ReadOnlyFieldGrid({ data }) {
  if (!data || typeof data !== "object") {
    return <ReadOnlySimpleField fieldKey="answer" value={data} />;
  }

  const entries = Object.entries(data).filter(([key]) => !INTERNAL_KEYS.has(key));
  const dateGroups = collectDateGroups(entries);
  const renderedDateGroups = new Set();

  if (entries.length === 0) {
    return <EmptyAnswers />;
  }

  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
      {entries.map(([key, value]) => {
        const dateGroupEntry = [...dateGroups.entries()].find(([, group]) => group.keys.has(key));
        if (dateGroupEntry) {
          const [prefix, group] = dateGroupEntry;
          if (renderedDateGroups.has(prefix)) return null;
          renderedDateGroups.add(prefix);
          return (
            <DatePartFields
              key={prefix}
              label={dateGroupLabel(prefix)}
              group={group}
            />
          );
        }

        if (Array.isArray(value)) {
          return <ReadOnlyArrayField key={key} fieldKey={key} value={value} />;
        }
        if (value && typeof value === "object") {
          return <ReadOnlyObjectField key={key} fieldKey={key} value={value} />;
        }
        return <ReadOnlySimpleField key={key} fieldKey={key} value={value} />;
      })}
    </div>
  );
}

function splitIntoDisplayGroups(item) {
  const data = item?.data || {};
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return [{ title: item.title, data }];
  }

  if (normalizeKey(item.title) !== "details") {
    return [{ title: item.title, data }];
  }

  const consumedKeys = new Set();
  const groups = DETAIL_GROUPS.map((group) => {
    const groupData = {};
    group.keys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        groupData[key] = data[key];
        consumedKeys.add(key);
      }
    });
    return { title: group.title, data: groupData };
  }).filter((group) => !isEmptyData(group.data));

  const remaining = Object.fromEntries(
    Object.entries(data).filter(([key]) => !consumedKeys.has(key) && !INTERNAL_KEYS.has(key))
  );

  if (!isEmptyData(remaining)) {
    groups.push({ title: "Other Details", data: remaining });
  }

  return groups.length > 0 ? groups : [{ title: item.title, data }];
}

function EmptyAnswers() {
  return (
    <div className="rounded-lg border border-dashed border-[#bdd2c8] bg-[#E9F0FE] px-4 py-6 text-sm text-black">
      No answers recorded for this section yet.
    </div>
  );
}

function sectionDescription(group, item) {
  const key = normalizeKey(item?.title);
  if (item?.view === "includedApplicants") {
    return "Review the people included in this application.";
  }
  if (group?.type === "allApplicants") {
    return "Review answers that apply across every person included in this application.";
  }
  if (key === "details" && group?.subtitle === "Spouse/Partner") {
    return "In the Spouse or Partner section, please review the details for the partner included in this application.";
  }
  if (key === "details" && group?.subtitle === "Dependent Child") {
    return "In the Dependent Child section, please review the details for the child included in this application.";
  }
  if (key === "details") {
    return "In the Main Applicant section, please provide details about the person who is intending to be the primary applicant.";
  }
  if (key === "identity") {
    return "Review identity, passport, and citizenship answers for this applicant.";
  }
  return "";
}

function PersonSummaryCard({ person }) {
  const details = [
    person.role,
    person.gender,
    person.date_of_birth ? `DOB: ${person.date_of_birth}` : "",
    person.relationship_status,
    person.has_current_passport ? `Passport: ${displayValue(person.has_current_passport)}` : "",
  ].filter(Boolean);

  return (
    <article className="rounded-lg border border-[#dde8e1] bg-white px-4 py-4">
      <p className="text-base font-semibold text-black">{person.name || person.role || "Person"}</p>
      {details.length > 0 && (
        <p className="mt-1 text-sm leading-6 text-black">{details.join(" · ")}</p>
      )}
    </article>
  );
}

function IncludedApplicantsReview({ data }) {
  const applicants = Array.isArray(data?.applicants) ? data.applicants : [];
  const nonMigratingMembers = Array.isArray(data?.non_migrating_family_members)
    ? data.non_migrating_family_members
    : [];
  const total = applicants.length + nonMigratingMembers.length;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="border-b border-[#dde8e1] pb-3 text-xl font-medium text-black">
          Included Applicants
        </h2>
        {applicants.length > 0 ? (
          <div className="space-y-3">
            {applicants.map((person, index) => (
              <PersonSummaryCard key={`${person.name || "applicant"}-${index}`} person={person} />
            ))}
          </div>
        ) : (
          <EmptyAnswers />
        )}
      </section>

      {nonMigratingMembers.length > 0 && (
        <section className="space-y-3">
          <h2 className="border-b border-[#dde8e1] pb-3 text-xl font-medium text-black">
            Non-migrating Family Members
          </h2>
          <div className="space-y-3">
            {nonMigratingMembers.map((person, index) => (
              <PersonSummaryCard key={`${person.name || "family-member"}-${index}`} person={person} />
            ))}
          </div>
        </section>
      )}

      <div className="rounded-lg border border-[#bdd2c8] bg-[#E9F0FE] px-4 py-3 text-sm font-semibold text-black">
        {total} {total === 1 ? "person" : "persons"} included
      </div>
    </div>
  );
}

function ReviewCard({ active }) {
  if (!active) return null;

  const { group, item } = active;
  const groups = splitIntoDisplayGroups(item);
  const description = sectionDescription(group, item);

  return (
    <div className="mx-auto w-full max-w-[66rem] rounded-lg border border-[#dfe8e2] bg-white px-6 py-7 shadow-[0_24px_80px_rgba(25,55,43,0.10)] sm:px-8 sm:py-8 lg:px-10">
      <div className="mb-8">
        <h1 className="text-[26px] font-bold leading-tight text-black sm:text-[28px]">
          {group.type === "submit" ? (
            "Submit"
          ) : (
            <>
              {item.title} <span className="font-semibold">&mdash;</span> {group.title}
            </>
          )}
        </h1>
        {description && (
          <p className="mt-3 max-w-4xl text-[15px] leading-6 text-black">
            {description}
          </p>
        )}
      </div>

      {isEmptyData(item.data) ? (
        <EmptyAnswers />
      ) : item.view === "includedApplicants" ? (
        <IncludedApplicantsReview data={item.data} />
      ) : (
        <div className="space-y-8">
          {groups.map((groupItem) => (
            <section key={groupItem.title} className="space-y-6">
              <h2 className="border-b border-[#dde8e1] pb-3 text-xl font-medium text-black">
                {groupItem.title}
              </h2>
              <ReadOnlyFieldGrid data={groupItem.data} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SkillsInDemandQuestionnaireReview({
  questionnaire,
  sections,
  completion,
  percentage,
}) {
  const groups = useMemo(
    () => buildNavigation(questionnaire, sections || []),
    [questionnaire, sections]
  );
  const flatNavigation = useMemo(() => flattenNavigation(groups), [groups]);
  const [activeKey, setActiveKey] = useState(flatNavigation[0]?.item.key || null);
  const activeIndex = flatNavigation.findIndex(({ item }) => item.key === activeKey);
  const active = activeIndex !== -1 ? flatNavigation[activeIndex] : flatNavigation[0];

  const prevItem = activeIndex > 0 ? flatNavigation[activeIndex - 1] : null;
  const nextItem = activeIndex !== -1 && activeIndex < flatNavigation.length - 1 ? flatNavigation[activeIndex + 1] : null;

  return (
    <div className="-mx-4 -my-8 min-h-[calc(100vh-210px)] bg-[#E4E9FF] sm:-mx-6 lg:-mx-8 print:hidden">
      <div className="flex min-h-[calc(100vh-210px)] flex-col lg:flex-row items-start">
        <QuestionnaireReviewSidebar
          groups={groups}
          activeKey={active?.item.key}
          onSelect={setActiveKey}
          questionnaire={questionnaire}
          completion={completion}
          percentage={percentage}
        />

        <main className="relative z-0 min-w-0 flex-1 overflow-x-hidden px-5 py-10 sm:px-8 lg:px-12 lg:py-16">
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-0 hidden w-[42%] overflow-hidden lg:block">
            <div className="absolute right-0 top-0 h-full w-full bg-[#E4E9FF]" />
            <div className="absolute right-0 top-[8%] h-28 w-[115%] rounded-l-[999px] bg-[#E4E9FF]" />
            <div className="absolute right-0 top-[26%] h-56 w-[118%] rounded-l-[999px] bg-[#E4E9FF]" />
            <div className="absolute right-0 top-[72%] h-36 w-[112%] rounded-l-[999px] bg-[#E4E9FF]" />
          </div>

          <div className="relative z-[1] mx-auto w-full max-w-[66rem]">
            <ReviewCard active={active} />
            
            <div className="mt-8 flex items-center justify-between pb-10">
              {prevItem ? (
                <button
                  onClick={() => {
                    setActiveKey(prevItem.item.key);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="flex items-center gap-2 rounded-lg border border-[#dfe8e2] bg-white px-5 py-2.5 text-[15px] font-medium text-black shadow-sm transition-colors hover:bg-gray-50 focus:outline-none"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous: {prevItem.item.title}
                </button>
              ) : <div />}

              {nextItem ? (
                <button
                  onClick={() => {
                    setActiveKey(nextItem.item.key);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="flex items-center gap-2 rounded-lg border border-[#dfe8e2] bg-[#4F726B] px-5 py-2.5 text-[15px] font-medium text-white shadow-sm transition-colors hover:bg-[#4F726B] focus:outline-none"
                >
                  Next: {nextItem.item.title}
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : <div />}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
