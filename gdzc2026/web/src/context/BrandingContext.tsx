import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/** 与后端默认及参数设置中的「产品名称」一致 */
export const DEFAULT_APP_TITLE = "资产与终端一体化平台";

export type BrandingState = {
  companyName: string;
  appTitle: string;
  logoUrl: string;
  loading: boolean;
  refresh: () => Promise<void>;
};

const BrandingContext = createContext<BrandingState | null>(null);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [companyName, setCompanyName] = useState("");
  const [appTitle, setAppTitle] = useState(DEFAULT_APP_TITLE);
  const [logoUrl, setLogoUrl] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/public/branding");
      if (!r.ok) {
        setLoading(false);
        return;
      }
      const j = (await r.json()) as {
        companyName?: string;
        appTitle?: string;
        logoUrl?: string;
      };
      setCompanyName(j.companyName ?? "");
      setAppTitle(j.appTitle?.trim() || DEFAULT_APP_TITLE);
      setLogoUrl(j.logoUrl?.trim() ?? "");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (loading) return;
    const cn = companyName.trim();
    const at = appTitle.trim() || DEFAULT_APP_TITLE;
    document.title = cn ? `${cn} · ${at}` : at;
  }, [loading, companyName, appTitle]);

  const value: BrandingState = {
    companyName,
    appTitle,
    logoUrl,
    loading,
    refresh,
  };

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): BrandingState {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error("useBranding 须在 BrandingProvider 内使用");
  return ctx;
}
