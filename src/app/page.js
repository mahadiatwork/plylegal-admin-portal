"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
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
        <div className="bg-[#285646] p-6 text-center">
          <h1 className="text-2xl font-serif font-bold text-white mb-2">ValidifyPro</h1>
          <p className="text-green-100/80 text-sm">Matter Viewer Portal</p>
        </div>
        
        <div className="p-8">
          <form onSubmit={handleSearch} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="matterId" className="text-sm font-medium text-gray-700">
                Deal ID or Firebase App ID
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <Input
                  id="matterId"
                  type="text"
                  placeholder="e.g. 51839400000..."
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
        </div>
        
        <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-500">
            Read-only access to matter questionnaire, documents, and messages.
          </p>
        </div>
      </div>
    </div>
  );
}
