import React, { createContext, useContext, ReactNode } from 'react';

interface AuthContextType {
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
  authOpts: Record<string, never>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const token = "no-auth";

  const login = (_newToken: string) => {};

  const logout = () => {};

  const authOpts = {};

  return (
    <AuthContext.Provider value={{ token, login, logout, authOpts }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
