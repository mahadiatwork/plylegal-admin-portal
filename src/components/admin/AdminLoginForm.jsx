"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminLoginForm({ nextPath }) {
  const router = useRouter();
  const [adminKey, setAdminKey] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!adminKey.trim()) {
      setError("Enter the admin access key to continue.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");

      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: adminKey,
          next: nextPath,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to verify the admin access key.");
      }

      startTransition(() => {
        router.replace(data.nextPath || nextPath);
      });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(40,86,70,0.22),_transparent_36%),linear-gradient(135deg,_#f7fbf8_0%,_#eef6f2_42%,_#eef0ff_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10%] top-[-12%] h-72 w-72 rounded-full bg-[#8ac6ad]/25 blur-3xl" />
        <div className="absolute bottom-[-10%] right-[-12%] h-96 w-96 rounded-full bg-[#d7e5ff]/55 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <section className="space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center justify-center rounded-full border border-white/70 bg-white/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#285646] shadow-sm backdrop-blur lg:justify-start">
              ValidifyPro Admin Portal
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight text-[#16362d] sm:text-5xl">
                Shared resource publishing starts here.
              </h1>
              <p className="max-w-xl text-base leading-7 text-[#406257] sm:text-lg">
                Sign in with the admin access key to manage the shared resource library, control publish status, and keep client-facing resources consistent across every matter.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/75 bg-white/70 p-4 text-left shadow-sm backdrop-blur">
                <ShieldCheck className="h-5 w-5 text-[#285646]" />
                <p className="mt-3 text-sm font-semibold text-[#16362d]">Protected admin entry</p>
                <p className="mt-1 text-sm text-[#5c746b]">
                  Shared-resource APIs and screens stay behind a signed admin session.
                </p>
              </div>
              <div className="rounded-2xl border border-white/75 bg-white/70 p-4 text-left shadow-sm backdrop-blur">
                <KeyRound className="h-5 w-5 text-[#285646]" />
                <p className="mt-3 text-sm font-semibold text-[#16362d]">Session-based access</p>
                <p className="mt-1 text-sm text-[#5c746b]">
                  The session is stored in an HTTP-only cookie so the client never touches the secret.
                </p>
              </div>
            </div>
          </section>

          <section className="login-glass-panel rounded-[28px] p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#285646] text-white shadow-sm">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#648377]">
                  Admin Login
                </p>
                <h2 className="text-2xl font-semibold text-[#16362d]">Unlock the resource library</h2>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="admin-key" className="text-sm font-medium text-[#24453b]">
                  Admin access key
                </label>
                <Input
                  id="admin-key"
                  type="password"
                  autoComplete="current-password"
                  value={adminKey}
                  onChange={(event) => setAdminKey(event.target.value)}
                  placeholder="Enter the portal admin key"
                  className="h-12 border-white/80 bg-white/85 text-[#16362d] shadow-sm"
                />
              </div>

              {error ? (
                <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : (
                <p className="text-sm leading-6 text-[#5c746b]">
                  This uses the same server-side access key already configured for the portal environment.
                </p>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-12 w-full rounded-xl bg-[#285646] text-white hover:bg-[#1f4236]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in
                  </>
                ) : (
                  <>
                    Continue to resources
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
