import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiGet } from "../api";
import { PageShell } from "../components/PageShell";

type Summary = {
  byStatus: { status: string; count: number }[];
  totalOriginalValue: string;
};

export function DashboardPage() {
  const [health, setHealth] = useState<string>("…");
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    apiGet<{ ok: boolean }>("/health")
      .then((h) => setHealth(h.ok ? "正常" : "异常"))
      .catch(() => setHealth("无法连接"));
    apiGet<Summary>("/api/reports/summary-data")
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  return (
    <PageShell
      title="工作台"
      description="欢迎使用固定资产与 IT 一体化管理平台。以下为常用入口与系统状态。"
      showDevBanner={false}
    >
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">接口状态</div>
          <div className="stat-value">{health}</div>
        </div>
        {summary && (
          <div className="stat-card">
            <div className="stat-label">资产原值合计</div>
            <div className="stat-value">{summary.totalOriginalValue}</div>
          </div>
        )}
        {summary && (
          <div className="stat-card muted-card">
            <div className="stat-label">按状态条数</div>
            <div className="stat-hint">
              {summary.byStatus.slice(0, 4).map((s) => (
                <span key={s.status} style={{ marginRight: 8 }}>
                  {s.status}:{s.count}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="stat-card muted-card">
          <div className="stat-label">说明</div>
          <div className="stat-hint">开发模式下前端通过 Vite 代理访问后端 API。</div>
        </div>
      </div>

      <h2 className="dash-section-title">常用入口</h2>
      <div className="quick-actions">
        <Link className="qa-btn primary" to="/app/assets">
          资产台账
        </Link>
        <Link className="qa-btn" to="/app/assets/new">
          新建资产
        </Link>
        <Link className="qa-btn" to="/app/org">
          组织与人员
        </Link>
        <Link className="qa-btn" to="/app/network">
          网段与 IP
        </Link>
        <Link className="qa-btn" to="/app/inventory/tasks">
          盘点任务
        </Link>
        <Link className="qa-btn" to="/app/reports/summary">
          汇总报表
        </Link>
        <Link className="qa-btn" to="/app/system/settings">
          参数设置
        </Link>
      </div>

      <div className="hint-box">
        <strong>首次部署</strong>：请在后端目录执行 <code>npx prisma db push</code> 与{" "}
        <code>npx prisma db seed</code>，默认管理员账号见登录页说明。
      </div>
    </PageShell>
  );
}
