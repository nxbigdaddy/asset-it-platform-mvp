import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api";
import { PageShell } from "../components/PageShell";

type Dept = { id: string; name: string; shortCode: string | null; parentId: string | null; order: number };
type User = {
  userid: string;
  name: string;
  active: boolean;
  departments: { department: { id: string; name: string } }[];
};

type UserRow = User & { primaryDeptId: number | null; primaryDeptName: string };

function toDeptId(id: string | null | undefined): number {
  const n = Number(id);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

function paginate<T>(list: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return list.slice(start, start + pageSize);
}

function Pager({
  total,
  page,
  pageSize,
  onPageChange,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(total, safePage * pageSize);

  return (
    <div className="mock-pagination">
      第 {safePage}/{totalPages} 页，显示 {from}-{to} / 共 {total} 条
      {"  "}
      <button
        type="button"
        className="mock-btn ghost"
        disabled={safePage <= 1}
        onClick={() => onPageChange(safePage - 1)}
      >
        上一页
      </button>
      <button
        type="button"
        className="mock-btn ghost"
        disabled={safePage >= totalPages}
        onClick={() => onPageChange(safePage + 1)}
      >
        下一页
      </button>
    </div>
  );
}

export function OrgPage() {
  const [depts, setDepts] = useState<Dept[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [deptPage, setDeptPage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const deptPageSize = 20;
  const userPageSize = 30;

  useEffect(() => {
    Promise.all([apiGet<Dept[]>("/api/wx/departments"), apiGet<User[]>("/api/wx/users")])
      .then(([d, u]) => {
        setDepts(d);
        setUsers(u);
        setDeptPage(1);
        setUserPage(1);
      })
      .catch((e: Error) => setErr(e.message));
  }, []);

  const sortedDepts = useMemo(
    () => [...depts].sort((a, b) => toDeptId(a.id) - toDeptId(b.id)),
    [depts],
  );

  const sortedUsers = useMemo<UserRow[]>(() => {
    return users
      .map((u) => {
        const deptsSorted = [...u.departments].sort(
          (a, b) => toDeptId(a.department.id) - toDeptId(b.department.id),
        );
        return {
          ...u,
          primaryDeptId: deptsSorted.length ? toDeptId(deptsSorted[0].department.id) : null,
          primaryDeptName: deptsSorted.length ? deptsSorted[0].department.name : "—",
          departments: deptsSorted,
        };
      })
      .sort((a, b) => {
        const aId = a.primaryDeptId ?? Number.MAX_SAFE_INTEGER;
        const bId = b.primaryDeptId ?? Number.MAX_SAFE_INTEGER;
        if (aId !== bId) return aId - bId;
        return a.userid.localeCompare(b.userid, "zh-CN");
      });
  }, [users]);

  const deptPageRows = useMemo(
    () => paginate(sortedDepts, deptPage, deptPageSize),
    [sortedDepts, deptPage],
  );
  const userPageRows = useMemo(
    () => paginate(sortedUsers, userPage, userPageSize),
    [sortedUsers, userPage],
  );

  if (err) {
    return (
      <PageShell title="组织与人员" showDevBanner={false}>
        <div className="alert">{err}</div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="组织与人员"
      description="数据来自本地同步镜像（企业微信）。同步日志见子菜单。"
      showDevBanner={false}
      extra={
        <Link to="/app/org/sync" className="mock-btn ghost">
          同步日志
        </Link>
      }
    >
      <h2 className="sub-block-title">部门</h2>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>缩写</th>
              <th>父级</th>
            </tr>
          </thead>
          <tbody>
            {deptPageRows.map((d) => (
              <tr key={d.id}>
                <td className="mono">{d.id}</td>
                <td>{d.name}</td>
                <td>{d.shortCode ?? "—"}</td>
                <td className="mono">{d.parentId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager
          total={sortedDepts.length}
          page={deptPage}
          pageSize={deptPageSize}
          onPageChange={setDeptPage}
        />
      </div>

      <h2 className="sub-block-title">成员</h2>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>userid</th>
              <th>姓名</th>
              <th>状态</th>
              <th>主部门</th>
              <th>部门</th>
            </tr>
          </thead>
          <tbody>
            {userPageRows.map((u) => (
              <tr key={u.userid}>
                <td className="mono">{u.userid}</td>
                <td>{u.name}</td>
                <td>{u.active ? "在职" : "停用"}</td>
                <td>{u.primaryDeptName}</td>
                <td>
                  {u.departments.length
                    ? u.departments.map((x) => x.department.name).join("、")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager
          total={sortedUsers.length}
          page={userPage}
          pageSize={userPageSize}
          onPageChange={setUserPage}
        />
      </div>
    </PageShell>
  );
}
