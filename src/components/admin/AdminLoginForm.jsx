"use client";

import { useState } from "react";
import Image from "next/image";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminLoginForm({ nextPath }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, next: nextPath }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to sign in.");
      // Reload clears pre-login router state and sends the new cookie on every request.
      window.location.replace(data.nextPath || "/");
    } catch (submitError) {
      setError(submitError.message || "Unable to sign in. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#E4E9FF] px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-white bg-white p-8 shadow-lg sm:p-10">
        <Image src="/Ply_Logo_black.png" alt="Ply Legal" width={188} height={62} priority className="h-auto w-44" />
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#4F726B]">Admin portal</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#17372e]">Welcome back</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">Sign in to manage questionnaires, client resources and matters.</p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium text-gray-800">Username</label>
            <Input id="username" name="username" autoComplete="username" required maxLength={200}
              value={username} onChange={(event) => setUsername(event.target.value)} className="h-12" />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-gray-800">Password</label>
            <div className="relative">
              <Input id="password" name="password" type={showPassword ? "text" : "password"}
                autoComplete="current-password" required maxLength={1024} value={password}
                onChange={(event) => setPassword(event.target.value)} className="h-12 pr-12" />
              <button type="button" onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-gray-500">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
          </div>}
          <Button type="submit" disabled={isSubmitting} className="h-12 w-full bg-[#4F726B] text-white hover:bg-[#3c5b54]">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-6 flex items-center gap-2 text-xs text-gray-500"><LockKeyhole className="h-3.5 w-3.5" />Access is restricted to authorised staff.</p>
      </section>
    </main>
  );
}
