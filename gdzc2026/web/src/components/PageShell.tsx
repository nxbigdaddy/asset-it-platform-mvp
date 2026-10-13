import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  /** 右上角操作区 */
  extra?: ReactNode;
  children: ReactNode;
  /** 是否显示「界面已完成 / 逻辑待开发」提示条 */
  showDevBanner?: boolean;
};

export function PageShell({
  title,
  description,
  extra,
  children,
  showDevBanner = true,
}: Props) {
  return (
    <div className="page-shell">
      {showDevBanner && (
        <div className="dev-banner" role="status">
          界面原型已就绪；业务数据与接口联调将在后续迭代中完成。
        </div>
      )}
      <div className="page-shell-head">
        <div className="page-shell-intro">
          <h1 className="page-shell-title">{title}</h1>
          {description && <p className="page-shell-desc">{description}</p>}
        </div>
        {extra && <div className="page-shell-extra">{extra}</div>}
      </div>
      <div className="page-shell-body">{children}</div>
    </div>
  );
}
