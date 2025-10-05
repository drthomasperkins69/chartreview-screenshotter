import { useState } from "react";
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
  files: Array<{ fileName: string; pageNum: number; text?: string }>;
}

interface AIChatProps {
  diagnosesContext?: DiagnosisContext[] | null;
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

export const AIChat = ({ diagnosesContext }: AIChatProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState('lovable');
  const [model, setModel] = useState('');

  const currentProvider = AI_PROVIDERS.find(p => p.value === provider);
  const availableModels = currentProvider?.models || [];

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Build context message if diagnoses are selected
      let contextMessage = '';
      if (diagnosesContext && diagnosesContext.length > 0) {
        contextMessage = '\n\n--- Context: Selected Diagnoses and Files ---\n';
        diagnosesContext.forEach(({ diagnosis, files }) => {
          contextMessage += `\nDiagnosis: ${diagnosis}\nFiles:\n`;
          files.forEach(({ fileName, pageNum, text }) => {
            contextMessage += `  - ${fileName}, Page ${pageNum}\n`;
            if (text) {
              contextMessage += `    Text: ${text.substring(0, 500)}${text.length > 500 ? '...' : ''}\n`;
            }
          });
        });
        contextMessage += '--- End Context ---\n\n';
      }

      const messagesToSend = diagnosesContext && diagnosesContext.length > 0
        ? [
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user' as const, content: contextMessage + userMessage.content }
          ]
        : [...messages, userMessage].map(m => ({ role: m.role, content: m.content }));

      const { data, error } = await supabase.functions.invoke('multi-provider-chat', {
        body: {
          provider,
          model: model || availableModels[0]?.value,
          messages: messagesToSend,
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
        {diagnosesContext && diagnosesContext.length > 0 && (
          <div className="mb-4 p-3 bg-primary/10 border border-primary/20 rounded-lg">
            <p className="text-xs font-medium text-primary mb-1">
              Selected Diagnoses ({diagnosesContext.length})
            </p>
            <div className="text-xs text-muted-foreground space-y-1">
              {diagnosesContext.map((ctx, idx) => (
                <div key={idx}>
                  {ctx.diagnosis}: {ctx.files.length} file{ctx.files.length !== 1 ? 's' : ''}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <Sparkles className="w-12 h-12 mb-4 text-muted-foreground/50" />
            <p className="text-lg font-medium mb-2">Choose an AI provider and start chatting</p>
            <p className="text-sm max-w-md">
              {diagnosesContext && diagnosesContext.length > 0 
                ? 'AI has access to selected diagnoses and their files'
                : 'Switch between different AI models to compare responses and capabilities'}
            </p>
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
          <Button onClick={handleSend} disabled={loading || !input.trim()}>
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
