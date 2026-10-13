import type { ReactNode } from "react";
import { PageShell } from "../../components/PageShell";
import { MockListBlock } from "../../components/StubBlocks";

type Props = {
  title: string;
  description?: string;
  /** 列表列名，传入则显示标准空表格 */
  tableColumns?: string[];
  children?: ReactNode;
  extra?: ReactNode;
};

export function StubPage({ title, description, tableColumns, children, extra }: Props) {
  return (
    <PageShell title={title} description={description} extra={extra}>
      {children}
      {tableColumns && tableColumns.length > 0 && <MockListBlock columns={tableColumns} />}
    </PageShell>
  );
}
