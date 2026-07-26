import type { Metadata } from "next";
import { ChatView } from "@/components/chat/ChatView";
import "./chat.css";

export const metadata: Metadata = {
  title: "צ׳אט הטיול",
  description: "לשאול בעברית כל שאלה על התוכנית, ההזמנות והמקומות של יפן 2026.",
};

export default function ChatPage() {
  return <ChatView />;
}
