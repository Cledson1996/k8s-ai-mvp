import { ChatScreen } from "../../components/screens/chat-screen";
import { getChatPageData } from "../../lib/api";

export default async function ChatPage() {
  const data = await getChatPageData();
  return <ChatScreen {...data} />;
}
