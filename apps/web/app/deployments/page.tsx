import { DeploymentsScreen } from "../../components/screens/deployments-screen";
import { getDeploymentsPageData } from "../../lib/api";

export default async function DeploymentsPage() {
  const data = await getDeploymentsPageData();
  return <DeploymentsScreen {...data} />;
}
