import { FileDown } from "lucide-react";

export default function QuestionnairePdfLink({ matterId, className = "" }) {
  if (!matterId) return null;
  return (
    <a
      href={`/api/matter/${encodeURIComponent(matterId)}/questionnaire/pdf`}
      download
      className={`inline-flex items-center gap-2 rounded-lg bg-[#4F726B] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3c5f57] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F726B] print:hidden ${className}`}
    >
      <FileDown className="h-4 w-4" />
      Download PDF
    </a>
  );
}
