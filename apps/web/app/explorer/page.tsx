import { ExplorerScreen } from "../../components/screens/explorer-screen";
import { getExplorerLandingData } from "../../lib/api";

export default async function ExplorerPage() {
  const data = await getExplorerLandingData();
  return <ExplorerScreen {...data} />;
}
