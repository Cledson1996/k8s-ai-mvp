import { WorkloadsScreen } from "../../components/screens/workloads-screen";
import { getWorkloadsPageData } from "../../lib/api";

export default async function WorkloadsPage() {
  const data = await getWorkloadsPageData();
  return <WorkloadsScreen {...data} />;
}
