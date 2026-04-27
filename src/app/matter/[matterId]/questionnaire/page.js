"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Loader2,
  ChevronDown,
  FileDown,
  Search,
  Maximize2,
  ChevronUp,
  Menu,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import QuestionnaireSidebar from "@/components/QuestionnaireSidebar";

// Format key from camelCase/snake_case to Title Case
function formatLabel(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (str) => str.toUpperCase());
}

// Count total questions in a section (recursively count leaf values)
function countQuestions(data) {
  if (data === null || data === undefined || data === "") return 0;
  if (typeof data !== "object") return 1;
  if (Array.isArray(data)) {
    if (data.length === 0) return 0;
    return data.reduce((sum, item) => sum + countQuestions(item), 0);
  }
  const entries = Object.entries(data).filter(
    ([k, v]) => v !== null && v !== undefined && v !== ""
  );
  if (entries.length === 0) return 0;
  return entries.reduce((sum, [key, value]) => {
    if (typeof value !== "object" || value === null) return sum + 1;
    if (Array.isArray(value) && value.every((v) => typeof v !== "object"))
      return sum + value.length;
    return sum + countQuestions(value);
  }, 0);
}

// Filter data based on search query
function filterData(data, query) {
  if (!query.trim()) return data;
  const lowerQuery = query.toLowerCase();

  if (typeof data !== "object" || data === null) {
    return String(data).toLowerCase().includes(lowerQuery) ? data : null;
  }

  if (Array.isArray(data)) {
    const filtered = data
      .map((item) => filterData(item, query))
      .filter((item) => item !== null);
    return filtered.length > 0 ? filtered : null;
  }

  const entries = Object.entries(data).filter(
    ([k, v]) => v !== null && v !== undefined && v !== ""
  );
  const filteredEntries = entries
    .map(([key, value]) => {
      const keyMatches = formatLabel(key).toLowerCase().includes(lowerQuery);
      const filteredValue = filterData(value, query);
      if (keyMatches) return [key, value];
      if (filteredValue !== null) return [key, filteredValue];
      return null;
    })
    .filter((entry) => entry !== null);

  if (filteredEntries.length === 0) return null;
  return Object.fromEntries(filteredEntries);
}

// Recursively render questions as label-value pairs
function RenderQuestions({ data }) {
  if (data === null || data === undefined || data === "") {
    return <span className="text-muted-foreground">—</span>;
  }

  if (typeof data !== "object") {
    const strVal = String(data);
    // Boolean rendering
    if (strVal === "true") return <span className="text-emerald-600 font-medium">Yes</span>;
    if (strVal === "false") return <span className="text-gray-400">No</span>;
    return <span className="text-foreground">{strVal}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0)
      return <span className="text-muted-foreground italic">Empty list</span>;
    return (
      <div className="space-y-3">
        {data.map((item, idx) => (
          <div
            key={idx}
            className="bg-gray-50 rounded-lg p-3 border border-gray-100"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-white px-2 py-0.5 rounded border border-gray-200">
                Item {idx + 1}
              </span>
            </div>
            <RenderQuestions data={item} />
          </div>
        ))}
      </div>
    );
  }

  const entries = Object.entries(data).filter(
    ([k, v]) => v !== null && v !== undefined && v !== ""
  );
  if (entries.length === 0)
    return <span className="text-muted-foreground">—</span>;

  return (
    <div className="space-y-3">
      {entries.map(([key, value]) => {
        const formattedKey = formatLabel(key);
        const isObject =
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value);
        const isArray = Array.isArray(value);
        const isSimpleArray =
          isArray && value.every((v) => typeof v !== "object");

        return (
          <div
            key={key}
            className="border-b border-gray-100 pb-3 last:border-0 last:pb-0"
          >
            <span className="text-xs font-medium text-gray-500 uppercase block mb-1">
              {formattedKey}
            </span>
            <div className="text-sm text-gray-900">
              {isSimpleArray ? (
                <ul className="list-disc pl-4 space-y-0.5">
                  {value.map((item, idx) => (
                    <li key={idx} className="text-foreground">
                      {String(item)}
                    </li>
                  ))}
                </ul>
              ) : isObject || (isArray && !isSimpleArray) ? (
                <div className="pl-3 border-l-2 border-gray-200">
                  <RenderQuestions data={value} />
                </div>
              ) : (
                <RenderQuestions data={value} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// SectionCard component with collapsible functionality
function SectionCard({
  title,
  data,
  sectionKey,
  expanded,
  onToggle,
  searchQuery,
  sectionRef,
}) {
  const filteredData = searchQuery ? filterData(data, searchQuery) : data;
  const questionCount = countQuestions(data);

  // Don't render if search query exists and no matches found
  if (searchQuery && filteredData === null) return null;

  return (
    <Card className="overflow-hidden" ref={sectionRef}>
      <Collapsible open={expanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <div
            className={`flex items-center justify-between px-5 py-3.5 cursor-pointer transition-all duration-200 ${
              expanded
                ? "bg-[#285646]/8 border-b border-[#285646]/15"
                : "bg-gray-50/80 border-b border-gray-100 hover:bg-gray-100/80"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-1 h-6 rounded-full transition-colors duration-200 ${
                  expanded ? "bg-[#285646]" : "bg-transparent"
                }`}
              />
              <h3
                className={`font-semibold text-[15px] ${
                  expanded ? "text-[#285646]" : "text-gray-800"
                }`}
              >
                {formatLabel(title)}
              </h3>
              {!expanded && questionCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {questionCount} {questionCount === 1 ? "item" : "items"}
                </Badge>
              )}
            </div>
            <div
              className={`transform transition-transform duration-200 ${
                expanded ? "rotate-180" : ""
              }`}
            >
              <ChevronDown className="h-5 w-5 text-gray-400" />
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-5">
            <RenderQuestions data={filteredData || data} />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default function QuestionnairePage() {
  const params = useParams();
  const matterId = params.matterId;
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState(new Set());
  const [expandAll, setExpandAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSectionKey, setActiveSectionKey] = useState(null);
  const [activeSubKey, setActiveSubKey] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sectionRefs = useRef({});

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/matter/${matterId}`);
        const result = await res.json();
        if (result.success) setData(result.questionnaire);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [matterId]);

  // Build sections from data
  const sections = data
    ? Object.entries(data).filter(
        ([key]) => key !== "visaContext" && key !== "id" && key !== "profiles"
      )
    : [];

  // Toggle single section
  const toggleSection = useCallback((sectionKey) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sectionKey)) {
        newSet.delete(sectionKey);
      } else {
        newSet.add(sectionKey);
      }
      return newSet;
    });
  }, []);

  // Expand/Collapse all sections
  const handleExpandAll = useCallback(() => {
    if (expandAll) {
      setExpandedSections(new Set());
      setExpandAll(false);
    } else {
      const allKeys = new Set(sections.map(([key]) => key));
      setExpandedSections(allKeys);
      setExpandAll(true);
    }
  }, [expandAll, sections]);

  // Handle download PDF
  const handleDownloadPDF = useCallback(() => {
    const allKeys = new Set(sections.map(([key]) => key));
    setExpandedSections(allKeys);
    setExpandAll(true);
    requestAnimationFrame(() => {
      setTimeout(() => window.print(), 100);
    });
  }, [sections]);

  // Sidebar navigation handler
  const handleSidebarNavigate = useCallback(
    (sectionKey, subKey) => {
      setActiveSectionKey(sectionKey);
      setActiveSubKey(subKey);

      // Expand the section
      setExpandedSections((prev) => {
        const newSet = new Set(prev);
        newSet.add(sectionKey);
        return newSet;
      });

      // Scroll to the section
      setTimeout(() => {
        const ref = sectionRefs.current[sectionKey];
        if (ref) {
          ref.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);

      // Close mobile sidebar
      setSidebarOpen(false);
    },
    []
  );

  // Sync expand-all state
  useEffect(() => {
    const allKeys = sections.map(([key]) => key);
    const allExpanded =
      allKeys.length > 0 && allKeys.every((k) => expandedSections.has(k));
    const noneExpanded = expandedSections.size === 0;
    if (allExpanded && !expandAll) setExpandAll(true);
    if (noneExpanded && expandAll) setExpandAll(false);
  }, [expandedSections, sections, expandAll]);

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#285646]" />
      </div>
    );
  }

  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="bg-white p-8 rounded-xl shadow-sm text-center border border-gray-200">
        <p className="text-gray-500">
          No questionnaire data available for this matter.
        </p>
      </div>
    );
  }

  // Filter sections based on search query
  const filteredSections = searchQuery
    ? sections.filter(
        ([_, sectionData]) => filterData(sectionData, searchQuery) !== null
      )
    : sections;

  return (
    <div className="flex gap-0 -mx-4 sm:-mx-6 lg:-mx-8 -my-8 min-h-[calc(100vh-180px)]">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="no-print fixed bottom-6 right-6 z-50 lg:hidden bg-[#285646] text-white p-3 rounded-full shadow-lg hover:bg-[#1e4035] transition-colors"
      >
        {sidebarOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <Menu className="h-5 w-5" />
        )}
      </button>

      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
        no-print
        fixed lg:sticky lg:top-[137px] left-0 z-40
        w-72 lg:w-[280px] h-[calc(100vh-137px)]
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        flex-shrink-0 overflow-hidden rounded-none lg:rounded-l-xl
        shadow-xl lg:shadow-none
      `}
      >
        <QuestionnaireSidebar
          data={data}
          activeSectionKey={activeSectionKey}
          activeSubKey={activeSubKey}
          onNavigate={handleSidebarNavigate}
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
          {/* Control Bar */}
          <div className="no-print bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Questionnaire Answers
                </h2>
                <p className="text-sm text-gray-500">
                  All data saved by the applicant.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExpandAll}
                  className="gap-2"
                >
                  {expandAll ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Collapse All
                    </>
                  ) : (
                    <>
                      <Maximize2 className="h-4 w-4" />
                      Expand All
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPDF}
                  className="gap-2"
                >
                  <FileDown className="h-4 w-4" />
                  Download PDF
                </Button>
              </div>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <Input
                type="search"
                placeholder="Search questions or answers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Search results summary */}
            {searchQuery && (
              <div className="text-sm text-gray-500">
                Showing {filteredSections.length} of {sections.length} sections
                {filteredSections.length === 0 && (
                  <span className="text-amber-600 ml-2">
                    No matches found
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Sections List */}
          <div className="space-y-4">
            {filteredSections.map(([sectionKey, sectionData]) => (
              <SectionCard
                key={sectionKey}
                title={sectionKey}
                sectionKey={sectionKey}
                data={sectionData}
                expanded={expandedSections.has(sectionKey)}
                onToggle={() => toggleSection(sectionKey)}
                searchQuery={searchQuery}
                sectionRef={(el) => {
                  sectionRefs.current[sectionKey] = el;
                }}
              />
            ))}
          </div>

          {/* No results message */}
          {filteredSections.length === 0 && searchQuery && (
            <div className="bg-gray-50 p-8 rounded-xl text-center border border-gray-200">
              <p className="text-gray-500">No sections match your search.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery("")}
                className="mt-4"
              >
                Clear Search
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
