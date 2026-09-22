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
    <div className="flex flex-col h-full bg-[#E4E9FF] border-r border-gray-200 w-64">
      {/* Sidebar Header */}
      <div className="px-6 py-6 border-b border-gray-200/50">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#4F726B]" />
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
                type="button"
                onClick={() => onCategoryChange(cat.id)}
                className={`
                  w-full flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F726B] focus-visible:ring-offset-2
                  ${
                    isActive
                      ? "border-gray-200 bg-white text-[#4F726B] shadow-sm hover:border-[#8ac6ad] hover:bg-[#f0f8f3] hover:shadow-md"
                      : "border-transparent text-gray-500 hover:border-[#8ac6ad] hover:bg-white hover:text-[#38564b] hover:shadow-sm"
                  }
                `}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-[#4F726B]" : "text-gray-400"}`} />
                {cat.label}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
