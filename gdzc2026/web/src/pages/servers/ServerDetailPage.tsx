import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api";
import { PageShell } from "../../components/PageShell";
import { useAuth } from "../../context/AuthContext";

type Credential = {
  id: string;
  authType: string;
  username: string | null;
  keyComment: string | null;
  updatedAt: string;
};

type RoleBinding = {
  id: string;
  role: string;
  isPrimary: boolean;
  configJson: string;
  allowWrite: boolean;
  allowAutomation: boolean;
};

type ServerDetail = {
  id: string;
  name: string;
  host: string;
  osType: string;
  description: string | null;
  environment: string | null;
  enabled: boolean;
  lastProbeAt: string | null;
  lastProbeOk: boolean | null;
  lastProbeMsg: string | null;
  credential: Credential | null;
  roleBindings: RoleBinding[];
};

type TabKey = "overview" | "ad" | "print" | "file" | "web" | "db";

type RoleProbeResult = {
  ok: boolean;
  message: string;
  checks?: { kind: string; target: string; ok: boolean; detail: string }[];
};

type ProbeSegment = "print" | "file-share" | "web" | "database";

function RoleBindingProbeBlock({
  serverId,
  binding,
  segment,
  hint,
  canProbe,
  isAdmin,
  onSaved,
}: {
  serverId: string;
  binding: RoleBinding;
  segment: ProbeSegment;
  hint: string;
  canProbe: boolean;
  isAdmin: boolean;
  onSaved: () => void;
}) {
  const [cfg, setCfg] = useState(binding.configJson || "{}");
  const [result, setResult] = useState<RoleProbeResult | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCfg(binding.configJson || "{}");
  }, [binding.configJson, binding.id]);

  async function runProbe() {
    try {
      const r = await apiPost<RoleProbeResult>(`/api/servers/${serverId}/roles/${binding.id}/${segment}/probe`, {});
      setResult(r);
    } catch (e) {
      alert(e instanceof Error ? e.message : "探测失败");
    }
  }

  return (
    <div style={{ marginBottom: 20, padding: 12, border: "1px solid rgba(0,0,0,.1)", borderRadius: 6 }}>
      <p className="mono" style={{ fontSize: 11, marginBottom: 8 }}>
        绑定 ID: {binding.id}
      </p>
      <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
        {hint}
      </p>
      {isAdmin ? (
        <>
          <label className="mock-form-row" style={{ alignItems: "flex-start", flexDirection: "column", gap: 6 }}>
            <span>configJson（可配置 tcpPorts、Web 的 httpPort/httpsPort/probePath/tlsInsecure 等）</span>
            <textarea
              className="mock-input"
              style={{ width: "100%", minHeight: 88, fontFamily: "monospace", fontSize: 12 }}
              value={cfg}
              onChange={(e) => setCfg(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="mock-btn ghost"
            style={{ marginBottom: 8 }}
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void apiPatch(`/api/servers/${serverId}/roles/${binding.id}`, { configJson: cfg })
                .then(() => {
                  onSaved();
                })
                .catch((e: Error) => alert(e.message))
                .finally(() => setSaving(false));
            }}
          >
            {saving ? "保存中…" : "保存配置"}
          </button>
        </>
      ) : null}
      <div className="form-row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="mock-btn primary" disabled={!canProbe} onClick={() => void runProbe()}>
          运行探活
        </button>
        <button
          type="button"
          className="mock-btn ghost"
          disabled={!canProbe}
          onClick={() => {
            void apiGet<RoleProbeResult>(`/api/servers/${serverId}/roles/${binding.id}/${segment}/scan`)
              .then(setResult)
              .catch((e: Error) => alert(e.message));
          }}
        >
          GET 扫描（同探活）
        </button>
      </div>
      {result ? (
        <div style={{ marginTop: 12 }}>
          <p style={{ marginBottom: 8 }}>
            <strong>{result.ok ? "部分可达" : "未全部可达"}</strong> — {result.message}
          </p>
          {result.checks && result.checks.length > 0 ? (
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>类型</th>
                    <th>目标</th>
                    <th>结果</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  {result.checks.map((c, i) => (
                    <tr key={`${c.target}-${i}`}>
                      <td>{c.kind}</td>
                      <td className="mono" style={{ fontSize: 11 }}>
                        {c.target}
                      </td>
                      <td>{c.ok ? "✓" : "✗"}</td>
                      <td className="muted" style={{ fontSize: 12 }}>
                        {c.detail}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ServerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canProbe = user?.role !== "viewer";
  const [server, setServer] = useState<ServerDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [adConfig, setAdConfig] = useState("{}");
  const [ous, setOus] = useState<{ dn: string; name: string }[] | null>(null);
  const [users, setUsers] = useState<{ dn: string; sAMAccountName: string; displayName: string }[] | null>(null);
  const [groups, setGroups] = useState<{ dn: string; name: string; sAMAccountName: string }[] | null>(null);
  const [userQ, setUserQ] = useState("");
  const [groupQ, setGroupQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  // 选中项：用于把“写入表单”自动填充，提升 AD 标签页的集中度。
  const [selectedOuDn, setSelectedOuDn] = useState<string>("");
  const [selectedUserDn, setSelectedUserDn] = useState<string>("");
  const [selectedGroupDn, setSelectedGroupDn] = useState<string>("");

  const load = useCallback(() => {
    if (!id) return;
    apiGet<ServerDetail>(`/api/servers/${id}`)
      .then((s) => {
        setServer(s);
        const ad = s.roleBindings.find((r) => r.role === "AD");
        if (ad) {
          setAdConfig(ad.configJson || "{}");
        } else {
          setAdConfig('{\n  "baseDN": "DC=example,DC=local",\n  "ldapUrl": ""\n}');
        }
      })
      .catch((e: Error) => setErr(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const adRb = useMemo(
    () => server?.roleBindings.find((r) => r.role === "AD"),
    [server],
  );

  async function saveServer(patch: Partial<ServerDetail> & { credential?: { authType: string; username: string | null; secret: string } | null }) {
    if (!id) return;
    setMsg(null);
    try {
      await apiPatch(`/api/servers/${id}`, patch);
      load();
      setMsg("已保存");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "失败");
    }
  }

  if (err && !server) {
    return (
      <PageShell title="服务器详情" showDevBanner={false}>
        <div className="inline-alert">{err}</div>
        <Link to="/app/servers">返回</Link>
      </PageShell>
    );
  }

  if (!server || !id) {
    return (
      <PageShell title="服务器详情" showDevBanner={false}>
        <p className="muted">加载中…</p>
      </PageShell>
    );
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "概览" },
    { key: "ad", label: "AD" },
    { key: "print", label: "打印" },
    { key: "file", label: "文件共享" },
    { key: "web", label: "Web" },
    { key: "db", label: "数据库" },
  ];

  return (
    <PageShell
      title={`${server.name}`}
      description={`${server.host} · ${server.osType}`}
      showDevBanner={false}
      extra={
        <div className="page-actions">
          <Link to="/app/servers" className="mock-btn link">
            返回列表
          </Link>
          {canProbe ? (
            <button
              type="button"
              className="mock-btn ghost"
              onClick={() => void apiPost(`/api/servers/${id}/probe`, {}).then(load)}
            >
              探活
            </button>
          ) : null}
        </div>
      }
    >
      {msg && <div className="inline-alert">{msg}</div>}
      <div className="detail-tab-like" style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? "mock-btn primary" : "mock-btn ghost"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="mock-form" style={{ maxWidth: 560 }}>
          {isAdmin ? (
            <>
              <div className="mock-form-row">
                <label>显示名称</label>
                <input
                  className="mock-input"
                  defaultValue={server.name}
                  key={server.name}
                  onBlur={(e) => {
                    if (e.target.value !== server.name) void saveServer({ name: e.target.value });
                  }}
                />
              </div>
              <div className="mock-form-row">
                <label>主机</label>
                <input
                  className="mock-input"
                  defaultValue={server.host}
                  key={server.host}
                  onBlur={(e) => {
                    if (e.target.value !== server.host) void saveServer({ host: e.target.value });
                  }}
                />
              </div>
              <div className="mock-form-row">
                <label>说明</label>
                <input
                  className="mock-input"
                  defaultValue={server.description ?? ""}
                  onBlur={(e) => void saveServer({ description: e.target.value || null })}
                />
              </div>
              <h3 className="detail-panel-title">凭据</h3>
              <p className="muted" style={{ fontSize: 12 }}>
                更新密码需同时填写新密码。生产环境建议在服务端配置环境变量 <code className="mono">SERVER_CREDENTIAL_KEY</code>（64
                位十六进制）以加密存储密码。
              </p>
              <CredentialForm
                serverId={id}
                credential={server.credential}
                onSaved={load}
              />
              <h3 className="detail-panel-title">角色绑定</h3>
              <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                「允许写入」与全局 <code className="mono">server.management.global_write_enabled</code> 双开关控制 AD
                等写操作；「允许自动化」与全局{" "}
                <code className="mono">server.management.global_automation_enabled</code> 供后续定时/Agent 使用。
              </p>
              {server.roleBindings.map((r) => (
                <div
                  key={r.id}
                  style={{
                    marginBottom: 10,
                    padding: 10,
                    border: "1px solid rgba(0,0,0,.1)",
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                >
                  <div style={{ marginBottom: 6 }}>
                    <strong>{r.role}</strong>
                    {r.isPrimary ? " · 主" : ""}
                  </div>
                  <div className="form-row" style={{ flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={r.isPrimary}
                        onChange={(e) =>
                          void apiPatch(`/api/servers/${id}/roles/${r.id}`, { isPrimary: e.target.checked }).then(load)
                        }
                      />
                      主实例
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={r.allowWrite}
                        onChange={(e) =>
                          void apiPatch(`/api/servers/${id}/roles/${r.id}`, { allowWrite: e.target.checked }).then(load)
                        }
                      />
                      允许写入
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={r.allowAutomation}
                        onChange={(e) =>
                          void apiPatch(`/api/servers/${id}/roles/${r.id}`, { allowAutomation: e.target.checked }).then(
                            load,
                          )
                        }
                      />
                      允许自动化
                    </label>
                    <button
                      type="button"
                      className="mock-btn ghost"
                      onClick={() => {
                        if (!window.confirm("删除该角色绑定？")) return;
                        void apiDelete(`/api/servers/${id}/roles/${r.id}`).then(load);
                      }}
                    >
                      删除绑定
                    </button>
                  </div>
                </div>
              ))}
              <AddRoleForm serverId={id} onAdded={load} />
              <h3 className="detail-panel-title" style={{ marginTop: 20 }}>
                危险操作
              </h3>
              <button
                type="button"
                className="mock-btn"
                style={{ borderColor: "#b00020", color: "#b00020" }}
                onClick={() => {
                  if (!window.confirm("将永久删除该纳管服务器及其角色绑定，是否继续？")) return;
                  void apiDelete(`/api/servers/${id}`)
                    .then(() => nav("/app/servers"))
                    .catch((e: Error) => alert(e.message));
                }}
              >
                删除此服务器
              </button>
            </>
          ) : (
            <p className="muted">仅管理员可编辑服务器与凭据。</p>
          )}
        </div>
      )}

      {tab === "ad" && (
        <div>
          {!adRb ? (
            <p className="muted">尚未绑定 AD 角色。请在「概览」中添加角色「AD」，并填写 configJson（含 baseDN）。</p>
          ) : (
            <>
              <p className="muted" style={{ marginBottom: 8 }}>
                安全：LDAP 写入受<strong>全局参数</strong> <code className="mono">server.management.global_write_enabled</code>{" "}
                与「概览」中该角色的<strong>允许写入</strong>双开关控制；设密码、改密码需 <strong>LDAPS</strong>（ldaps://:636）。
              </p>
              {isAdmin ? (
                <div className="mock-form-row" style={{ alignItems: "flex-start" }}>
                  <label>configJson</label>
                  <textarea
                    className="mock-input"
                    style={{ minHeight: 120, width: "100%" }}
                    value={adConfig}
                    onChange={(e) => setAdConfig(e.target.value)}
                  />
                </div>
              ) : null}
              {isAdmin ? (
                <button
                  type="button"
                  className="mock-btn primary"
                  style={{ marginBottom: 12 }}
                  onClick={() => {
                    void apiPatch(`/api/servers/${id}/roles/${adRb.id}`, { configJson: adConfig }).then(() => {
                      load();
                      setMsg("AD 配置已保存");
                    });
                  }}
                >
                  保存 AD 配置
                </button>
              ) : null}
              <div className="form-row" style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className="mock-btn"
                  disabled={!canProbe}
                  onClick={() =>
                    void apiPost<{ ok: boolean; message: string }>(`/api/servers/${id}/roles/${adRb.id}/ad/test`, {})
                      .then((r) => alert(r.message))
                      .catch((e: Error) => alert(e.message))
                  }
                >
                  LDAP 连接测试
                </button>
                <button
                  type="button"
                  className="mock-btn ghost"
                  disabled={!canProbe}
                  onClick={() =>
                    void apiGet<{ dn: string; name: string }[]>(`/api/servers/${id}/roles/${adRb.id}/ad/ous`).then(
                      (rows) => {
                        setOus(rows);
                        if (rows.length) {
                          const nextOuDn = rows[0].dn;
                          if (!selectedOuDn.trim()) setSelectedOuDn(nextOuDn);
                          // 初次加载时直接把第一个 OU 下的用户也拉出来，减少“还要再点一次”的断点。
                          if (!users || !users.length) {
                            void apiGet<{ dn: string; sAMAccountName: string; displayName: string }[]>(
                              `/api/servers/${id}/roles/${adRb.id}/ad/users-in-ou?ouDn=${encodeURIComponent(nextOuDn)}&take=50`,
                            )
                              .then((uRows) => setUsers(uRows))
                              .catch((e: Error) => alert(e.message));
                          }
                        }
                      },
                    )
                      .catch((e: Error) => alert(e.message))
                  }
                >
                  加载 OU 列表
                </button>
              </div>
              <div
                className="form-grid"
                style={{
                  gridTemplateColumns: "minmax(260px, 1fr) minmax(420px, 1fr) minmax(520px, 1.2fr)",
                  alignItems: "start",
                }}
              >
                {/* 左侧：OU 列表（仅显示名称） */}
                <div>
                  {ous && (
                    <div className="table-shell" style={{ marginBottom: 16 }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>名称</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ous.slice(0, 100).map((o) => (
                            <tr
                              key={o.dn}
                              onClick={() => {
                                setSelectedOuDn(o.dn);
                                setUsers(null);
                                setSelectedUserDn("");
                                setSelectedGroupDn("");
                                void apiGet<{ dn: string; sAMAccountName: string; displayName: string }[]>(
                                  `/api/servers/${id}/roles/${adRb.id}/ad/users-in-ou?ouDn=${encodeURIComponent(o.dn)}&take=50`,
                                )
                                  .then((rows) => setUsers(rows))
                                  .catch((e: Error) => alert(e.message));
                              }}
                              style={{
                                cursor: "pointer",
                                background: selectedOuDn === o.dn ? "#e6f4ff" : undefined,
                              }}
                              title="点击选择：加载该 OU 下的用户"
                            >
                              <td>{o.name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 中间：用户列表（随 OU 展开） */}
                <div>
                  <p className="muted" style={{ margin: 0, marginBottom: 8, fontSize: 13 }}>
                    已按所选 OU 自动加载用户列表（不支持过滤）。点击用户即可执行增删改查。
                  </p>

                  {users && (
                    <div className="table-shell" style={{ marginBottom: 16 }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>账号</th>
                            <th>显示名</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map((u) => (
                            <tr
                              key={u.dn}
                              onClick={() => setSelectedUserDn(u.dn)}
                              style={{
                                cursor: "pointer",
                                background: selectedUserDn === u.dn ? "#e6f4ff" : undefined,
                              }}
                              title="点击选择：切换到修改用户属性"
                            >
                              <td className="mono">{u.sAMAccountName}</td>
                              <td>{u.displayName}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="form-row" style={{ marginBottom: 8 }}>
                    <input
                      className="mock-input"
                      placeholder="搜索组 cn / sAMAccountName"
                      value={groupQ}
                      onChange={(e) => setGroupQ(e.target.value)}
                    />
                    <button
                      type="button"
                      className="mock-btn ghost"
                      disabled={!canProbe}
                      onClick={() =>
                        void apiGet<{ dn: string; name: string; sAMAccountName: string }[]>(
                          `/api/servers/${id}/roles/${adRb.id}/ad/groups?q=${encodeURIComponent(groupQ)}&take=50`,
                        )
                          .then((rows) => {
                            setGroups(rows);
                            if (rows.length && !selectedGroupDn.trim()) setSelectedGroupDn(rows[0].dn);
                          })
                          .catch((e: Error) => alert(e.message))
                      }
                    >
                      查询安全组
                    </button>
                  </div>

                  {groups && (
                    <div className="table-shell" style={{ marginBottom: 16 }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>名称</th>
                            <th>sAMAccountName</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groups.map((g) => (
                            <tr
                              key={g.dn}
                              onClick={() => setSelectedGroupDn(g.dn)}
                              style={{
                                cursor: "pointer",
                                background: selectedGroupDn === g.dn ? "#e6f4ff" : undefined,
                              }}
                              title="点击选择：用于加入/移除组成员"
                            >
                              <td>{g.name}</td>
                              <td className="mono">{g.sAMAccountName}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 右侧：写入/修改面板 */}
                <div>
                  {isAdmin && adRb.allowWrite ? (
                    <AdWritePanel
                      serverId={id}
                      bindingId={adRb.id}
                      onDone={load}
                      selectedOuDn={selectedOuDn}
                      selectedUserDn={selectedUserDn}
                      selectedGroupDn={selectedGroupDn}
                    />
                  ) : isAdmin ? (
                    <p className="muted" style={{ marginTop: 12 }}>
                      写入操作已关闭：请勾选上方「允许对该 AD 绑定执行写入」，并确保系统参数中全局写入已开启。
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "print" && (
        <div>
          {server.roleBindings.filter((r) => r.role === "PRINT").length === 0 ? (
            <p className="muted">未绑定打印角色。请在概览中添加「PRINT」。</p>
          ) : (
            server.roleBindings
              .filter((r) => r.role === "PRINT")
              .map((r) => (
                <RoleBindingProbeBlock
                  key={r.id}
                  serverId={id}
                  binding={r}
                  segment="print"
                  hint='默认探测 TCP 445、9100；可在 configJson 中设置 "tcpPorts": [445, 9100, 135]。打印机列表需 WMI/WinRM。'
                  canProbe={canProbe}
                  isAdmin={isAdmin}
                  onSaved={load}
                />
              ))
          )}
        </div>
      )}

      {tab === "file" && (
        <div>
          {server.roleBindings.filter((r) => r.role === "FILE_SHARE").length === 0 ? (
            <p className="muted">未绑定文件共享角色。请在概览中添加「FILE_SHARE」。</p>
          ) : (
            server.roleBindings
              .filter((r) => r.role === "FILE_SHARE")
              .map((r) => (
                <RoleBindingProbeBlock
                  key={r.id}
                  serverId={id}
                  binding={r}
                  segment="file-share"
                  hint='默认探测 445、139；可在 configJson 中设置 "tcpPorts"。共享枚举与 ACL 后续对接 SMB。'
                  canProbe={canProbe}
                  isAdmin={isAdmin}
                  onSaved={load}
                />
              ))
          )}
        </div>
      )}

      {tab === "web" && (
        <div>
          {server.roleBindings.filter((r) => r.role === "WEB").length === 0 ? (
            <p className="muted">未绑定 Web 角色。请在概览中添加「WEB」。</p>
          ) : (
            server.roleBindings
              .filter((r) => r.role === "WEB")
              .map((r) => (
                <RoleBindingProbeBlock
                  key={r.id}
                  serverId={id}
                  binding={r}
                  segment="web"
                  hint='除 TCP 外会发起 HTTP(S) HEAD；configJson 示例：{"tcpPorts":[80,443,8080],"httpPort":80,"httpsPort":443,"probePath":"/","tlsInsecure":false}'
                  canProbe={canProbe}
                  isAdmin={isAdmin}
                  onSaved={load}
                />
              ))
          )}
        </div>
      )}

      {tab === "db" && (
        <div>
          {server.roleBindings.filter((r) => r.role === "DATABASE").length === 0 ? (
            <p className="muted">未绑定数据库角色。请在概览中添加「DATABASE」。</p>
          ) : (
            server.roleBindings
              .filter((r) => r.role === "DATABASE")
              .map((r) => (
                <RoleBindingProbeBlock
                  key={r.id}
                  serverId={id}
                  binding={r}
                  segment="database"
                  hint='TCP 端口探活（非 SQL 登录验证）。configJson 示例：{"engine":"mysql"} 或 {"engine":"postgresql","port":5432} 或 {"tcpPorts":[3306,3307]}；未配置时默认探测 3306、5432、1433。'
                  canProbe={canProbe}
                  isAdmin={isAdmin}
                  onSaved={load}
                />
              ))
          )}
        </div>
      )}
    </PageShell>
  );
}

function AdWritePanel({
  serverId,
  bindingId,
  onDone,
  selectedOuDn,
  selectedUserDn,
  selectedGroupDn,
}: {
  serverId: string;
  bindingId: string;
  onDone: () => void;
  selectedOuDn: string;
  selectedUserDn: string;
  selectedGroupDn: string;
}) {
  type WriteAction =
    | "createOu"
    | "deleteEntry"
    | "createUser"
    | "modifyUser"
    | "setPassword"
    | "addMemberToGroup"
    | "removeMemberFromGroup";

  const [ouParent, setOuParent] = useState("");
  const [ouName, setOuName] = useState("");
  const [delDn, setDelDn] = useState("");
  const [cuParent, setCuParent] = useState("");
  const [cuSam, setCuSam] = useState("");
  const [cuCn, setCuCn] = useState("");
  const [cuDisp, setCuDisp] = useState("");
  const [cuPwd, setCuPwd] = useState("");
  const [muDn, setMuDn] = useState("");
  const [muDisp, setMuDisp] = useState("");
  const [muDesc, setMuDesc] = useState("");
  const [muUac, setMuUac] = useState("");
  const [spDn, setSpDn] = useState("");
  const [spPwd, setSpPwd] = useState("");
  const [agGroup, setAgGroup] = useState("");
  const [agMember, setAgMember] = useState("");
  const [rgGroup, setRgGroup] = useState("");
  const [rgMember, setRgMember] = useState("");

  const [writeAction, setWriteAction] = useState<WriteAction>("createUser");

  // 将“点击选择的 OU / 用户 / 组”自动填充到写入表单的关键输入中。
  // 仅在对应输入为空时才自动填充，避免覆盖用户正在编辑的内容。
  useEffect(() => {
    const x = selectedOuDn.trim();
    if (!x) return;
    setOuParent(x);
    setCuParent(x);
    setDelDn(x);
  }, [selectedOuDn]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedUserDn.trim()) setWriteAction("modifyUser");
    else setWriteAction("createUser");
  }, [selectedUserDn]);

  useEffect(() => {
    const x = selectedUserDn.trim();
    if (!x) {
      setMuDn("");
      setSpDn("");
      setAgMember("");
      setRgMember("");
      return;
    }
    setDelDn(x);
    setMuDn(x);
    setSpDn(x);
    setAgMember(x);
    setRgMember(x);
  }, [selectedUserDn]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const x = selectedGroupDn.trim();
    if (!x) {
      setAgGroup("");
      setRgGroup("");
      return;
    }
    setAgGroup(x);
    setRgGroup(x);
    setDelDn(x);
  }, [selectedGroupDn]); // eslint-disable-line react-hooks/exhaustive-deps

  async function postWrite(body: Record<string, unknown>) {
    try {
      const r = await apiPost<{ ok: boolean; message: string }>(
        `/api/servers/${serverId}/roles/${bindingId}/ad/write`,
        body,
      );
      alert(r.message);
      onDone();
    } catch (e) {
      alert(e instanceof Error ? e.message : "失败");
    }
  }

  return (
    <div style={{ marginTop: 16, padding: 12, border: "1px solid rgba(0,0,0,.12)", borderRadius: 6 }}>
      <div className="form-row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <h3 className="detail-panel-title" style={{ margin: 0 }}>
          AD 写入
        </h3>
        <div className="form-row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 12 }}>
            操作
          </span>
          <button
            type="button"
            className={writeAction === "createOu" ? "mock-btn primary" : "mock-btn ghost"}
            onClick={() => setWriteAction("createOu")}
          >
            新建 OU
          </button>
          <button
            type="button"
            className={writeAction === "createUser" ? "mock-btn primary" : "mock-btn ghost"}
            onClick={() => setWriteAction("createUser")}
          >
            新建用户
          </button>
          <button
            type="button"
            className={writeAction === "modifyUser" ? "mock-btn primary" : "mock-btn ghost"}
            onClick={() => setWriteAction("modifyUser")}
          >
            修改属性
          </button>
          <button
            type="button"
            className={writeAction === "deleteEntry" ? "mock-btn primary" : "mock-btn ghost"}
            onClick={() => setWriteAction("deleteEntry")}
          >
            删除
          </button>
          <button
            type="button"
            className={writeAction === "setPassword" ? "mock-btn primary" : "mock-btn ghost"}
            onClick={() => setWriteAction("setPassword")}
          >
            重置密码
          </button>
          <button
            type="button"
            className={writeAction === "addMemberToGroup" ? "mock-btn primary" : "mock-btn ghost"}
            onClick={() => setWriteAction("addMemberToGroup")}
          >
            加入组
          </button>
          <button
            type="button"
            className={writeAction === "removeMemberFromGroup" ? "mock-btn primary" : "mock-btn ghost"}
            onClick={() => setWriteAction("removeMemberFromGroup")}
          >
            移出组
          </button>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 12 }}>
        所有 DN 须在配置的 baseDN 命名空间内；删除不可恢复。设密码需 LDAPS。
      </p>

      <div className="hint-box" style={{ marginBottom: 12 }}>
        当前选择：OU <span className="mono">{selectedOuDn || "—"}</span> · 用户{" "}
        <span className="mono">{selectedUserDn || "—"}</span> · 组 <span className="mono">{selectedGroupDn || "—"}</span>
      </div>

      {writeAction === "createOu" && (
        <>
          <h4 className="detail-panel-title" style={{ fontSize: 14 }}>
            新建 OU
          </h4>
          <form
            className="form-row"
            style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void postWrite({ action: "createOu", parentDn: ouParent.trim(), name: ouName.trim() });
            }}
          >
            <input
              className="mock-input"
              placeholder="父容器 DN（如 OU=Dept,DC=corp,DC=local）"
              value={ouParent}
              onChange={(e) => setOuParent(e.target.value)}
              style={{ minWidth: 280 }}
              required
            />
            <input
              className="mock-input"
              placeholder="新 OU 名（不含 OU= 前缀）"
              value={ouName}
              onChange={(e) => setOuName(e.target.value)}
              required
            />
            <button type="submit" className="mock-btn primary">
              创建 OU
            </button>
          </form>
        </>
      )}

      {writeAction === "deleteEntry" && (
        <>
          <h4 className="detail-panel-title" style={{ fontSize: 14 }}>
            删除对象
          </h4>
          <div className="form-row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <input
              className="mock-input"
              placeholder="要删除的完整 DN"
              value={delDn}
              onChange={(e) => setDelDn(e.target.value)}
              style={{ minWidth: 420 }}
              required
            />
            <button
              type="button"
              className="mock-btn"
              onClick={() => {
                if (!window.confirm("确认删除该对象？")) return;
                void postWrite({ action: "deleteEntry", dn: delDn.trim() });
              }}
            >
              删除
            </button>
          </div>
        </>
      )}

      {writeAction === "createUser" && (
        <>
          <h4 className="detail-panel-title" style={{ fontSize: 14 }}>
            新建用户
          </h4>
          <form
            className="mock-form"
            style={{ marginBottom: 12, maxWidth: 560 }}
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              const payload: Record<string, unknown> = {
                action: "createUser",
                parentDn: cuParent.trim(),
                sAMAccountName: cuSam.trim(),
                cn: cuCn.trim(),
              };
              if (cuDisp.trim()) payload.displayName = cuDisp.trim();
              if (cuPwd) payload.password = YOUR_PASSWORD;
              void postWrite(payload);
            }}
          >
            <div className="mock-form-row">
              <label>父容器 DN</label>
              <input className="mock-input" value={cuParent} onChange={(e) => setCuParent(e.target.value)} required />
            </div>
            <div className="mock-form-row">
              <label>sAMAccountName</label>
              <input className="mock-input" value={cuSam} onChange={(e) => setCuSam(e.target.value)} required />
            </div>
            <div className="mock-form-row">
              <label>CN（RDN）</label>
              <input className="mock-input" value={cuCn} onChange={(e) => setCuCn(e.target.value)} required />
            </div>
            <div className="mock-form-row">
              <label>显示名（可选）</label>
              <input className="mock-input" value={cuDisp} onChange={(e) => setCuDisp(e.target.value)} />
            </div>
            <div className="mock-form-row">
              <label>初始密码（可选，需 LDAPS）</label>
              <input
                className="mock-input"
                type="password"
                value={cuPwd}
                onChange={(e) => setCuPwd(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <button type="submit" className="mock-btn primary">
              创建用户
            </button>
          </form>
        </>
      )}

      {writeAction === "modifyUser" && (
        <>
          <h4 className="detail-panel-title" style={{ fontSize: 14 }}>
            修改用户属性
          </h4>
          <form
            className="mock-form"
            style={{ marginBottom: 12, maxWidth: 560 }}
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              const payload: Record<string, unknown> = { action: "modifyUser", dn: muDn.trim() };
              if (muDisp.length) payload.displayName = muDisp;
              if (muDesc.length) payload.description = muDesc;
              if (muUac.trim()) payload.userAccountControl = muUac.trim();
              void postWrite(payload);
            }}
          >
            <div className="mock-form-row">
              <label>用户 DN</label>
              <input className="mock-input" value={muDn} onChange={(e) => setMuDn(e.target.value)} required />
            </div>
            <div className="mock-form-row">
              <label>displayName</label>
              <input className="mock-input" value={muDisp} onChange={(e) => setMuDisp(e.target.value)} />
            </div>
            <div className="mock-form-row">
              <label>description</label>
              <input className="mock-input" value={muDesc} onChange={(e) => setMuDesc(e.target.value)} />
            </div>
            <div className="mock-form-row">
              <label>userAccountControl（如 514 禁用 / 512 启用）</label>
              <input
                className="mock-input"
                value={muUac}
                onChange={(e) => setMuUac(e.target.value)}
                placeholder="可选"
              />
            </div>
            <button type="submit" className="mock-btn">
              更新属性
            </button>
          </form>
        </>
      )}

      {writeAction === "setPassword" && (
        <>
          <h4 className="detail-panel-title" style={{ fontSize: 14 }}>
            重置密码
          </h4>
          <form
            className="mock-form"
            style={{ maxWidth: 560 }}
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void postWrite({ action: "setPassword", dn: spDn.trim(), password: YOUR_PASSWORD });
              setSpPwd("");
            }}
          >
            <div className="mock-form-row">
              <label>用户 DN</label>
              <input className="mock-input" value={spDn} onChange={(e) => setSpDn(e.target.value)} required />
            </div>
            <div className="mock-form-row">
              <label>新密码</label>
              <input
                className="mock-input"
                type="password"
                value={spPwd}
                onChange={(e) => setSpPwd(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <button type="submit" className="mock-btn">
              设置密码
            </button>
          </form>
        </>
      )}

      {writeAction === "addMemberToGroup" && (
        <>
          <h4 className="detail-panel-title" style={{ fontSize: 14 }}>
            组 — 添加成员
          </h4>
          <form
            className="mock-form"
            style={{ marginBottom: 12, maxWidth: 560 }}
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void postWrite({
                action: "addMemberToGroup",
                groupDn: agGroup.trim(),
                memberDn: agMember.trim(),
              });
            }}
          >
            <div className="mock-form-row">
              <label>组 DN</label>
              <input className="mock-input" value={agGroup} onChange={(e) => setAgGroup(e.target.value)} required />
            </div>
            <div className="mock-form-row">
              <label>成员 DN（用户等）</label>
              <input
                className="mock-input"
                value={agMember}
                onChange={(e) => setAgMember(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="mock-btn">
              加入组
            </button>
          </form>
        </>
      )}

      {writeAction === "removeMemberFromGroup" && (
        <>
          <h4 className="detail-panel-title" style={{ fontSize: 14 }}>
            组 — 移除成员
          </h4>
          <form
            className="mock-form"
            style={{ maxWidth: 560 }}
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void postWrite({
                action: "removeMemberFromGroup",
                groupDn: rgGroup.trim(),
                memberDn: rgMember.trim(),
              });
            }}
          >
            <div className="mock-form-row">
              <label>组 DN</label>
              <input className="mock-input" value={rgGroup} onChange={(e) => setRgGroup(e.target.value)} required />
            </div>
            <div className="mock-form-row">
              <label>成员 DN</label>
              <input
                className="mock-input"
                value={rgMember}
                onChange={(e) => setRgMember(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="mock-btn">
              从组移除
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function CredentialForm({
  serverId,
  credential,
  onSaved,
}: {
  serverId: string;
  credential: Credential | null;
  onSaved: () => void;
}) {
  const [user, setUser] = useState(credential?.username ?? "");
  const [secret, setSecret] = useState("");
  return (
    <div className="form-row" style={{ flexWrap: "wrap", gap: 8 }}>
      <input
        className="mock-input"
        placeholder="绑定用户名 / DN"
        value={user}
        onChange={(e) => setUser(e.target.value)}
      />
      <input
        className="mock-input"
        type="password"
        placeholder={credential ? "新密码（更新凭据必填）" : "密码"}
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        autoComplete="new-password"
      />
      <button
        type="button"
        className="mock-btn primary"
        onClick={() => {
          if (!secret.trim()) {
            alert("请输入密码");
            return;
          }
          void apiPatch(`/api/servers/${serverId}`, {
            credential: { authType: "PASSWORD", username: user || null, secret, keyComment: null },
          })
            .then(() => {
              setSecret("");
              onSaved();
              alert("凭证已更新");
            })
            .catch((e: Error) => alert(e.message));
        }}
      >
        更新凭据
      </button>
    </div>
  );
}

function AddRoleForm({ serverId, onAdded }: { serverId: string; onAdded: () => void }) {
  const [role, setRole] = useState<"AD" | "PRINT" | "FILE_SHARE" | "WEB" | "DATABASE">("AD");
  return (
    <div className="form-row" style={{ marginTop: 12 }}>
      <select className="mock-input" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
        <option value="AD">AD</option>
        <option value="PRINT">PRINT</option>
        <option value="FILE_SHARE">FILE_SHARE</option>
        <option value="WEB">WEB</option>
        <option value="DATABASE">DATABASE</option>
      </select>
      <button
        type="button"
        className="mock-btn"
        onClick={() =>
          void apiPost(`/api/servers/${serverId}/roles`, {
            role,
            configJson:
              role === "AD"
                ? '{"baseDN":"DC=example,DC=local"}'
                : role === "DATABASE"
                  ? '{"engine":"mysql"}'
                  : "{}",
          }).then(onAdded)
        }
      >
        添加角色
      </button>
    </div>
  );
}
