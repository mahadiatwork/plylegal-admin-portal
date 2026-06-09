"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LibraryBig, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Home() {
  const [matterId, setMatterId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSearch = (e) => {
    e.preventDefault();
    if (!matterId.trim()) return;
    
    setIsLoading(true);
    // Redirect to the matter overview/questionnaire page
    router.push(`/matter/${matterId.trim()}/questionnaire`);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-white border-b border-gray-100 p-6 flex flex-col items-center">
          <img src="/Ply_Logo_black.png" alt="ValidifyPro" className="h-10 mb-2" />
          <p className="text-gray-500 text-sm font-medium">Matter Viewer Portal</p>
        </div>
        
        <div className="p-8">
          <form onSubmit={handleSearch} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="matterId" className="text-sm font-medium text-gray-700">
                Zoho Deal ID
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <Input
                  id="matterId"
                  type="text"
                  placeholder="e.g. 102555000001798002"
                  value={matterId}
                  onChange={(e) => setMatterId(e.target.value)}
                  className="pl-10 h-12 text-base"
                  required
                />
              </div>
            </div>
            
            <Button 
              type="submit" 
              className="w-full h-12 bg-[#285646] hover:bg-[#1f4236] text-white text-base"
              disabled={isLoading || !matterId.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Locating Matter...
                </>
              ) : (
                "View Matter Data"
              )}
            </Button>
          </form>

          <div className="mt-6 rounded-2xl border border-[#dbe5e0] bg-[#f5f9f6] p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#285646] text-white">
                <LibraryBig className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#17372e]">
                  Shared resources now live inside each matter&apos;s resources page
                </p>
                <p className="mt-1 text-sm leading-6 text-[#587267]">
                  Open any matter and go to `Resources` to switch between `Shared` resources for everyone and `Individual` resources for that specific matter.
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-500">
            Read-only access to matter questionnaire, resources, and messages.
          </p>
        </div>
      </div>
    </div>
  );
}
