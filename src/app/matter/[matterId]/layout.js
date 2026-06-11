"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatVisaApplicationType } from "@/lib/visaDisplay";

export default function MatterLayout({ children }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const matterId = params.matterId;
  const headerRef = useRef(null);

  const [matterData, setMatterData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [headerHeight, setHeaderHeight] = useState(255);

  useEffect(() => {
    async function fetchMatter() {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/matter/${matterId}`);
        const data = await res.json();

        if (data.success) {
          setMatterData(data);
          const dealId =
            data.application?.zohoId ||
            data.application?.zohoDealId ||
            data.application?.dealId;

          if (
            dealId &&
            dealId !== matterId &&
            pathname?.startsWith(`/matter/${matterId}`)
          ) {
            router.replace(pathname.replace(`/matter/${matterId}`, `/matter/${dealId}`));
          }
        } else {
          setError(data.error + (data.details ? `: ${data.details}` : ""));
        }
      } catch (err) {
        setError("Error connecting to server");
      } finally {
        setIsLoading(false);
      }
    }
    fetchMatter();
  }, [matterId, pathname, router]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const updateHeaderHeight = () => {
      setHeaderHeight(Math.ceil(header.getBoundingClientRect().height));
    };

    updateHeaderHeight();

    const observer = new ResizeObserver(updateHeaderHeight);
    observer.observe(header);
    window.addEventListener("resize", updateHeaderHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeaderHeight);
    };
  }, [matterData]);


  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#285646] mb-4" />
          <p className="text-gray-500">Loading matter data...</p>
        </div>
      </div>
    );
  }

  if (error || !matterData) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-sm text-center max-w-md w-full">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Error Loading Matter</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Button onClick={() => router.push("/")} className="w-full">
            Return to Search
          </Button>
        </div>
      </div>
    );
  }

  const { application, percentage } = matterData;
  const canonicalMatterId =
    application.zohoId || application.zohoDealId || application.dealId || matterId;
  const tabs = [
    { href: `/matter/${canonicalMatterId}/questionnaire`, label: "Questionnaire" },
    { href: `/matter/${canonicalMatterId}/resources`, label: "Resources" },
  ];

  return (
    <div
      className="min-h-screen bg-gray-50 flex flex-col"
      style={{ "--matter-header-height": `${headerHeight}px` }}
    >
      {/* Header */}
      <header ref={headerRef} className="bg-white border-b border-gray-200 print:hidden">
        {/* Top Navbar (Full Width) */}
        <div className="border-b border-gray-100 px-4 sm:px-8 py-4 flex flex-row items-center justify-between">
          <div className="flex items-center gap-8">
            <img src="/Ply_Logo_black.png" alt="ValidifyPro Logo" className="h-7 sm:h-9" />
            <Link href="/" className="hidden sm:inline-flex items-center text-sm text-gray-500 hover:text-gray-900 transition-colors">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Search
            </Link>
          </div>
        </div>

        <div className="mx-auto max-w-[100rem] px-4 sm:px-6 lg:px-8">
          <div className="pt-6 pb-2">
            <Link href="/" className="inline-flex sm:hidden items-center text-sm text-gray-500 hover:text-gray-900 mb-4 transition-colors">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Search
            </Link>
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-bold text-gray-900">{application.reference || "Unnamed Matter"}</h1>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {formatVisaApplicationType(application)}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                    Read Only
                  </span>
                </div>
                <p className="text-sm text-gray-500 flex items-center gap-2">
                  <span>Deal ID: {canonicalMatterId || "N/A"}</span>
                </p>
              </div>

              {/* Progress Indicator */}
              <div className="flex items-center gap-4 bg-gray-50 px-4 py-2 rounded-lg border border-gray-100">
                <div className="relative h-12 w-12">
                  <svg className="h-full w-full" viewBox="0 0 36 36">
                    <path
                      className="text-gray-200"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    />
                    <path
                      className="text-[#285646]"
                      strokeDasharray={`${percentage || 0}, 100`}
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-[#285646]">
                    {percentage || 0}%
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Completion</p>
                  <p className="text-xs text-gray-500">Questionnaire Progress</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap mt-2 -mb-px gap-6">
            {tabs.map((tab) => {
              const isActive = pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 whitespace-nowrap transition-colors ${
                    isActive
                      ? "border-[#285646] text-[#285646]"
                      : "border-transparent text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-[100rem] flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
