'use client';

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

import type { Platform } from '../platform-context/platform-types';

type AdminShellContextValue = {
  platform: Platform | null;
  setPlatform: Dispatch<SetStateAction<Platform | null>>;
};

const AdminShellContext = createContext<AdminShellContextValue | null>(null);

export function AdminShellContextProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const value = useMemo(() => ({ platform, setPlatform }), [platform]);

  return (
    <AdminShellContext.Provider value={value}>
      {children}
    </AdminShellContext.Provider>
  );
}

export function useAdminShellContext(): AdminShellContextValue {
  const context = useContext(AdminShellContext);
  if (!context) {
    throw new Error(
      'useAdminShellContext must be used inside AdminShellContextProvider',
    );
  }
  return context;
}
