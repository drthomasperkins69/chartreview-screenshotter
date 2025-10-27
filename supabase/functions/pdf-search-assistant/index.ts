import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const messageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(10000)
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(50),
  model: z.enum(['claude', 'gemini']).default('gemini')
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const { messages, model } = requestSchema.parse(rawBody);
    
    const systemMessage = {
      role: "system",
      content: `You are a helpful AI assistant that helps users search through PDF documents. 
Your role is to:
1. Understand what the user wants to find in their PDF
2. Suggest relevant keywords to search for (comma-separated)
3. Help refine searches based on specific dates, time periods, or content requirements
4. Understand date-based queries like "documents from 2023", "records after January", "Q4 reports", etc.

When suggesting keywords, format them as: keyword1, keyword2, keyword3

For date-based queries:
- Include relevant date formats (e.g., "2023", "January 2023", "Q4", "2023-01")
- Suggest related temporal terms (e.g., "annual", "quarterly", "monthly")
- Combine dates with the user's topic (e.g., if they ask for "2023 reports", suggest: 2023, report, annual, yearly)

Be conversational and helpful. Ask clarifying questions if needed.`
    };

    let response;
    
    if (model === "claude") {
      const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
      if (!ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is not configured");
      }

      console.log("Calling Claude API with", messages.length, "messages");

      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: systemMessage.content,
          messages: messages,
        }),
      });
    } else {
      const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
      if (!GOOGLE_API_KEY) {
        throw new Error("GOOGLE_API_KEY is not configured");
      }

      console.log("Calling Gemini API with", messages.length, "messages");

      const geminiMessages = [systemMessage, ...messages].map(msg => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }]
      }));

      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GOOGLE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: geminiMessages,
          }),
        }
      );
    }

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add credits to your workspace." }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI API error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    console.log("AI response received");

    let messageContent;
    if (model === "claude") {
      messageContent = data.content[0].text;
    } else {
      messageContent = data.candidates[0].content.parts[0].text;
    }

    return new Response(
      JSON.stringify({ message: messageContent }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in pdf-search-assistant:", error);
    
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: "Invalid input", details: error.errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
