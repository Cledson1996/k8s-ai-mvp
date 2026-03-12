import { HealthCenterScreen } from "../../components/screens/health-center-screen";
import { getHealthCenterPageData } from "../../lib/api";

export default async function HealthCenterPage() {
  const data = await getHealthCenterPageData();
  return <HealthCenterScreen initialData={data} />;
}
