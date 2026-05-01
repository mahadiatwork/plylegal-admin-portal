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
import { formatLabel } from "@/lib/questionnaireSections";

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

// Determine the icon for a section based on its category/key
function getSectionIcon(category, key) {
  if (category === "allApplicants") return Users;
  if (category === "applicant" || category === "nonMigrating") return User;
  const lower = key.toLowerCase();
  if (lower.includes("applicant") || lower.includes("spouse") || lower.includes("partner") || lower.includes("child"))
    return User;
  if (lower.includes("allapplicant")) return Users;
  return FileText;
}

// Sub-section item component
function SubSectionItem({ subSection, isActive, onClick, hasComment }) {
  const fieldCount = countFields(subSection.data);
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
      <span className="flex-1 truncate">{subSection.title}</span>
      {hasComment && (
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" />
      )}
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

// Section group (collapsible) — works with structured section objects
function SectionGroup({
  section,
  activeSectionKey,
  activeSubKey,
  onNavigate,
  commentCount,
}) {
  const [isExpanded, setIsExpanded] = useState(
    activeSectionKey === section.key
  );
  const Icon = getSectionIcon(section.category, section.key);

  const subSections = section.subSections || [];
  const totalFields = countFields(section.data);
  const isSectionActive = activeSectionKey === section.key;

  return (
    <div className="mb-1">
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
          if (!isExpanded && subSections.length > 0) {
            onNavigate(section.key, subSections[0].key);
          } else if (subSections.length === 0) {
            onNavigate(section.key, null);
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
          {section.title}
        </span>
        {commentCount > 0 && (
          <span className="flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-1.5 py-0 text-[9px] font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {commentCount}
          </span>
        )}
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
          {subSections.map((sub) => (
            <SubSectionItem
              key={sub.key}
              subSection={sub}
              isActive={
                activeSectionKey === section.key && activeSubKey === sub.key
              }
              onClick={() => onNavigate(section.key, sub.key)}
              hasComment={false}
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
  sections,
  activeSectionKey,
  activeSubKey,
  onNavigate,
  commentCountBySection = {},
}) {
  if (!sections || sections.length === 0) return null;

  // Group sections by category
  const allApplicantsGroup = sections.filter(
    (s) => s.category === "allApplicants"
  );
  const applicantGroup = sections.filter(
    (s) => s.category === "applicant"
  );
  const nonMigratingGroup = sections.filter(
    (s) => s.category === "nonMigrating"
  );
  const otherSections = sections.filter(
    (s) => s.category === "other"
  );

  const hasApplicantSections =
    applicantGroup.length > 0 || nonMigratingGroup.length > 0;

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
                  (acc, s) => acc + countFields(s.data),
                  0
                )}
              />
              {allApplicantsGroup.map((section) => (
                <SectionGroup
                  key={section.key}
                  section={section}
                  activeSectionKey={activeSectionKey}
                  activeSubKey={activeSubKey}
                  onNavigate={onNavigate}
                  commentCount={commentCountBySection[section.key] || 0}
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
                count={applicantGroup.length + nonMigratingGroup.length}
              />
              {applicantGroup.map((section) => (
                <SectionGroup
                  key={section.key}
                  section={section}
                  activeSectionKey={activeSectionKey}
                  activeSubKey={activeSubKey}
                  onNavigate={onNavigate}
                  commentCount={commentCountBySection[section.key] || 0}
                />
              ))}
              {nonMigratingGroup.map((section) => (
                <SectionGroup
                  key={section.key}
                  section={section}
                  activeSectionKey={activeSectionKey}
                  activeSubKey={activeSubKey}
                  onNavigate={onNavigate}
                  commentCount={commentCountBySection[section.key] || 0}
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
              {otherSections.map((section) => (
                <SectionGroup
                  key={section.key}
                  section={section}
                  activeSectionKey={activeSectionKey}
                  activeSubKey={activeSubKey}
                  onNavigate={onNavigate}
                  commentCount={commentCountBySection[section.key] || 0}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
