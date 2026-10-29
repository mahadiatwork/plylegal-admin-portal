"use client";

import AdminSessionMonitor from "./AdminSessionMonitor";
import AdminAccountMenu from "./AdminAccountMenu";
import { useAdminSession } from "./AdminSessionContext";

export default function AdminNavigation({ user: userProp = null }) {
  const contextUser = useAdminSession();
  const user = userProp || contextUser;

  return (
    <div className="flex items-center">
      <AdminSessionMonitor />
      <AdminAccountMenu user={user} />
    </div>
  );
}
