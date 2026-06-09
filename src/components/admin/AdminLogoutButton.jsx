"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminLogoutButton() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await fetch("/api/admin/session", { method: "DELETE" });
    } finally {
      startTransition(() => {
        router.replace("/login");
      });
      setIsLoggingOut(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="border-white/70 bg-white/75 text-[#23453a] shadow-sm backdrop-blur"
      disabled={isLoggingOut}
      onClick={handleLogout}
    >
      {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      Sign out
    </Button>
  );
}
