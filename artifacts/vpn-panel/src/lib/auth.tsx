import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { setAuthTokenGetter } from '@workspace/api-client-react';

interface AuthContextType {
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
  authOpts: Record<string, any>;
}

const AuthContext = createContext<AuthContextType | null>(null);

let _currentToken: string | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('vpn_token'));

  useEffect(() => {
    _currentToken = token;
    setAuthTokenGetter(() => _currentToken);
  }, [token]);

  const login = (newToken: string) => {
    localStorage.setItem('vpn_token', newToken);
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem('vpn_token');
    setToken(null);
  };

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
