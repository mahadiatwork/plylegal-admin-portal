"use client";

import { Users, Folder, FileText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function QuestionnaireSidebar({
  sections,
  activeCategory,
  onCategoryChange,
}) {
  if (!sections) return null;

  const hasApplicants = sections.some(s => s.category === "applicant" || s.category === "nonMigrating" || s.category === "allApplicants");
  const hasOther = sections.some(s => s.category === "other");

  const categories = [];
  if (hasApplicants) {
    const applicantCount = sections.filter(s => s.category === "applicant" || s.category === "nonMigrating").length;
    categories.push({
      id: "applicants",
      label: `Applicants (${applicantCount})`,
      icon: Users,
    });
  }
  if (hasOther) {
    const otherCount = sections.filter(s => s.category === "other").length;
    categories.push({
      id: "other",
      label: "Other Sections",
      icon: Folder,
    });
  }

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC] border-r border-gray-200 w-64">
      {/* Sidebar Header */}
      <div className="px-6 py-6 border-b border-gray-200/50">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#285646]" />
          Questionnaire
        </h3>
        <p className="text-[11px] text-gray-500 mt-1 uppercase tracking-wider font-medium">
          {sections.length} sections • Read-only review
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => onCategoryChange(cat.id)}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200
                  ${
                    isActive
                      ? "bg-white shadow-sm border border-gray-200 text-[#285646]"
                      : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  }
                `}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-[#285646]" : "text-gray-400"}`} />
                {cat.label}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
