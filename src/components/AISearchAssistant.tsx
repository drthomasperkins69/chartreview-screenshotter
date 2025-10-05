import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Bot, User } from "lucide-react";
// Avoid importing supabase client at module load to prevent crashes if env isn't ready
const FUNCTIONS_BASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  "https://hpclzzykgxolszduecqa.supabase.co";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AISearchAssistantProps {
  onKeywordSuggest: (keywords: string) => void;
  currentKeywords?: string;
}

export const AISearchAssistant = ({ onKeywordSuggest, currentKeywords }: AISearchAssistantProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! I can help you search through your PDF. What are you looking for?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const extractKeywords = (text: string): string | null => {
    // Look for comma-separated keywords in the response
    const keywordPattern = /\b([a-zA-Z0-9]+(?:\s+[a-zA-Z0-9]+)*(?:,\s*[a-zA-Z0-9]+(?:\s+[a-zA-Z0-9]+)*)+)\b/;
    const match = text.match(keywordPattern);
    return match ? match[1] : null;
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      const resp = await fetch(`${FUNCTIONS_BASE}/functions/v1/pdf-search-assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!resp.ok) {
        if (resp.status === 429) throw new Error("Rate limits exceeded, please try again later.");
        if (resp.status === 402) throw new Error("Payment required, please add credits to your workspace.");
        const t = await resp.text();
        throw new Error(`AI function error: ${t}`);
      }

      const data = await resp.json();

      const assistantMessage: Message = {
        role: "assistant",
        content: data.message,
      };

      setMessages([...updatedMessages, assistantMessage]);

      // Check if the response contains keywords
      const keywords = extractKeywords(data.message);
      if (keywords) {
        onKeywordSuggest(keywords);
        toast("Keywords detected - click 'Use Keywords' to search!");
      }
    } catch (error) {
      console.error("Error:", error);
      toast("Failed to get AI response. Please try again.");
      setMessages([
        ...updatedMessages,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <Card className="p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b">
        <Bot className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">AI Search Assistant</h3>
      </div>

      {currentKeywords && (
        <div className="mb-3 p-3 bg-muted rounded-lg">
          <p className="text-xs font-medium text-muted-foreground mb-1">Current Keywords:</p>
          <p className="text-sm font-mono text-foreground">{currentKeywords}</p>
        </div>
      )}

      <ScrollArea className="flex-1 pr-4 mb-4">
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.role === "assistant" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}
              <div
                className={`rounded-lg px-4 py-2 max-w-[80%] ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
              {message.role === "user" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <User className="w-4 h-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-muted rounded-lg px-4 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Ask about what to search for..."
          disabled={isLoading}
        />
        <Button onClick={sendMessage} disabled={isLoading || !input.trim()}>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </Card>
  );
};
