"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  Loader2,
  ChevronDown,
  FileDown,
  FileText,
  Search,
  Menu,
  X,
  MessageSquarePlus,
  AlertCircle,
  User,
  Users,
  Briefcase,
  GraduationCap,
  Languages,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import QuestionnaireSidebar from "@/components/QuestionnaireSidebar";
import SkillsInDemandQuestionnaireReview, {
  isSkillsInDemandMatter,
} from "@/components/SkillsInDemandQuestionnaireReview";
import { buildStructuredSections, formatLabel } from "@/lib/questionnaireSections";

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

// Filter data based on search query (also matches comment bodies)
function filterData(data, query, commentsByPath) {
  if (!query.trim()) return data;
  const lowerQuery = query.toLowerCase();

  // Check if any comment body matches the search query
  const commentMatches = commentsByPath
    ? Object.values(commentsByPath).some((comments) =>
        comments.some((c) => c.body?.toLowerCase().includes(lowerQuery))
      )
    : false;

  if (typeof data !== "object" || data === null) {
    const valueMatch = String(data).toLowerCase().includes(lowerQuery);
    return valueMatch || commentMatches ? data : null;
  }

  if (Array.isArray(data)) {
    const filtered = data
      .map((item) => filterData(item, query, commentsByPath))
      .filter((item) => item !== null);
    return filtered.length > 0 ? filtered : null;
  }

  const entries = Object.entries(data).filter(
    ([k, v]) => v !== null && v !== undefined && v !== ""
  );
  const filteredEntries = entries
    .map(([key, value]) => {
      const keyMatches = formatLabel(key).toLowerCase().includes(lowerQuery);
      const filteredValue = filterData(value, query, commentsByPath);
      if (keyMatches) return [key, value];
      if (filteredValue !== null) return [key, filteredValue];
      return null;
    })
    .filter((entry) => entry !== null);

  if (filteredEntries.length === 0 && !commentMatches) return null;
  return Object.fromEntries(filteredEntries);
}

// Grid-based renderer for the final data view
function GridRenderer({ data, parentPath = "", commentsByPath = {}, onAddComment }) {
  if (data === null || data === undefined || data === "") return null;

  const entries = Object.entries(data).filter(
    ([k, v]) => v !== null && v !== undefined && v !== ""
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
      {entries.map(([key, value]) => {
        const formattedKey = formatLabel(key);
        const fieldPath = parentPath ? `${parentPath}.${key}` : key;
        const isObject = typeof value === "object" && value !== null && !Array.isArray(value);
        const isArray = Array.isArray(value);
        
        if (isObject || isArray) {
            // Recursive for nested objects/arrays but keeping them within the grid if possible
            // or spanning them full width
            if (isArray && value.length === 0) {
              return (
                <div key={key} className="col-span-full mt-2">
                    <h4 className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-2">{formattedKey}</h4>
                    <div className="pl-4 border-l-2 border-gray-100 text-sm text-gray-400 italic">
                        Empty list
                    </div>
                </div>
              );
            }
            return (
                <div key={key} className="col-span-full mt-2">
                    <h4 className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-2">{formattedKey}</h4>
                    <div className="pl-4 border-l-2 border-gray-100">
                        <GridRenderer 
                            data={value} 
                            parentPath={fieldPath} 
                            commentsByPath={commentsByPath} 
                            onAddComment={onAddComment} 
                        />
                    </div>
                </div>
            );
        }

        const openComments = (commentsByPath[fieldPath] || []).filter(c => c.status === "open");
        const strVal = String(value);
        let displayVal = strVal;
        if (strVal === "true") displayVal = "Yes";
        if (strVal === "false") displayVal = "No";

        return (
          <div key={key} className="group relative">
            <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">
              {formattedKey}
            </label>
            <div className={`
                min-h-[42px] flex items-center px-4 py-2 rounded-lg border bg-white text-sm text-gray-900 transition-all
                ${openComments.length > 0 ? "border-red-300 bg-red-50/30" : "border-gray-200"}
            `}>
              {displayVal}
            </div>
            {openComments.map(c => (
                <div key={c.id} className="mt-1 flex items-start gap-1.5 text-[11px] text-red-600 italic">
                    <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>{c.body}</span>
                </div>
            ))}
            {onAddComment && (
              <button
                onClick={() => onAddComment(fieldPath, formattedKey)}
                className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-[#285646]"
              >
                <MessageSquarePlus className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Recursively render questions as label-value pairs with comment support
function RenderQuestions({ data, parentPath = "", commentsByPath = {}, onAddComment }) {
  if (data === null || data === undefined || data === "") {
    return <span className="text-muted-foreground">—</span>;
  }

  if (typeof data !== "object") {
    const strVal = String(data);
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
            <RenderQuestions
              data={item}
              parentPath={`${parentPath}[${idx}]`}
              commentsByPath={commentsByPath}
              onAddComment={onAddComment}
            />
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
        const fieldPath = parentPath ? `${parentPath}.${key}` : key;
        const isObject =
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value);
        const isArray = Array.isArray(value);
        const isSimpleArray =
          isArray && value.every((v) => typeof v !== "object");
        const isLeaf = !isObject && !isArray;

        // Find unresolved comments for this field path
        const openComments = (commentsByPath[fieldPath] || []).filter(
          (c) => c.status === "open"
        );
        const latestOpenComment = openComments[openComments.length - 1];

        return (
          <div
            key={key}
            className={`border-b border-gray-100 pb-3 last:border-0 last:pb-0 group relative ${
              openComments.length > 0 ? "border-l-2 border-l-red-400 pl-3" : ""
            }`}
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
                  <RenderQuestions
                    data={value}
                    parentPath={fieldPath}
                    commentsByPath={commentsByPath}
                    onAddComment={onAddComment}
                  />
                </div>
              ) : (
                <RenderQuestions data={value} />
              )}
            </div>

            {/* Inline red note for open comments */}
            {latestOpenComment && (
              <div className="mt-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span className="italic">
                  Reviewer note: {latestOpenComment.body}
                </span>
              </div>
            )}

            {/* Hover "Add note" button for leaf fields */}
            {isLeaf && onAddComment && (
              <button
                onClick={() => onAddComment(fieldPath, formattedKey)}
                className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-[#285646]"
                title="Add reviewer note"
              >
                <MessageSquarePlus className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Recursively render questions in Q&A format for print
function PrintQARenderer({ data, parentKey = "", commentsByPath = {}, includeComments = false }) {
  if (data === null || data === undefined || data === "") {
    return null;
  }

  if (typeof data !== "object") {
    const strVal = String(data);
    let finalVal = strVal;
    if (strVal === "true") finalVal = "Yes";
    if (strVal === "false") finalVal = "No";

    const openComments = (commentsByPath[parentKey] || []).filter(c => c.status === "open");

    return (
      <div className="mb-2 break-inside-avoid">
        <div className="font-bold text-gray-900 leading-snug">Q: {formatLabel(parentKey)}?</div>
        <div className="text-gray-800 leading-snug">A: {finalVal}</div>
        {includeComments && openComments.map((c) => (
          <div key={c.id} className="text-xs italic text-gray-500 mt-0.5">
            Reviewer note ({c.authorName || "Reviewer"}, {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ""} — {c.severity || "info"}): &ldquo;{c.body}&rdquo;
          </div>
        ))}
      </div>
    );
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return null;
    return (
      <div className="mb-2 pl-3 border-l-2 border-gray-300">
        {data.map((item, idx) => (
          <div key={idx} className="mb-2 last:mb-0 break-inside-avoid">
            <div className="font-semibold text-gray-700 italic text-xs leading-snug">Item {idx + 1}</div>
            <PrintQARenderer data={item} parentKey={`${parentKey}[${idx}]`} commentsByPath={commentsByPath} includeComments={includeComments} />
          </div>
        ))}
      </div>
    );
  }

  const entries = Object.entries(data).filter(
    ([k, v]) => v !== null && v !== undefined && v !== ""
  );
  if (entries.length === 0) return null;

  return (
    <div className="space-y-0">
      {entries.map(([key, value]) => {
        const isObject = typeof value === "object" && value !== null && !Array.isArray(value);
        const isArray = Array.isArray(value);
        const isSimpleArray = isArray && value.every((v) => typeof v !== "object");

        if (isSimpleArray) {
          return (
            <div key={key} className="mb-2 break-inside-avoid">
              <div className="font-bold text-gray-900 leading-snug">Q: {formatLabel(key)}?</div>
              <div className="text-gray-800 leading-snug">A: {value.join(", ")}</div>
            </div>
          );
        } else if (isObject || isArray) {
          return (
            <div key={key} className="mb-2 break-inside-avoid">
              <div className="font-bold text-gray-900 text-[15px] border-b border-gray-200 pb-0.5 mb-1 mt-3">{formatLabel(key)}</div>
              <PrintQARenderer data={value} parentKey={key} commentsByPath={commentsByPath} includeComments={includeComments} />
            </div>
          );
        } else {
          return <PrintQARenderer key={key} data={value} parentKey={key} commentsByPath={commentsByPath} includeComments={includeComments} />;
        }
      })}
    </div>
  );
}

// CommentBadge — shows count of unresolved comments on a section header
function CommentBadge({ count, onClick }) {
  if (!count || count <= 0) return null;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 text-[10px] font-semibold hover:bg-amber-100 transition-colors"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      {count} {count === 1 ? "note" : "notes"}
    </button>
  );
}

// CommentDrawer — right-side slide-over for adding/viewing comments
function CommentDrawer({
  isOpen,
  onClose,
  path,
  label,
  comments,
  onAddComment,
  onResolveComment,
}) {
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState("suggestion");

  if (!isOpen) return null;

  const pathComments = comments.filter(
    (c) => c.path === path && c.status === "open"
  );

  const handleSubmit = () => {
    if (!body.trim()) return;
    onAddComment({ path, label, body: body.trim(), severity });
    setBody("");
    setSeverity("suggestion");
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-50"
        onClick={onClose}
      />
      {/* Drawer — bottom sheet on mobile, right slide-over on desktop */}
      <div className="fixed bottom-0 left-0 right-0 sm:bottom-auto sm:left-auto sm:right-0 sm:top-0 h-[85vh] sm:h-full w-full sm:w-96 sm:max-w-full bg-white shadow-xl z-50 flex flex-col rounded-t-2xl sm:rounded-none">
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-2 pb-0 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Reviewer Notes</h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[280px]">{label}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Existing comments */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {pathComments.length === 0 && (
            <p className="text-sm text-gray-400 italic">No notes yet for this field.</p>
          )}
          {pathComments.map((comment) => (
            <div
              key={comment.id}
              className={`rounded-lg border p-3 text-sm ${
                comment.severity === "issue"
                  ? "border-red-200 bg-red-50"
                  : comment.severity === "suggestion"
                  ? "border-amber-200 bg-amber-50"
                  : "border-blue-200 bg-blue-50"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-600">
                  {comment.authorName || "Reviewer"}
                </span>
                <span
                  className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                    comment.severity === "issue"
                      ? "bg-red-100 text-red-700"
                      : comment.severity === "suggestion"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {comment.severity}
                </span>
              </div>
              <p className="text-gray-800">{comment.body}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-gray-400">
                  {comment.createdAt
                    ? new Date(comment.createdAt).toLocaleString()
                    : ""}
                </span>
                <button
                  onClick={() => onResolveComment(comment.id)}
                  className="text-[10px] font-medium text-[#285646] hover:underline"
                >
                  Mark resolved
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* New comment form */}
        <div className="border-t border-gray-200 p-4 space-y-3">
          {/* Severity selector */}
          <div className="flex gap-2">
            {[
              { key: "info", label: "Info", classes: "bg-blue-50 text-blue-700 border-blue-200" },
              { key: "suggestion", label: "Suggestion", classes: "bg-amber-50 text-amber-700 border-amber-200" },
              { key: "issue", label: "Issue", classes: "bg-red-50 text-red-700 border-red-200" },
            ].map(({ key, label: lbl, classes }) => (
              <button
                key={key}
                onClick={() => setSeverity(key)}
                className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  severity === key ? classes : "bg-white text-gray-500 border-gray-200"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a reviewer note..."
            rows={3}
            className="text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!body.trim()}
              className="bg-[#285646] hover:bg-[#1e4035] text-white"
            >
              Save Note
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// SectionCard component with collapsible functionality + comment support
function SectionCard({
  title,
  data,
  sectionKey,
  expanded,
  onToggle,
  searchQuery,
  sectionRef,
  commentCount,
  onCommentClick,
  commentsByPath,
  onAddComment,
}) {
  const filteredData = searchQuery ? filterData(data, searchQuery, commentsByPath) : data;
  const questionCount = countQuestions(data);

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
                {title}
              </h3>
              {!expanded && questionCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {questionCount} {questionCount === 1 ? "item" : "items"}
                </Badge>
              )}
              <CommentBadge count={commentCount} onClick={onCommentClick} />
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
            <RenderQuestions
              data={filteredData || data}
              parentPath={sectionKey}
              commentsByPath={commentsByPath}
              onAddComment={onAddComment}
            />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// Map section types to icons
function getSectionIcon(title) {
  const lower = title.toLowerCase();
  if (lower.includes("personal") || lower.includes("details")) return User;
  if (lower.includes("identity")) return ShieldCheck;
  if (lower.includes("employment")) return Briefcase;
  if (lower.includes("education") || lower.includes("qualification")) return GraduationCap;
  if (lower.includes("skills") || lower.includes("language")) return Languages;
  if (lower.includes("contact")) return Phone;
  return FileText;
}

// Profile Tabs component
function ProfileTabs({ profiles, activeKey, onChange }) {
  return (
    <div className="flex border-b border-gray-200 overflow-x-auto no-scrollbar">
      {profiles.map((p) => {
        const isActive = activeKey === p.key;
        return (
          <button
            key={p.key}
            onClick={() => onChange(p.key)}
            className={`
              flex-1 min-w-[200px] px-6 py-4 text-sm font-semibold transition-all duration-200 border-b-2
              ${
                isActive
                  ? "border-[#285646] text-[#285646] bg-[#285646]/5"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }
            `}
          >
            <div className="flex items-center justify-center gap-2">
              <User className={`h-4 w-4 ${isActive ? "text-[#285646]" : "text-gray-400"}`} />
              {p.title}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// Internal Section Sidebar
function SectionSidebar({ subSections, activeKey, onChange }) {
  return (
    <div className="w-64 border-r border-gray-100 py-4 flex-shrink-0">
      {subSections.map((s) => {
        const Icon = getSectionIcon(s.title);
        const isActive = activeKey === s.key;
        return (
          <button
            key={s.key}
            onClick={() => onChange(s.key)}
            className={`
              w-full flex items-center gap-3 px-6 py-4 text-sm font-medium transition-all duration-200 border-l-4
              ${
                isActive
                  ? "bg-[#285646]/5 border-[#285646] text-[#285646]"
                  : "bg-transparent border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              }
            `}
          >
            <Icon className={`h-4 w-4 ${isActive ? "text-[#285646]" : "text-gray-400"}`} />
            <span className="truncate">{s.title}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function QuestionnairePage() {
  const params = useParams();
  const matterId = params.matterId;
  const [data, setData] = useState(null);
  const [matterResult, setMatterResult] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState(new Set());
  const [expandAll, setExpandAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("applicants");
  const [activeProfileKey, setActiveProfileKey] = useState(null);
  const [activeSectionKey, setActiveSectionKey] = useState(null);
  const [activeSubKey, setActiveSubKey] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPath, setDrawerPath] = useState("");
  const [drawerLabel, setDrawerLabel] = useState("");
  const [includeCommentsInPDF, setIncludeCommentsInPDF] = useState(true);
  const sectionRefs = useRef({});

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/matter/${matterId}`);
        const result = await res.json();
        if (result.success) {
          setMatterResult(result);
          setData(result.questionnaire);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [matterId]);

  // Fetch review comments
  useEffect(() => {
    async function fetchComments() {
      try {
        const res = await fetch(`/api/review-comments/${matterId}`);
        const result = await res.json();
        if (result.success) setComments(result.comments || []);
      } catch (e) {
        // Comments endpoint may not exist yet — fail silently
        console.warn("Could not load review comments:", e.message);
      }
    }
    if (matterId) fetchComments();
  }, [matterId]);

  // Build structured sections from data
  const sections = useMemo(() => {
    if (!data) return [];
    return buildStructuredSections(data);
  }, [data]);

  // Derived sections based on active category
  const activeCategorySections = useMemo(() => {
    if (activeCategory === "applicants") {
      return sections.filter(s => s.category === "applicant" || s.category === "nonMigrating" || s.category === "allApplicants");
    }
    return sections.filter(s => s.category === "other");
  }, [sections, activeCategory]);

  // Handle category change
  const handleCategoryChange = useCallback((catId) => {
    setActiveCategory(catId);
    const firstSection = sections.find(s => {
      if (catId === "applicants") return s.category === "applicant" || s.category === "nonMigrating" || s.category === "allApplicants";
      return s.category === "other";
    });
    if (firstSection) {
      setActiveProfileKey(firstSection.key);
      if (firstSection.subSections?.length > 0) {
        setActiveSectionKey(firstSection.subSections[0].key);
      } else {
        setActiveSectionKey(null);
      }
    }
  }, [sections]);

  // Auto-set initial profile and section
  useEffect(() => {
    if (sections.length > 0 && !activeProfileKey) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) handleCategoryChange("applicants");
      });
      return () => {
        cancelled = true;
      };
    }
  }, [sections, activeProfileKey, handleCategoryChange]);

  const activeProfile = useMemo(() => {
    return activeCategorySections.find(s => s.key === activeProfileKey) || activeCategorySections[0];
  }, [activeCategorySections, activeProfileKey]);

  const activeSection = useMemo(() => {
    if (!activeProfile) return null;
    if (activeProfile.subSections?.length > 0) {
      return activeProfile.subSections.find(s => s.key === activeSectionKey) || activeProfile.subSections[0];
    }
    return activeProfile;
  }, [activeProfile, activeSectionKey]);

  // Index comments by path for quick lookup
  const commentsByPath = useMemo(() => {
    const map = {};
    comments.forEach((c) => {
      if (!map[c.path]) map[c.path] = [];
      map[c.path].push(c);
    });
    return map;
  }, [comments]);

  // Count unresolved comments per section key
  const commentCountBySection = useMemo(() => {
    const map = {};
    comments.forEach((c) => {
      if (c.status === "open") {
        map[c.sectionKey] = (map[c.sectionKey] || 0) + 1;
      }
    });
    return map;
  }, [comments]);

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
      const allKeys = new Set(sections.map((s) => s.key));
      setExpandedSections(allKeys);
      setExpandAll(true);
    }
  }, [expandAll, sections]);

  // Handle download PDF
  const handleDownloadPDF = useCallback(() => {
    window.print();
  }, []);

  // Sidebar navigation handler
  const handleSidebarNavigate = useCallback(
    (sectionKey, subKey) => {
      setActiveSectionKey(sectionKey);
      setActiveSubKey(subKey);

      setExpandedSections((prev) => {
        const newSet = new Set(prev);
        newSet.add(sectionKey);
        return newSet;
      });

      setTimeout(() => {
        const ref = sectionRefs.current[sectionKey];
        if (ref) {
          ref.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);

      setSidebarOpen(false);
    },
    []
  );

  // Open comment drawer for a specific field
  const handleAddComment = useCallback((path, label) => {
    setDrawerPath(path);
    setDrawerLabel(label);
    setDrawerOpen(true);
  }, []);

  // Submit a new comment
  const handleSaveComment = useCallback(
    async ({ path, label, body, severity }) => {
      try {
        const res = await fetch(`/api/review-comments/${matterId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, label, body, severity }),
        });
        const result = await res.json();
        if (result.success && result.comment) {
          setComments((prev) => [...prev, result.comment]);
        }
      } catch (e) {
        console.error("Failed to save comment:", e);
      }
    },
    [matterId]
  );

  // Resolve a comment
  const handleResolveComment = useCallback(
    async (commentId) => {
      try {
        const res = await fetch(`/api/review-comments/${matterId}/${commentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "resolved" }),
        });
        const result = await res.json();
        if (result.success) {
          setComments((prev) =>
            prev.map((c) =>
              c.id === commentId ? { ...c, status: "resolved" } : c
            )
          );
        }
      } catch (e) {
        console.error("Failed to resolve comment:", e);
      }
    },
    [matterId]
  );

  // Sync expand-all state
  useEffect(() => {
    const allKeys = sections.map((s) => s.key);
    const allExpanded =
      allKeys.length > 0 && allKeys.every((k) => expandedSections.has(k));
    const noneExpanded = expandedSections.size === 0;
    let nextExpandAll = null;
    if (allExpanded && !expandAll) nextExpandAll = true;
    if (noneExpanded && expandAll) nextExpandAll = false;
    if (nextExpandAll !== null) {
      queueMicrotask(() => setExpandAll(nextExpandAll));
    }
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

  if (isSkillsInDemandMatter(matterResult, data)) {
    return (
      <SkillsInDemandQuestionnaireReview
        questionnaire={data}
        sections={sections}
        application={matterResult?.application}
        completion={matterResult?.completion}
        percentage={matterResult?.percentage}
      />
    );
  }

  // Filter sections based on search query
  const filteredSections = searchQuery
    ? sections.filter((s) => filterData(s.data, searchQuery, commentsByPath) !== null)
    : sections;

  return (
    <>
      <div className="flex flex-col lg:flex-row items-start gap-0 -mx-4 sm:-mx-6 lg:-mx-8 -my-8 min-h-[calc(100vh-180px)] print:hidden">
        {/* Category Sidebar */}
        <aside
          className="no-print hidden lg:sticky lg:top-[var(--matter-header-height,255px)] lg:z-20 lg:block lg:w-64 lg:flex-shrink-0"
          style={{
            top: "var(--matter-header-height, 255px)",
            height: "calc(100vh - var(--matter-header-height, 255px))",
          }}
        >
          <QuestionnaireSidebar
            sections={sections}
            activeCategory={activeCategory}
            onCategoryChange={handleCategoryChange}
          />
        </aside>

        {/* Main Content */}
        <main className="relative z-0 flex-1 min-w-0 bg-[#F8FAFC]">
          <div className="p-6 lg:p-10 space-y-8 max-w-6xl mx-auto">
            
            {/* Matter Hero (Redesigned Header) */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                  {data?.mainApplicant?.details?.given_names} {data?.mainApplicant?.details?.family_name} - Skills in Demand (Subclass 482)
                </h1>
                <Badge className="bg-[#285646]/10 text-[#285646] border-[#285646]/20 hover:bg-[#285646]/10 px-3 py-1 text-xs">
                  Skills in Demand (Subclass 482)
                </Badge>
                <Badge variant="secondary" className="bg-gray-100 text-gray-500 hover:bg-gray-100 px-3 py-1 text-xs font-normal">
                  Read Only
                </Badge>
              </div>
              <div className="flex items-center gap-6 text-sm text-gray-500 font-medium">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#285646]" />
                  Questionnaire
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                  {sections.length} sections • Read-only review
                </div>
              </div>
            </div>

            {/* Main Application Interface */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-[600px]">
              
              {/* Profile Tabs */}
              {activeCategory === "applicants" && activeCategorySections.length > 0 && (
                <ProfileTabs
                  profiles={activeCategorySections}
                  activeKey={activeProfileKey}
                  onChange={setActiveProfileKey}
                />
              )}

              {/* Layout: Inner Sidebar + Content */}
              <div className="flex flex-1 min-h-0">
                
                {/* Internal Section Sidebar */}
                {activeProfile?.subSections?.length > 0 && (
                  <SectionSidebar
                    subSections={activeProfile.subSections}
                    activeKey={activeSectionKey}
                    onChange={setActiveSectionKey}
                  />
                )}

                {/* Data Content Panel */}
                <div className="flex-1 overflow-hidden flex flex-col">
                  {activeSection && (
                    <>
                      {/* Dark Green Section Header */}
                      <div className="bg-[#4a675d] text-white px-6 py-4 flex items-center justify-between shadow-sm">
                        <h2 className="text-sm font-semibold tracking-wide uppercase">
                          {activeProfile?.title?.toUpperCase()} - {activeSection?.title?.toUpperCase()}
                        </h2>
                        <div className="flex items-center gap-4 no-print">
                            <label className="flex items-center gap-2 text-[11px] font-medium text-white/80 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={includeCommentsInPDF}
                                    onChange={(e) => setIncludeCommentsInPDF(e.target.checked)}
                                    className="rounded border-white/30 bg-transparent text-[#285646] focus:ring-offset-0 focus:ring-0"
                                />
                                Include notes in PDF
                            </label>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleDownloadPDF}
                                className="h-7 px-2 text-white/90 hover:text-white hover:bg-white/10 text-[11px] font-medium gap-1.5"
                            >
                                <FileDown className="h-3.5 w-3.5" />
                                Export
                            </Button>
                        </div>
                      </div>

                      {/* Data Grid Body */}
                      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                        <GridRenderer
                          data={activeSection.data}
                          parentPath={activeSection.key}
                          commentsByPath={commentsByPath}
                          onAddComment={handleAddComment}
                        />

                        {/* Search results summary (only if search is active) */}
                        {searchQuery && (
                          <div className="mt-8 pt-6 border-t border-gray-100 text-sm text-gray-500">
                            Search matches in this section: {countQuestions(filterData(activeSection.data, searchQuery, commentsByPath))} items
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  
                  {!activeSection && (
                    <div className="flex-1 flex items-center justify-center p-12 text-gray-400">
                        Select a section to view data
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Print-Only Q&A Layout */}
      <div className="hidden print:block w-full bg-white text-black max-w-4xl mx-auto">
        <div className="flex items-center justify-between border-b-2 border-gray-800 pb-2 mb-4">
          <img src="/368e8734-fa6e-41c2-b88a-ccd1d381b50b.png" alt="PlyLegal Logo" className="h-8" />
          <div className="text-right">
            <p className="text-sm font-medium text-gray-500">Applicant Questionnaire</p>
          </div>
        </div>
        
        {sections.map((section) => (
          <div key={section.key} className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4">
              {section.title}
            </h2>
            <div className="text-sm">
              <PrintQARenderer
                data={section.data}
                parentKey={section.key}
                commentsByPath={commentsByPath}
                includeComments={includeCommentsInPDF}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Comment Drawer */}
      <CommentDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        path={drawerPath}
        label={drawerLabel}
        comments={comments}
        onAddComment={handleSaveComment}
        onResolveComment={handleResolveComment}
      />
    </>
  );
}
