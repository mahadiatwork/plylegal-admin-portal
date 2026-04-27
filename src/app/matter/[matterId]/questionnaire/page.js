"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// Recursively render an object into a key-value list
function RenderObject({ obj }) {
  if (!obj) return <span className="text-gray-400">—</span>;
  if (typeof obj !== "object") return <span>{String(obj)}</span>;
  if (Array.isArray(obj)) {
    if (obj.length === 0) return <span className="text-gray-400">Empty List</span>;
    return (
      <ul className="list-disc pl-5 space-y-1">
        {obj.map((item, idx) => (
          <li key={idx}><RenderObject obj={item} /></li>
        ))}
      </ul>
    );
  }

  const entries = Object.entries(obj).filter(([k, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return <span className="text-gray-400">—</span>;

  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => {
        // Format key from camelCase/snake_case to Title Case
        const formattedKey = key
          .replace(/([A-Z])/g, " $1")
          .replace(/_/g, " ")
          .replace(/^./, (str) => str.toUpperCase());

        return (
          <div key={key} className="border-b border-gray-100 pb-2 last:border-0 last:pb-0">
            <span className="text-xs font-medium text-gray-500 uppercase block mb-1">{formattedKey}</span>
            <div className="text-sm text-gray-900">
              <RenderObject obj={value} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function QuestionnairePage() {
  const params = useParams();
  const matterId = params.matterId;
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

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
        <p className="text-gray-500">No questionnaire data available for this matter.</p>
      </div>
    );
  }

  // Group top-level keys
  const sections = Object.entries(data).filter(([key]) => key !== 'visaContext' && key !== 'id');

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Questionnaire Answers</h2>
        <p className="text-sm text-gray-500">All data saved by the applicant.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {sections.map(([sectionKey, sectionData]) => (
          <Card key={sectionKey} className="overflow-hidden">
            <CardHeader className="bg-gray-50 border-b border-gray-100 py-3">
              <CardTitle className="text-sm font-semibold text-gray-800 capitalize">
                {sectionKey.replace(/_/g, " ")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 max-h-[500px] overflow-y-auto">
              <RenderObject obj={sectionData} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
