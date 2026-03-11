import { NamespaceScreen } from "../../../components/screens/namespace-screen";
import { getNamespacePageData } from "../../../lib/api";

export default async function NamespacePage({
  params
}: {
  params: Promise<{ namespace: string }>;
}) {
  const { namespace } = await params;
  const data = await getNamespacePageData(namespace);
  return <NamespaceScreen {...data} />;
}
