"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { ADMIN_ROLE_OPTIONS, adminRoleLabel, canManageAdminUsers } from "@/lib/adminRoles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const emptyNewUser = {
  name: "",
  email: "",
  role: "admin",
  temporaryPassword: "",
};

function Message({ type = "error", children }) {
  if (!children) return null;
  const success = type === "success";
  const Icon = success ? CheckCircle2 : AlertCircle;
  return (
    <div role={success ? "status" : "alert"} className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function PasswordGuidance() {
  return <p className="text-xs leading-5 text-gray-500">Use 8–128 characters with at least one letter and one number.</p>;
}

export default function AdminSettings({ initialUser }) {
  const hasUserManagementRole = canManageAdminUsers(initialUser.role);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const canManageUsers = hasUserManagementRole && (!initialUser.mustChangePassword || passwordChanged);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState({ loading: false, error: "", success: "" });
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(canManageUsers);
  const [usersError, setUsersError] = useState("");
  const [newUser, setNewUser] = useState(emptyNewUser);
  const [createStatus, setCreateStatus] = useState({ loading: false, error: "", success: "" });
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetStatus, setResetStatus] = useState({ loading: false, error: "" });

  useEffect(() => {
    if (!canManageUsers) return;
    let disposed = false;
    async function loadUsers() {
      setUsersLoading(true);
      setUsersError("");
      try {
        const response = await fetch("/api/admin/users", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "Unable to load users.");
        if (!disposed) setUsers(data.users || []);
      } catch (error) {
        if (!disposed) setUsersError(error.message || "Unable to load users.");
      } finally {
        if (!disposed) setUsersLoading(false);
      }
    }
    loadUsers();
    return () => { disposed = true; };
  }, [canManageUsers]);

  async function changePassword(event) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ loading: false, error: "New passwords do not match.", success: "" });
      return;
    }
    setPasswordStatus({ loading: true, error: "", success: "" });
    try {
      const response = await fetch("/api/admin/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to change the password.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordChanged(true);
      setPasswordStatus({ loading: false, error: "", success: "Password changed successfully." });
    } catch (error) {
      setPasswordStatus({ loading: false, error: error.message || "Unable to change the password.", success: "" });
    }
  }

  async function createUser(event) {
    event.preventDefault();
    setCreateStatus({ loading: true, error: "", success: "" });
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to create the user.");
      setUsers((current) => [...current, data.user].sort((left, right) => left.name.localeCompare(right.name)));
      setNewUser(emptyNewUser);
      setCreateStatus({ loading: false, error: "", success: `${data.user.name} can now sign in with the temporary password.` });
    } catch (error) {
      setCreateStatus({ loading: false, error: error.message || "Unable to create the user.", success: "" });
    }
  }

  async function resetUserPassword(event) {
    event.preventDefault();
    setResetStatus({ loading: true, error: "" });
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(resetTarget.uid)}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ temporaryPassword: resetPassword }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to reset the password.");
      setUsers((current) => current.map((user) => user.uid === data.user.uid ? data.user : user));
      setCreateStatus({ loading: false, error: "", success: `${data.user.name}'s temporary password has been reset.` });
      setResetTarget(null);
      setResetPassword("");
      setResetStatus({ loading: false, error: "" });
    } catch (error) {
      setResetStatus({ loading: false, error: error.message || "Unable to reset the password." });
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4F726B]">Account</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#17372e]">Settings</h1>
        <p className="mt-2 text-sm text-gray-600">Manage your account and portal access.</p>
      </header>

      {initialUser.mustChangePassword && !passwordChanged ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Change your temporary password</p>
            <p className="mt-1 text-amber-800">You’ll be able to use the rest of the portal after choosing your own password.</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e8f3ee] text-[#4F726B]"><UserRound className="h-5 w-5" /></span>
            <div>
              <h2 className="text-lg font-semibold text-[#17372e]">Profile</h2>
              <p className="text-sm text-gray-500">Your signed-in account</p>
            </div>
          </div>
          <dl className="mt-6 space-y-4 text-sm">
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Name</dt><dd className="mt-1 font-semibold text-gray-900">{initialUser.name || "Staff member"}</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Email</dt><dd className="mt-1 break-all font-semibold text-gray-900">{initialUser.email}</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Role</dt><dd className="mt-1"><span className="inline-flex rounded-full bg-[#e8f3ee] px-2.5 py-1 text-xs font-semibold text-[#31564a]">{adminRoleLabel(initialUser.role)}</span></dd></div>
          </dl>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e8f3ee] text-[#4F726B]"><KeyRound className="h-5 w-5" /></span>
            <div>
              <h2 className="text-lg font-semibold text-[#17372e]">Change password</h2>
              <p className="text-sm text-gray-500">Choose a password only you know.</p>
            </div>
          </div>
          <form onSubmit={changePassword} className="mt-6 space-y-4">
            <div><label htmlFor="current-password" className="text-sm font-medium text-gray-700">Current password</label><Input id="current-password" type="password" autoComplete="current-password" required maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-2 h-11" /></div>
            <div><label htmlFor="new-password" className="text-sm font-medium text-gray-700">New password</label><Input id="new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-2 h-11" /><div className="mt-1"><PasswordGuidance /></div></div>
            <div><label htmlFor="confirm-password" className="text-sm font-medium text-gray-700">Confirm new password</label><Input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-2 h-11" /></div>
            <Message>{passwordStatus.error}</Message><Message type="success">{passwordStatus.success}</Message>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={passwordStatus.loading} className="bg-[#4F726B] text-white hover:bg-[#3c5b54]">{passwordStatus.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Change password</Button>
              {passwordChanged && initialUser.mustChangePassword ? <Button asChild variant="outline"><Link href="/">Continue to dashboard</Link></Button> : null}
            </div>
          </form>
        </section>
      </div>

      {canManageUsers ? (
        <section className="space-y-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e8f3ee] text-[#4F726B]"><Users className="h-5 w-5" /></span>
              <div><h2 className="text-lg font-semibold text-[#17372e]">Portal users</h2><p className="text-sm text-gray-500">Create staff access with a temporary password.</p></div>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#17372e] px-3 py-1.5 text-xs font-semibold text-white"><ShieldCheck className="h-3.5 w-3.5" />Super admin only</span>
          </div>

          <form onSubmit={createUser} className="rounded-xl border border-[#d8e4de] bg-[#f7faf8] p-5">
            <h3 className="font-semibold text-[#17372e]">Add a new user</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div><label htmlFor="staff-name" className="text-sm font-medium text-gray-700">Full name</label><Input id="staff-name" required minLength={2} maxLength={120} value={newUser.name} onChange={(event) => setNewUser((current) => ({ ...current, name: event.target.value }))} className="mt-2 h-11 bg-white" /></div>
              <div><label htmlFor="staff-email" className="text-sm font-medium text-gray-700">Email</label><Input id="staff-email" type="email" required maxLength={254} value={newUser.email} onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))} className="mt-2 h-11 bg-white" /></div>
              <div><label htmlFor="staff-role" className="text-sm font-medium text-gray-700">Role</label><select id="staff-role" value={newUser.role} onChange={(event) => setNewUser((current) => ({ ...current, role: event.target.value }))} className="mt-2 h-11 w-full rounded-md border border-input bg-white px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-[#4F726B]">{ADMIN_ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></div>
              <div><label htmlFor="staff-password" className="text-sm font-medium text-gray-700">Temporary password</label><Input id="staff-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={newUser.temporaryPassword} onChange={(event) => setNewUser((current) => ({ ...current, temporaryPassword: event.target.value }))} className="mt-2 h-11 bg-white" /><div className="mt-1"><PasswordGuidance /></div></div>
            </div>
            <div className="mt-4 space-y-3"><Message>{createStatus.error}</Message><Message type="success">{createStatus.success}</Message><Button type="submit" disabled={createStatus.loading} className="bg-[#4F726B] text-white hover:bg-[#3c5b54]">{createStatus.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add user</Button></div>
          </form>

          <div>
            <h3 className="font-semibold text-[#17372e]">Existing users</h3>
            {usersLoading ? <p role="status" className="mt-4 flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Loading users…</p> : null}
            <Message>{usersError}</Message>
            {!usersLoading && !usersError ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
                {users.length ? users.map((user) => (
                  <div key={user.uid} className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-900">{user.name}</p><p className="mt-0.5 truncate text-xs text-gray-500">{user.email}</p></div>
                    <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#e8f3ee] px-2.5 py-1 text-xs font-semibold text-[#31564a]">{user.roleLabel || adminRoleLabel(user.role)}</span>{user.mustChangePassword ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Password change required</span> : null}{user.uid !== initialUser.uid ? <Button type="button" size="sm" variant="outline" onClick={() => { setResetTarget(user); setResetPassword(""); setResetStatus({ loading: false, error: "" }); }}>Reset password</Button> : null}</div>
                  </div>
                )) : <p className="px-4 py-8 text-center text-sm text-gray-500">No Firebase-backed portal users yet.</p>}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {resetTarget ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#17372e]/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !resetStatus.loading) setResetTarget(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="reset-password-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h2 id="reset-password-title" className="text-xl font-semibold text-[#17372e]">Reset temporary password</h2><p className="mt-1 text-sm text-gray-600">{resetTarget.name} will be asked to change it after signing in.</p></div><button type="button" aria-label="Close" disabled={resetStatus.loading} onClick={() => setResetTarget(null)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button></div>
            <form onSubmit={resetUserPassword} className="mt-5 space-y-4"><div><label htmlFor="reset-password" className="text-sm font-medium text-gray-700">New temporary password</label><Input id="reset-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} className="mt-2 h-11" /><div className="mt-1"><PasswordGuidance /></div></div><Message>{resetStatus.error}</Message><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={resetStatus.loading} onClick={() => setResetTarget(null)}>Cancel</Button><Button type="submit" disabled={resetStatus.loading} className="bg-[#4F726B] text-white hover:bg-[#3c5b54]">{resetStatus.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Reset password</Button></div></form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
