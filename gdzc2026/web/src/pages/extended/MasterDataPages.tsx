import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api";
import { PageShell } from "../../components/PageShell";
import { useAuth } from "../../context/AuthContext";

type Cat = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  typeCode: string | null;
};
type Loc = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
};
type Policy = {
  id: string;
  name: string;
  template: string;
  scopeType: string;
  categoryId: string | null;
  siteCode: string | null;
  isDefault: boolean;
};

export function PageAssetCategories() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState<Cat[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const load = useCallback(() => {
    apiGet<Cat[]>("/api/categories")
      .then(setItems)
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageShell
      title="资产分类"
      description="维护分类树，与台账、命名策略联动。仅管理员可增删改。"
      showDevBanner={false}
    >
      {err && <div className="inline-alert">{err}</div>}
      {!items ? (
        <p className="muted">加载中…</p>
      ) : (
        <>
          {isAdmin && (
            <div className="form-row" style={{ marginBottom: 16, gap: 8, flexWrap: "wrap" }}>
              <input
                className="mock-input"
                placeholder="编码"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <input
                className="mock-input"
                placeholder="名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button
                type="button"
                className="mock-btn primary"
                onClick={() => {
                  void apiPost("/api/categories", { code, name }).then(() => {
                    setCode("");
                    setName("");
                    load();
                  });
                }}
              >
                新增
              </button>
            </div>
          )}
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>编码</th>
                  <th>名称</th>
                  <th>类型码</th>
                  <th>排序</th>
                  {isAdmin && <th>操作</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{c.code}</td>
                    <td>{c.name}</td>
                    <td>{c.typeCode ?? "—"}</td>
                    <td>{c.sortOrder}</td>
                    {isAdmin && (
                      <td>
                        <button
                          type="button"
                          className="mock-btn ghost"
                          onClick={() => {
                            const n = window.prompt("新名称", c.name);
                            if (n)
                              void apiPatch(`/api/categories/${c.id}`, { name: n }).then(load);
                          }}
                        >
                          改名
                        </button>
                        <button
                          type="button"
                          className="mock-btn ghost"
                          onClick={() => {
                            if (window.confirm("删除该分类？"))
                              void apiDelete(`/api/categories/${c.id}`).then(load);
                          }}
                        >
                          删除
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PageShell>
  );
}

export function PageAssetLocations() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState<Loc[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const load = useCallback(() => {
    apiGet<Loc[]>("/api/locations")
      .then(setItems)
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageShell
      title="位置管理"
      description="厂区、车间、机房等位置树。仅管理员可增删改。"
      showDevBanner={false}
    >
      {err && <div className="inline-alert">{err}</div>}
      {!items ? (
        <p className="muted">加载中…</p>
      ) : (
        <>
          {isAdmin && (
            <div className="form-row" style={{ marginBottom: 16, gap: 8, flexWrap: "wrap" }}>
              <input
                className="mock-input"
                placeholder="编码"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <input
                className="mock-input"
                placeholder="名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button
                type="button"
                className="mock-btn primary"
                onClick={() => {
                  void apiPost("/api/locations", { code, name }).then(() => {
                    setCode("");
                    setName("");
                    load();
                  });
                }}
              >
                新增
              </button>
            </div>
          )}
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>编码</th>
                  <th>名称</th>
                  <th>排序</th>
                  {isAdmin && <th>操作</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{c.code}</td>
                    <td>{c.name}</td>
                    <td>{c.sortOrder}</td>
                    {isAdmin && (
                      <td>
                        <button
                          type="button"
                          className="mock-btn ghost"
                          onClick={() => {
                            if (window.confirm("删除？"))
                              void apiDelete(`/api/locations/${c.id}`).then(load);
                          }}
                        >
                          删除
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PageShell>
  );
}

type CatOpt = { id: string; code: string; name: string };

export function PageNamingPolicies() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState<Policy[] | null>(null);
  const [cats, setCats] = useState<CatOpt[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("新策略");
  const [template, setTemplate] = useState("{site}-{dept}-{type}-{seq:4}");
  const [scopeType, setScopeType] = useState("ORG_UNIT");
  const [siteCode, setSiteCode] = useState("A");
  const [categoryId, setCategoryId] = useState<string>("");

  const load = useCallback(() => {
    apiGet<Policy[]>("/api/naming-policies")
      .then(setItems)
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
    apiGet<CatOpt[]>("/api/categories")
      .then((c) => {
        setCats(c);
        if (c[0]) setCategoryId(c[0].id);
      })
      .catch(() => {});
  }, [load]);

  return (
    <PageShell
      title="计算机命名策略"
      description="模板与序号作用域；新建资产生成主机名时引用。仅管理员可新建/删除。"
      showDevBanner={false}
    >
      {err && <div className="inline-alert">{err}</div>}
      {isAdmin && (
        <div className="form-row" style={{ marginBottom: 16, gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label>
            名称
            <input className="mock-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            模板
            <input
              className="mock-input mono"
              style={{ minWidth: 220 }}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
          </label>
          <label>
            作用域
            <input className="mock-input" value={scopeType} onChange={(e) => setScopeType(e.target.value)} />
          </label>
          <label>
            站点码
            <input className="mock-input" style={{ width: 56 }} value={siteCode} onChange={(e) => setSiteCode(e.target.value)} />
          </label>
          <label>
            分类
            <select className="mock-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="mock-btn primary"
            onClick={() =>
              void apiPost("/api/naming-policies", {
                name,
                template,
                scopeType,
                siteCode,
                categoryId: categoryId || null,
                isDefault: false,
              }).then(load)
            }
          >
            新建策略
          </button>
        </div>
      )}
      {!items ? (
        <p className="muted">加载中…</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>模板</th>
                <th>作用域类型</th>
                <th>默认</th>
                {isAdmin && <th>操作</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="mono">{p.template}</td>
                  <td>{p.scopeType}</td>
                  <td>{p.isDefault ? "是" : "否"}</td>
                  {isAdmin && (
                    <td>
                      <button
                        type="button"
                        className="mock-btn ghost"
                        onClick={() => {
                          if (window.confirm("删除该策略？"))
                            void apiDelete(`/api/naming-policies/${p.id}`).then(load);
                        }}
                      >
                        删除
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
