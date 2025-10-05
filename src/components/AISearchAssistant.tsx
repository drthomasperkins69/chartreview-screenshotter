import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, Bot, User, FileSearch } from "lucide-react";
const FUNCTIONS_BASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  "https://hpclzzykgxolszduecqa.supabase.co";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
  pages?: Array<{ fileIndex: number; pageNum: number; reason: string }>;
}

interface PDFContent {
  fileName: string;
  fileIndex: number;
  pages: Array<{ pageNum: number; text: string }>;
}

interface AISearchAssistantProps {
  onKeywordSuggest: (keywords: string) => void;
  onPagesSelected?: (pages: Array<{ fileIndex: number; pageNum: number; reason?: string }>) => void;
  currentKeywords?: string;
  pdfContent?: PDFContent[];
}

export const AISearchAssistant = ({ 
  onKeywordSuggest, 
  onPagesSelected,
  currentKeywords,
  pdfContent = []
}: AISearchAssistantProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: pdfContent.length > 0 
        ? "Hi! I can analyze your PDFs and help you find relevant pages. What are you looking for?"
        : "Hi! Upload a PDF first, then I can help you search through it. What are you looking for?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedModel, setSelectedModel] = useState<"gemini" | "claude">("gemini");

  const extractKeywords = (text: string): string | null => {
    const keywordPattern = /\b([a-zA-Z0-9]+(?:\s+[a-zA-Z0-9]+)*(?:,\s*[a-zA-Z0-9]+(?:\s+[a-zA-Z0-9]+)*)+)\b/;
    const match = text.match(keywordPattern);
    return match ? match[1] : null;
  };

  const analyzeWithAI = async () => {
    if (!input.trim() || isAnalyzing || pdfContent.length === 0) return;

    const userMessage: Message = { role: "user", content: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsAnalyzing(true);

    try {
      const resp = await fetch(`${FUNCTIONS_BASE}/functions/v1/analyze-pdf-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          query: input,
          pdfContent: pdfContent,
          model: selectedModel
        }),
      });

      if (!resp.ok) {
        if (resp.status === 429) throw new Error("Rate limits exceeded, please try again later.");
        if (resp.status === 402) throw new Error("AI credits exhausted. Please add credits.");
        const t = await resp.text();
        throw new Error(`AI analysis error: ${t}`);
      }

      const data = await resp.json();

      // Deduplicate pages - keep only one entry per unique page
      const uniquePages = new Map();
      if (data.relevantPages && Array.isArray(data.relevantPages)) {
        data.relevantPages.forEach((p: any) => {
          const key = `${p.fileIndex}-${p.pageNum}`;
          if (!uniquePages.has(key)) {
            uniquePages.set(key, p);
          }
        });
      }
      
      const deduplicatedPages = Array.from(uniquePages.values());

      let responseContent = `Found ${deduplicatedPages.length} relevant page${deduplicatedPages.length !== 1 ? 's' : ''}:\n\n`;
      
      if (deduplicatedPages.length > 0) {
        deduplicatedPages.forEach((p: any) => {
          const doc = pdfContent[p.fileIndex];
          responseContent += `📄 ${doc?.fileName || `Document ${p.fileIndex + 1}`} - Page ${p.pageNum}\n${p.reason}\n\n`;
        });
        
        // Only suggest keywords if they exist and aren't empty
        if (data.keywords && data.keywords.length > 0) {
          responseContent += `\nSuggested keywords: ${data.keywords.join(', ')}`;
          onKeywordSuggest(data.keywords.join(', '));
        }
      } else {
        responseContent = "No relevant pages found matching your query. Try refining your search.";
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: responseContent,
        pages: deduplicatedPages
      };

      setMessages([...updatedMessages, assistantMessage]);

      // Auto-select pages if handler provided
      if (deduplicatedPages.length > 0 && onPagesSelected) {
        onPagesSelected(deduplicatedPages.map((p: any) => ({
          fileIndex: p.fileIndex,
          pageNum: p.pageNum,
          reason: p.reason
        })));
        toast.success(`Selected ${deduplicatedPages.length} relevant page${deduplicatedPages.length !== 1 ? 's' : ''} for extraction`);
      }

    } catch (error) {
      console.error("Error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to analyze PDFs");
      setMessages([
        ...updatedMessages,
        {
          role: "assistant",
          content: "Sorry, I encountered an error analyzing the PDFs. Please try again.",
        },
      ]);
    } finally {
      setIsAnalyzing(false);
    }
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
        body: JSON.stringify({ 
          messages: updatedMessages,
          model: selectedModel
        }),
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

      const keywords = extractKeywords(data.message);
      if (keywords) {
        onKeywordSuggest(keywords);
        toast("Keywords detected - click 'Use Keywords' to search!");
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to get AI response. Please try again.");
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
      if (pdfContent.length > 0) {
        analyzeWithAI();
      } else {
        sendMessage();
      }
    }
  };

  return (
    <Card className="p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4 pb-2 border-b">
        <Bot className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">AI Search Assistant</h3>
        <Select value={selectedModel} onValueChange={(value: "gemini" | "claude") => setSelectedModel(value)}>
          <SelectTrigger className="w-[140px] h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gemini">Gemini</SelectItem>
            <SelectItem value="claude">Claude</SelectItem>
          </SelectContent>
        </Select>
        {pdfContent.length > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {pdfContent.length} PDF(s) loaded
          </span>
        )}
      </div>

      <ScrollArea className="flex-1 pr-4 mb-4">
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 ${
                message.role === "assistant" ? "justify-start" : "justify-end"
              }`}
            >
              {message.role === "assistant" && (
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                </div>
              )}
              <div
                className={`rounded-lg px-4 py-2 max-w-[80%] ${
                  message.role === "assistant"
                    ? "bg-muted"
                    : "bg-primary text-primary-foreground"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
              {message.role === "user" && (
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    <User className="w-4 h-4 text-primary-foreground" />
                  </div>
                </div>
              )}
            </div>
          ))}
          {(isLoading || isAnalyzing) && (
            <div className="flex gap-3 justify-start">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              </div>
              <div className="rounded-lg px-4 py-2 bg-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="flex gap-2 items-end">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder={pdfContent.length > 0 ? "Ask AI to analyze PDFs... (Shift+Enter for new line)" : "Ask AI for keyword suggestions... (Shift+Enter for new line)"}
          disabled={isLoading || isAnalyzing}
          className="flex-1 resize-none"
          rows={3}
        />
        {pdfContent.length > 0 ? (
          <Button
            onClick={analyzeWithAI}
            disabled={isAnalyzing || !input.trim()}
            size="icon"
            title="Analyze PDFs with AI"
          >
            {isAnalyzing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileSearch className="w-4 h-4" />
            )}
          </Button>
        ) : (
          <Button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            size="icon"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        )}
      </div>
    </Card>
  );
};
