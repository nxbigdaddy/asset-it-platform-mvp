import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api";
import { PageShell } from "../components/PageShell";

type Subnet = {
  id: string;
  cidr: string;
  vlanId: string | null;
  purpose: string;
  gateway: string | null;
  dns: string | null;
  note: string | null;
};

export function NetworkPage() {
  const [subnets, setSubnets] = useState<Subnet[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [suggest, setSuggest] = useState<Record<string, string | null>>({});

  useEffect(() => {
    apiGet<Subnet[]>("/api/subnets")
      .then(setSubnets)
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    subnets.forEach((s) => {
      apiGet<{ suggestedIp: string | null }>(`/api/subnets/${s.id}/suggest-ip`)
        .then((r) => setSuggest((prev) => ({ ...prev, [s.id]: r.suggestedIp })))
        .catch(() => {});
    });
  }, [subnets]);

  if (err) {
    return (
      <PageShell title="网段与 IP" showDevBanner={false}>
        <div className="alert">{err}</div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="网段与 IP"
      description="网段与 IP 在资产创建时写入；此处展示网段与建议下一空闲地址（/24 简化逻辑）。"
      showDevBanner={false}
      extra={
        <Link to="/app/network/ip-records" className="mock-btn ghost">
          IP 分配记录
        </Link>
      }
    >
      {subnets.length === 0 ? (
        <div className="empty-state">暂无网段，请 seed 或通过 API 创建。</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>CIDR</th>
                <th>VLAN</th>
                <th>用途</th>
                <th>网关</th>
                <th>DNS</th>
                <th>建议下一 IP</th>
              </tr>
            </thead>
            <tbody>
              {subnets.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.cidr}</td>
                  <td>{s.vlanId ?? "—"}</td>
                  <td>{s.purpose}</td>
                  <td className="mono">{s.gateway ?? "—"}</td>
                  <td className="mono">{s.dns ?? "—"}</td>
                  <td className="mono">{suggest[s.id] ?? "…"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
