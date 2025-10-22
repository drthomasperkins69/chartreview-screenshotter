import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { provider, messages, model, workspaceFiles = [] } = await req.json();
    console.log(`Processing ${provider} chat request with model: ${model}`);
    console.log(`Workspace files available: ${workspaceFiles.length}`);

    let response;
    
    switch (provider) {
      case 'lovable':
        response = await handleLovableAI(messages, model, workspaceFiles);
        break;
      case 'claude':
        response = await handleClaude(messages, model, workspaceFiles);
        break;
      case 'gemini':
        response = await handleGemini(messages, model, workspaceFiles);
        break;
      case 'grok':
        response = await handleGrok(messages, model, workspaceFiles);
        break;
      case 'perplexity':
        response = await handlePerplexity(messages, model, workspaceFiles);
        break;
      case 'openai':
        response = await handleOpenAI(messages, model, workspaceFiles);
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Chat error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function handleLovableAI(messages: any[], model: string, workspaceFiles: any[]) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  // Build workspace files context
  let workspaceContext = '';
  if (workspaceFiles.length > 0) {
    workspaceContext = '\n\n--- Workspace Files Available ---\n';
    workspaceContext += `You have access to ${workspaceFiles.length} files in this workspace:\n`;
    workspaceFiles.forEach((file: any, idx: number) => {
      workspaceContext += `${idx + 1}. ${file.file_name}${file.page_count ? ` (${file.page_count} pages)` : ''}\n`;
    });
    workspaceContext += '\nYou can reference and discuss any of these files when helping the user.\n';
    workspaceContext += '--- End Workspace Files ---\n\n';
  }

  // Add system message about medical document access if not present
  const hasSystemMessage = messages.length > 0 && messages[0].role === 'system';
  const systemMessage = {
    role: 'system',
    content: 'You are a medical AI assistant with access to patient medical documents in this workspace.' + workspaceContext + 
             'When medical document context is provided (marked as "RAG Context" or "Direct Context"), use it to answer questions accurately. ' +
             'You can reference any of the workspace files listed above. ' +
             'If no context is provided but the user asks about documents, let them know they need to select diagnoses from the tracker first.'
  };
  
  const messagesWithSystem = hasSystemMessage ? messages : [systemMessage, ...messages];

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || 'google/gemini-2.5-flash',
      messages: messagesWithSystem,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Lovable AI error:', response.status, errorText);
    throw new Error(`Lovable AI error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    provider: 'lovable',
    model: model || 'google/gemini-2.5-flash',
  };
}

async function handleClaude(messages: any[], model: string, workspaceFiles: any[]) {
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

  // Build workspace files context and prepend to first user message
  let workspaceContext = '';
  if (workspaceFiles.length > 0) {
    workspaceContext = '--- Workspace Files Available ---\n';
    workspaceContext += `You have access to ${workspaceFiles.length} files in this workspace:\n`;
    workspaceFiles.forEach((file: any, idx: number) => {
      workspaceContext += `${idx + 1}. ${file.file_name}${file.page_count ? ` (${file.page_count} pages)` : ''}\n`;
    });
    workspaceContext += '\nYou can reference and discuss any of these files when helping the user.\n';
    workspaceContext += '--- End Workspace Files ---\n\n';
  }

  // Prepend workspace context to first user message
  const modifiedMessages = messages.map((m, idx) => {
    if (idx === 0 && m.role === 'user' && workspaceContext) {
      return {
        ...m,
        content: workspaceContext + m.content
      };
    }
    return m;
  });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: 'You are a medical AI assistant with access to patient medical documents in this workspace. When medical document context is provided, use it to answer questions accurately.',
      messages: modifiedMessages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Claude error:', response.status, errorText);
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.content[0].text,
    provider: 'claude',
    model: model || 'claude-sonnet-4-20250514',
  };
}

async function handleGemini(messages: any[], model: string, workspaceFiles: any[]) {
  const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
  if (!GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY not configured');

  // Build workspace files context
  let workspaceContext = '';
  if (workspaceFiles.length > 0) {
    workspaceContext = '--- Workspace Files Available ---\n';
    workspaceContext += `You have access to ${workspaceFiles.length} files in this workspace:\n`;
    workspaceFiles.forEach((file: any, idx: number) => {
      workspaceContext += `${idx + 1}. ${file.file_name}${file.page_count ? ` (${file.page_count} pages)` : ''}\n`;
    });
    workspaceContext += '\n--- End Workspace Files ---\n\n';
  }

  // Prepend workspace context to first user message
  const modifiedMessages = messages.map((m, idx) => {
    if (idx === 0 && m.role === 'user' && workspaceContext) {
      return {
        ...m,
        content: workspaceContext + m.content
      };
    }
    return m;
  });

  const modelName = model || 'gemini-2.0-flash-exp';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: 'You are a medical AI assistant with access to patient medical documents in this workspace.' }]
        },
        contents: modifiedMessages.map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }],
        })),
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini error:', response.status, errorText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.candidates[0].content.parts[0].text,
    provider: 'gemini',
    model: modelName,
  };
}

async function handleGrok(messages: any[], model: string, workspaceFiles: any[]) {
  const XAI_API_KEY = Deno.env.get('XAI_API_KEY');
  if (!XAI_API_KEY) throw new Error('XAI_API_KEY not configured');

  // Build workspace files context
  let workspaceContext = '';
  if (workspaceFiles.length > 0) {
    workspaceContext = '--- Workspace Files Available ---\n';
    workspaceContext += `You have access to ${workspaceFiles.length} files in this workspace:\n`;
    workspaceFiles.forEach((file: any, idx: number) => {
      workspaceContext += `${idx + 1}. ${file.file_name}${file.page_count ? ` (${file.page_count} pages)` : ''}\n`;
    });
    workspaceContext += '\n--- End Workspace Files ---\n\n';
  }

  // Prepend workspace context to first user message
  const modifiedMessages = messages.map((m, idx) => {
    if (idx === 0 && m.role === 'user' && workspaceContext) {
      return {
        ...m,
        content: workspaceContext + m.content
      };
    }
    return m;
  });

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${XAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || 'grok-2-latest',
      messages: modifiedMessages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Grok error:', response.status, errorText);
    throw new Error(`Grok API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    provider: 'grok',
    model: model || 'grok-2-latest',
  };
}

async function handlePerplexity(messages: any[], model: string, workspaceFiles: any[]) {
  const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
  if (!PERPLEXITY_API_KEY) throw new Error('PERPLEXITY_API_KEY not configured');

  // Build workspace files context
  let workspaceContext = '';
  if (workspaceFiles.length > 0) {
    workspaceContext = '--- Workspace Files Available ---\n';
    workspaceContext += `You have access to ${workspaceFiles.length} files in this workspace:\n`;
    workspaceFiles.forEach((file: any, idx: number) => {
      workspaceContext += `${idx + 1}. ${file.file_name}${file.page_count ? ` (${file.page_count} pages)` : ''}\n`;
    });
    workspaceContext += '\n--- End Workspace Files ---\n\n';
  }

  // Prepend workspace context to first user message
  const modifiedMessages = messages.map((m, idx) => {
    if (idx === 0 && m.role === 'user' && workspaceContext) {
      return {
        ...m,
        content: workspaceContext + m.content
      };
    }
    return m;
  });

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || 'llama-3.1-sonar-small-128k-online',
      messages: modifiedMessages,
      temperature: 0.2,
      top_p: 0.9,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Perplexity error:', response.status, errorText);
    throw new Error(`Perplexity API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    provider: 'perplexity',
    model: model || 'llama-3.1-sonar-small-128k-online',
  };
}

async function handleOpenAI(messages: any[], model: string, workspaceFiles: any[]) {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');

  // Build workspace files context
  let workspaceContext = '';
  if (workspaceFiles.length > 0) {
    workspaceContext = '--- Workspace Files Available ---\n';
    workspaceContext += `You have access to ${workspaceFiles.length} files in this workspace:\n`;
    workspaceFiles.forEach((file: any, idx: number) => {
      workspaceContext += `${idx + 1}. ${file.file_name}${file.page_count ? ` (${file.page_count} pages)` : ''}\n`;
    });
    workspaceContext += '\n--- End Workspace Files ---\n\n';
  }

  // Prepend workspace context to first user message
  const modifiedMessages = messages.map((m, idx) => {
    if (idx === 0 && m.role === 'user' && workspaceContext) {
      return {
        ...m,
        content: workspaceContext + m.content
      };
    }
    return m;
  });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || 'gpt-5-2025-08-07',
      messages: modifiedMessages,
      max_completion_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI error:', response.status, errorText);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    provider: 'openai',
    model: model || 'gpt-5-2025-08-07',
  };
}
