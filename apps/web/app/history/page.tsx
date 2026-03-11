import { HistoryScreen } from "../../components/screens/history-screen";
import { getHistoryPageData } from "../../lib/api";

export default async function HistoryPage() {
  const data = await getHistoryPageData();
  return <HistoryScreen {...data} />;
}
