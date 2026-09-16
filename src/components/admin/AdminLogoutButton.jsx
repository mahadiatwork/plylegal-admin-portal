"use client";

import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminLogoutButton() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState("");

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      setError("");
      const response = await fetch("/api/admin/session", { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to sign out. Please try again.");
      window.location.replace("/login");
    } catch {
      setError("Unable to sign out. Please try again.");
      setIsLoggingOut(false);
    }
  };

  return (
    <div><Button
      type="button"
      variant="outline"
      size="sm"
      className="border-white/70 bg-white/75 text-[#23453a] shadow-sm backdrop-blur"
      disabled={isLoggingOut}
      onClick={handleLogout}
    >
      {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      Sign out
    </Button>{error && <p role="alert" className="mt-1 max-w-48 text-xs text-red-700">{error}</p>}</div>
  );
}
