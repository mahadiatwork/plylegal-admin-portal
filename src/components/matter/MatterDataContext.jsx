"use client";

import { createContext, useContext } from "react";

const MatterDataContext = createContext(null);

export function MatterDataProvider({ children, value }) {
  return (
    <MatterDataContext.Provider value={value}>
      {children}
    </MatterDataContext.Provider>
  );
}

export function useMatterData() {
  return useContext(MatterDataContext);
}
