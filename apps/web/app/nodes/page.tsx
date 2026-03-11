import { NodesScreen } from "../../components/screens/nodes-screen";
import { getNodesPageData } from "../../lib/api";

export default async function NodesPage() {
  const data = await getNodesPageData();
  return <NodesScreen {...data} />;
}
