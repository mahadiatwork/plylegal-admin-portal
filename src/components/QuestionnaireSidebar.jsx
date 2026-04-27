"use client";

import { useState } from "react";
import {
  ChevronDown,
  Users,
  User,
  FileText,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

// Format key from camelCase/snake_case to Title Case
function formatLabel(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

// Count leaf values in a data tree
function countFields(data) {
  if (data === null || data === undefined || data === "") return 0;
  if (typeof data !== "object") return 1;
  if (Array.isArray(data)) {
    if (data.length === 0) return 0;
    return data.reduce((sum, item) => sum + countFields(item), 0);
  }
  return Object.entries(data)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .reduce((sum, [, value]) => sum + countFields(value), 0);
}

// Determine the icon for a section based on its key
function getSectionIcon(key) {
  const lower = key.toLowerCase();
  if (lower.includes("allapplicant") || lower.includes("all_applicant"))
    return Users;
  if (
    lower.includes("applicant") ||
    lower.includes("spouse") ||
    lower.includes("partner") ||
    lower.includes("dependant") ||
    lower.includes("child") ||
    lower.includes("sponsor")
  )
    return User;
  return FileText;
}

// Categorize sections into groups
function categorizeSections(sections) {
  const allApplicantsGroup = [];
  const mainApplicantGroup = [];
  const otherApplicantGroups = [];
  const otherSections = [];

  sections.forEach(([key, data]) => {
    const lower = key.toLowerCase();

    if (lower === "allapplicants" || lower === "all_applicants") {
      allApplicantsGroup.push([key, data]);
    } else if (lower === "mainapplicant" || lower === "main_applicant") {
      mainApplicantGroup.push([key, data]);
    } else if (
      lower.includes("applicant") ||
      lower.includes("spouse") ||
      lower.includes("partner") ||
      lower.includes("dependant") ||
      lower.includes("child") ||
      lower.includes("sponsor")
    ) {
      otherApplicantGroups.push([key, data]);
    } else {
      otherSections.push([key, data]);
    }
  });

  return {
    allApplicantsGroup,
    mainApplicantGroup,
    otherApplicantGroups,
    otherSections,
  };
}

// Sub-section item component
function SubSectionItem({ subKey, subData, isActive, onClick }) {
  const fieldCount = countFields(subData);
  const hasData = fieldCount > 0;

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-sm
        transition-all duration-200 group
        ${
          isActive
            ? "bg-[#285646]/15 text-[#285646] font-medium shadow-sm"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        }
      `}
    >
      {hasData ? (
        <CheckCircle2
          className={`h-3.5 w-3.5 flex-shrink-0 ${
            isActive ? "text-[#285646]" : "text-emerald-400"
          }`}
        />
      ) : (
        <Circle className="h-3.5 w-3.5 flex-shrink-0 text-gray-300" />
      )}
      <span className="flex-1 truncate">{formatLabel(subKey)}</span>
      {hasData && (
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
            isActive
              ? "bg-[#285646]/20 text-[#285646]"
              : "bg-gray-100 text-gray-500 group-hover:bg-gray-200"
          }`}
        >
          {fieldCount}
        </span>
      )}
    </button>
  );
}

// Section group (collapsible)
function SectionGroup({
  sectionKey,
  sectionData,
  activeSectionKey,
  activeSubKey,
  onNavigate,
}) {
  const [isExpanded, setIsExpanded] = useState(
    activeSectionKey === sectionKey
  );
  const Icon = getSectionIcon(sectionKey);

  const subSections =
    typeof sectionData === "object" && !Array.isArray(sectionData)
      ? Object.entries(sectionData).filter(
          ([, v]) => v !== null && v !== undefined && v !== ""
        )
      : [];

  const totalFields = countFields(sectionData);
  const isSectionActive = activeSectionKey === sectionKey;

  return (
    <div className="mb-1">
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
          if (!isExpanded && subSections.length > 0) {
            onNavigate(sectionKey, subSections[0][0]);
          } else if (subSections.length === 0) {
            onNavigate(sectionKey, null);
          }
        }}
        className={`
          w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium
          transition-all duration-200
          ${
            isSectionActive
              ? "bg-[#285646]/10 text-[#285646]"
              : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
          }
        `}
      >
        <Icon
          className={`h-4 w-4 flex-shrink-0 ${
            isSectionActive ? "text-[#285646]" : "text-gray-400"
          }`}
        />
        <span className="flex-1 text-left truncate">
          {formatLabel(sectionKey)}
        </span>
        {totalFields > 0 && (
          <Badge
            variant="secondary"
            className={`text-[10px] px-1.5 py-0 h-5 ${
              isSectionActive
                ? "bg-[#285646]/15 text-[#285646] border-[#285646]/20"
                : ""
            }`}
          >
            {totalFields}
          </Badge>
        )}
        {subSections.length > 0 && (
          <span
            className={`transform transition-transform duration-200 ${
              isExpanded ? "rotate-0" : "-rotate-90"
            }`}
          >
            <ChevronDown
              className={`h-4 w-4 ${
                isSectionActive ? "text-[#285646]" : "text-gray-400"
              }`}
            />
          </span>
        )}
      </button>

      {/* Sub-sections */}
      {isExpanded && subSections.length > 0 && (
        <div className="ml-3 pl-3 border-l-2 border-gray-200 mt-1 space-y-0.5">
          {subSections.map(([subKey, subData]) => (
            <SubSectionItem
              key={subKey}
              subKey={subKey}
              subData={subData}
              isActive={
                activeSectionKey === sectionKey && activeSubKey === subKey
              }
              onClick={() => onNavigate(sectionKey, subKey)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Category header
function CategoryHeader({ icon: Icon, title, count }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 mb-1">
      <Icon className="h-4 w-4 text-[#285646]" />
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        {title}
      </span>
      {count > 0 && (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#285646]/10 text-[#285646]">
          {count}
        </span>
      )}
    </div>
  );
}

export default function QuestionnaireSidebar({
  data,
  activeSectionKey,
  activeSubKey,
  onNavigate,
}) {
  if (!data) return null;

  const sections = Object.entries(data).filter(
    ([key]) => key !== "visaContext" && key !== "id" && key !== "profiles"
  );

  const {
    allApplicantsGroup,
    mainApplicantGroup,
    otherApplicantGroups,
    otherSections,
  } = categorizeSections(sections);

  const hasApplicantSections =
    mainApplicantGroup.length > 0 || otherApplicantGroups.length > 0;

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Sidebar Header */}
      <div className="px-4 py-4 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#285646]" />
          Questionnaire
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          {sections.length} sections • Read-only review
        </p>
      </div>

      {/* Scrollable content */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {/* All Applicants Section */}
          {allApplicantsGroup.length > 0 && (
            <div className="mb-3">
              <CategoryHeader
                icon={Users}
                title="All Applicants"
                count={allApplicantsGroup.reduce(
                  (acc, [, d]) => acc + countFields(d),
                  0
                )}
              />
              {allApplicantsGroup.map(([key, sectionData]) => (
                <SectionGroup
                  key={key}
                  sectionKey={key}
                  sectionData={sectionData}
                  activeSectionKey={activeSectionKey}
                  activeSubKey={activeSubKey}
                  onNavigate={onNavigate}
                />
              ))}
              <div className="mx-3 my-2 border-b border-gray-100" />
            </div>
          )}

          {/* Individual Applicant Sections */}
          {hasApplicantSections && (
            <div className="mb-3">
              <CategoryHeader
                icon={User}
                title="Applicants"
                count={
                  mainApplicantGroup.length + otherApplicantGroups.length
                }
              />
              {mainApplicantGroup.map(([key, sectionData]) => (
                <SectionGroup
                  key={key}
                  sectionKey={key}
                  sectionData={sectionData}
                  activeSectionKey={activeSectionKey}
                  activeSubKey={activeSubKey}
                  onNavigate={onNavigate}
                />
              ))}
              {otherApplicantGroups.map(([key, sectionData]) => (
                <SectionGroup
                  key={key}
                  sectionKey={key}
                  sectionData={sectionData}
                  activeSectionKey={activeSectionKey}
                  activeSubKey={activeSubKey}
                  onNavigate={onNavigate}
                />
              ))}
              <div className="mx-3 my-2 border-b border-gray-100" />
            </div>
          )}

          {/* Other Sections */}
          {otherSections.length > 0 && (
            <div>
              <CategoryHeader
                icon={FileText}
                title="Other Sections"
                count={otherSections.length}
              />
              {otherSections.map(([key, sectionData]) => (
                <SectionGroup
                  key={key}
                  sectionKey={key}
                  sectionData={sectionData}
                  activeSectionKey={activeSectionKey}
                  activeSubKey={activeSubKey}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
