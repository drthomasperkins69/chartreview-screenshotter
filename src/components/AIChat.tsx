import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Send, Sparkles } from "lucide-react";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  provider?: string;
  model?: string;
}

interface DiagnosisContext {
  diagnosis: string;
  files: Array<{ fileName: string; pageNum: number; text?: string; fileId?: string }>;
}

interface AIChatProps {
  diagnosesContext?: { context: DiagnosisContext[]; fileIds: string[] } | null;
  workspaceFiles?: Array<{ id: string; file_name: string; page_count: number | null }>;
  externalInput?: string;
  onExternalInputProcessed?: () => void;
}

const AI_PROVIDERS = [
  { 
    value: 'lovable', 
    label: 'Lovable AI (Free)', 
    models: [
      { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (Default)' },
      { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
      { value: 'openai/gpt-5', label: 'GPT-5' },
    ]
  },
  { 
    value: 'claude', 
    label: 'Claude (Anthropic)', 
    models: [
      { value: 'claude-sonnet-4-20250514', label: 'Claude 4 Sonnet (Default)' },
      { value: 'claude-opus-4-1-20250805', label: 'Claude 4 Opus' },
      { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
    ]
  },
  { 
    value: 'gemini', 
    label: 'Gemini (Direct)', 
    models: [
      { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (Default)' },
      { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    ]
  },
  { 
    value: 'grok', 
    label: 'Grok (xAI)', 
    models: [
      { value: 'grok-2-latest', label: 'Grok 2 (Default)' },
      { value: 'grok-vision-beta', label: 'Grok Vision Beta' },
    ]
  },
  { 
    value: 'perplexity', 
    label: 'Perplexity', 
    models: [
      { value: 'llama-3.1-sonar-small-128k-online', label: 'Sonar Small (Default)' },
      { value: 'llama-3.1-sonar-large-128k-online', label: 'Sonar Large' },
      { value: 'llama-3.1-sonar-huge-128k-online', label: 'Sonar Huge' },
    ]
  },
  { 
    value: 'openai', 
    label: 'ChatGPT (Direct)', 
    models: [
      { value: 'gpt-5-2025-08-07', label: 'GPT-5 (Default)' },
      { value: 'gpt-5-mini-2025-08-07', label: 'GPT-5 Mini' },
      { value: 'gpt-5-nano-2025-08-07', label: 'GPT-5 Nano' },
      { value: 'o3-2025-04-16', label: 'O3' },
    ]
  },
];

export const AIChat = ({ diagnosesContext, workspaceFiles, externalInput, onExternalInputProcessed }: AIChatProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState('lovable');
  const [model, setModel] = useState('');

  const currentProvider = AI_PROVIDERS.find(p => p.value === provider);
  const availableModels = currentProvider?.models || [];

  // Handle external input (e.g., from Chart Review)
  useEffect(() => {
    if (externalInput && !loading) {
      setInput(externalInput);
      // Trigger send after a short delay to allow state to update
      setTimeout(() => {
        handleSend(externalInput);
        onExternalInputProcessed?.();
      }, 100);
    }
  }, [externalInput]);

  const handleSend = async (overrideInput?: string) => {
    const messageContent = overrideInput || input;
    if (!messageContent.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: messageContent };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Perform RAG search on all workspace files if available
      let ragContext = '';
      if (workspaceFiles && workspaceFiles.length > 0) {
        try {
          // Use all workspace file IDs for RAG search
          const fileIds = workspaceFiles.map(f => f.id);

          // Perform RAG search
          const { data: searchResults, error: searchError } = await supabase.functions.invoke('rag-search', {
            body: {
              query: input,
              fileIds: fileIds,
              limit: 10,
            },
          });

          if (!searchError && searchResults?.matches && searchResults.matches.length > 0) {
            ragContext = '\n\n--- Relevant Document Context (via RAG Vector Search) ---\n';
            searchResults.matches.forEach((match: any, idx: number) => {
              ragContext += `\n${idx + 1}. [File: ${match.file_name}, Page ${match.page_number}, Chunk ${match.chunk_index}] (Relevance: ${(match.similarity * 100).toFixed(1)}%)\n${match.content}\n`;
            });
            ragContext += '--- End RAG Context ---\n\n';
          }
        } catch (ragError) {
          console.error('RAG search error:', ragError);
        }
      }

      // Build direct context for diagnoses marked as "Add to Chat"
      let diagnosisContext = '';
      if (diagnosesContext && diagnosesContext.context.length > 0) {
        diagnosisContext = '\n\n--- Selected Diagnoses (Full Document Context - "Add to Chat") ---\n';
        diagnosisContext += 'These documents have been explicitly selected for detailed analysis:\n\n';
        diagnosesContext.context.forEach(({ diagnosis, files }) => {
          diagnosisContext += `\nDiagnosis: ${diagnosis}\nAssociated Pages:\n`;
          files.forEach(({ fileName, pageNum, text }) => {
            diagnosisContext += `  - ${fileName}, Page ${pageNum}\n`;
            if (text) {
              diagnosisContext += `    Full Text: ${text}\n`;
            }
          });
        });
        diagnosisContext += '--- End Direct Context ---\n\n';
      }

      const fullContext = ragContext + diagnosisContext;
      
      if (fullContext) {
        console.log('Sending document context to AI:', {
          ragContextLength: ragContext.length,
          diagnosisDirectContextLength: diagnosisContext.length,
          workspaceFileCount: workspaceFiles?.length || 0,
          selectedDiagnosesCount: diagnosesContext?.context.length || 0,
        });
      }
      
      const messagesToSend = fullContext
        ? [
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user' as const, content: fullContext + userMessage.content }
          ]
        : [...messages, userMessage].map(m => ({ role: m.role, content: m.content }));

      const { data, error } = await supabase.functions.invoke('multi-provider-chat', {
        body: {
          provider,
          model: model || availableModels[0]?.value,
          messages: messagesToSend,
          workspaceFiles: workspaceFiles || [],
        },
      });

      if (error) throw error;

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.content,
        provider: data.provider,
        model: data.model,
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('Chat error:', error);
      toast.error(error.message || 'Failed to get response');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="flex flex-col h-[600px] max-w-4xl mx-auto">
      <div className="border-b p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Multi-Provider AI Chat</h2>
        </div>
        
        <div className="flex gap-3">
          <div className="flex-1">
            <Select value={provider} onValueChange={(v) => { setProvider(v); setModel(''); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_PROVIDERS.map(p => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex-1">
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger>
                <SelectValue placeholder="Model (default)" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map(m => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        {workspaceFiles && workspaceFiles.length > 0 && (
          <div className="mb-4 p-3 bg-secondary/10 border border-secondary/20 rounded-lg">
            <p className="text-xs font-medium text-secondary mb-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Workspace Files Available ({workspaceFiles.length})
            </p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>AI has access to all files in this workspace:</p>
              <div className="ml-2 max-h-20 overflow-y-auto">
                {workspaceFiles.map((file, idx) => (
                  <div key={idx}>
                    • {file.file_name}{file.page_count ? ` (${file.page_count} pages)` : ''}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {diagnosesContext && diagnosesContext.context.length > 0 && (
          <div className="mb-4 p-3 bg-primary/10 border border-primary/20 rounded-lg">
            <p className="text-xs font-medium text-primary mb-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Direct Context Active - "Add to Chat" Selected
            </p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Full document content attached:</p>
              {diagnosesContext.context.map((ctx, idx) => (
                <div key={idx} className="ml-2">
                  • {ctx.diagnosis}: {ctx.files.length} page{ctx.files.length !== 1 ? 's' : ''}
                </div>
              ))}
              <p className="mt-2 text-xs italic">
                ✓ Complete page content included in conversation
              </p>
            </div>
          </div>
        )}
        
        {(!diagnosesContext || diagnosesContext.context.length === 0) && workspaceFiles && workspaceFiles.length > 0 && (
          <div className="mb-4 p-3 bg-muted/50 border border-border rounded-lg">
            <p className="text-xs font-medium mb-1">📋 RAG Search Active</p>
            <p className="text-xs text-muted-foreground">
              AI will search across all {workspaceFiles.length} workspace files to find relevant information. 
              Use "Add to Chat" in diagnosis tracker to attach full document content.
            </p>
          </div>
        )}
        
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <Sparkles className="w-12 h-12 mb-4 text-muted-foreground/50" />
            <p className="text-lg font-medium mb-2">Medical AI Assistant</p>
            <p className="text-sm max-w-md mb-4">
              {workspaceFiles && workspaceFiles.length > 0
                ? `AI has access to all ${workspaceFiles.length} files in this workspace`
                : diagnosesContext && diagnosesContext.context.length > 0 
                  ? 'AI can now see your selected medical documents and diagnoses'
                  : 'Select diagnoses in the tracker above (check "Add to Chat") to give AI additional context'}
            </p>
            {(diagnosesContext && diagnosesContext.context.length > 0) || (workspaceFiles && workspaceFiles.length > 0) ? (
              <div className="text-xs text-muted-foreground/70 max-w-md">
                <p className="mb-2">Try asking:</p>
                <ul className="list-disc text-left pl-4 space-y-1">
                  <li>"What files are in this workspace?"</li>
                  <li>"What diagnoses are documented in these files?"</li>
                  <li>"Summarize the medical findings"</li>
                  <li>"What treatments are mentioned?"</li>
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {msg.role === 'assistant' && msg.provider && (
                    <div className="text-xs text-muted-foreground mb-1">
                      {msg.provider} • {msg.model}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="border-t p-4">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Type your message..."
            disabled={loading}
          />
          <Button onClick={() => handleSend()} disabled={loading || !input.trim()}>
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
};
