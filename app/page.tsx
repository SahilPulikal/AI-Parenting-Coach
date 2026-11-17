import ChatInterface from "@/components/ChatInterface";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-3 py-4 sm:px-4 sm:py-6">
      <ChatInterface />
    </main>
  );
}
