import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiGet, getToken, loginRequest, setToken } from "../api";

export type AuthUser = {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
  /** JSON 数组字符串，企微部门 id；null 表示不按部门过滤（或沿用后端规则） */
  orgScopeJson: string | null;
};

type AuthState = {
  user: AuthUser | null;
  token: YOUR_SECRET | null;
  ready: boolean;
  login: (username: string, password: YOUR_PASSWORD) => Promise<void>;
  logout: () => void;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setTok] = useState<string | null>(() => getToken());
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const t = getToken();
    setTok(t);
    if (!t) {
      setUser(null);
      setReady(true);
      return;
    }
    try {
      const me = await apiGet<AuthUser>("/api/auth/me");
      setUser(me);
    } catch {
      setUser(null);
      setToken(null);
      setTok(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: YOUR_PASSWORD) => {
    const out = await loginRequest(username, password);
    setToken(out.token);
    setTok(out.token);
    setUser(out.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setTok(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      ready,
      login,
      logout,
    }),
    [user, token, ready, login, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
