import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { instructions, selectedContent, sopContent, model = "gemini" } = await req.json();

    if (!instructions || !selectedContent || selectedContent.length === 0) {
      return new Response(
        JSON.stringify({ error: "Instructions and selected content are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build context from selected pages
    let context = "Selected PDF Content:\n\n";
    selectedContent.forEach((page: any) => {
      context += `--- ${page.fileName} (Page ${page.pageNum}) ---\n`;
      context += `${page.text}\n\n`;
    });

    // Add SOP content if provided
    if (sopContent) {
      context += "\n\n=== UPLOADED SOP DOCUMENTS (from rma.gov.au) ===\n";
      context += sopContent;
    }

    const systemPrompt = `You are a medical diagnostic assessment specialist. Your task is to analyze the provided PDF content and create a comprehensive diagnostic assessment based on the specific instructions given.

Follow the DIA (Diagnostic Instructions Assessment) provided exactly. Be thorough, accurate, and professional in your assessment.

**IMPORTANT**: When analyzing SOP factors, reference the uploaded SOP documents provided below. All SOP information is sourced from rma.gov.au (Repatriation Medical Authority).`;

    const userPrompt = `DIA Instructions:
${instructions}

${context}

Please generate a diagnostic assessment based on the above instructions and PDF content.`;

    let response;

    if (model === "claude") {
      const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
      if (!ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is not configured");
      }

      console.log("Calling Claude API for diagnostic assessment");

      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8000,
          messages: [
            {
              role: "user",
              content: `${systemPrompt}\n\n${userPrompt}`
            }
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Claude API error:", response.status, errorText);
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: "Payment required, please add funds." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();
      const assessment = data.content[0].text;

      return new Response(
        JSON.stringify({ assessment }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Use Gemini (default)
      const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
      if (!GOOGLE_API_KEY) {
        throw new Error("GOOGLE_API_KEY is not configured");
      }

      console.log("Calling Gemini API for diagnostic assessment");

      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GOOGLE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: systemPrompt },
                  { text: userPrompt }
                ],
              },
            ],
            generationConfig: {
              maxOutputTokens: 8000,
              temperature: 0.7,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Gemini API error:", response.status, errorText);
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const assessment = data.candidates[0].content.parts[0].text;

      return new Response(
        JSON.stringify({ assessment }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Error in generate-diagnostic-assessment:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
