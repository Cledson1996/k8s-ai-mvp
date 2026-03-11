import { IssuesScreen } from "../../components/screens/issues-screen";
import { getIssuesPageData } from "../../lib/api";

export default async function IssuesPage() {
  const data = await getIssuesPageData();
  return <IssuesScreen {...data} />;
}
