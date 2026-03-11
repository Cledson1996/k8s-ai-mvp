import { SnapshotDiffScreen } from "../../../../../components/screens/snapshot-diff-screen";
import { getSnapshotDiffPageData } from "../../../../../lib/api";

export default async function SnapshotDiffPage({
  params
}: {
  params: Promise<{ snapshotId: string; previousId: string }>;
}) {
  const { snapshotId, previousId } = await params;
  const data = await getSnapshotDiffPageData(snapshotId, previousId);
  return <SnapshotDiffScreen diff={data.diff} degradedSources={data.degradedSources} />;
}
