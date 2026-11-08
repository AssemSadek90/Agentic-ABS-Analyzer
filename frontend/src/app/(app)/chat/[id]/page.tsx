import { ChatWorkspace } from "@/components/ChatWorkspace"

export default function ChatConversationPage({ params }: { params: { id: string } }) {
  return <ChatWorkspace conversationId={params.id} />
}
