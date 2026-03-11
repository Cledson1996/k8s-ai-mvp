import { ResourceDetailScreen } from "../../../../../components/screens/resource-detail-screen";
import { getResourceDetailPageData } from "../../../../../lib/api";

export default async function ResourcePage({
  params
}: {
  params: Promise<{ namespace: string; kind: string; name: string }>;
}) {
  const { namespace, kind, name } = await params;
  const data = await getResourceDetailPageData(kind, namespace, name);
  return <ResourceDetailScreen {...data} />;
}
