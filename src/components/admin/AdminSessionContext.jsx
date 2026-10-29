"use client";

import { createContext, useContext } from "react";

const AdminSessionContext = createContext(null);

export function AdminSessionProvider({ user, children }) {
  return <AdminSessionContext.Provider value={user}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession() {
  return useContext(AdminSessionContext);
}
