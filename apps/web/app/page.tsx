import { OverviewScreen } from "../components/screens/overview-screen";
import { getOverviewPageData } from "../lib/api";

export default async function OverviewPage() {
  const data = await getOverviewPageData();
  return <OverviewScreen {...data} />;
}
