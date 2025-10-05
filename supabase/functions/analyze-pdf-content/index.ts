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
    const { query, pdfContent, model = "gemini" } = await req.json();
    
    if (!query || !pdfContent || !Array.isArray(pdfContent)) {
      return new Response(
        JSON.stringify({ error: "Missing query or pdfContent" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build context from PDF content - send ALL text per page
    const pdfContext = pdfContent.map((doc: any) => 
      `Document: ${doc.fileName}\n${doc.pages.map((p: any) => 
        `Page ${p.pageNum}: ${p.text}`
      ).join('\n\n')}`
    ).join('\n\n=== NEXT DOCUMENT ===\n\n');

    const systemPrompt = `You are a medical document analyzer specialized in extracting pages relevant to specific dates and medical conditions from medical timelines.

PRIMARY TASK: When given a query with dates and/or medical conditions, find ALL pages that contain information about those dates or conditions.

KEY INSTRUCTIONS:
- Look for exact date matches, date ranges, and approximate dates (e.g., "around March 2023", "early 2024")
- Match medical conditions, symptoms, diagnoses, treatments, and procedures
- Be generous in matches - if a page has ANY relevance to the date range or condition, include it
- Extract the specific reasons why each page is relevant (e.g., "Contains visit from March 15, 2023 regarding chest pain")

Return ONLY a valid JSON object (no markdown, no code blocks) with this exact structure:
{
  "relevantPages": [
    {
      "fileIndex": 0,
      "pageNum": 1,
      "reason": "Brief explanation of why this page matches (include dates/conditions found)"
    }
  ],
  "keywords": ["keyword1", "keyword2"]
}

If you find relevant pages, include them. If not, return empty arrays but still valid JSON.`;

    const userPrompt = `Query: ${query}\n\n=== PDF CONTENT ===\n${pdfContext}`;

    let response;
    
    if (model === "claude") {
      const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
      if (!ANTHROPIC_API_KEY) {
        return new Response(
          JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Calling Claude API for PDF analysis");

      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
    } else {
      // Gemini
      const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
      if (!GOOGLE_API_KEY) {
        return new Response(
          JSON.stringify({ error: "GOOGLE_API_KEY not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Calling Gemini API for PDF analysis");

      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GOOGLE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
            }],
            generationConfig: {
              responseMimeType: "application/json"
            }
          }),
        }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "AI analysis failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    let aiContent;
    
    if (model === "claude") {
      aiContent = aiResponse.content[0].text;
    } else {
      // Gemini
      aiContent = aiResponse.candidates[0].content.parts[0].text;
    }

    if (!aiContent) {
      return new Response(
        JSON.stringify({ error: "No response from AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse AI response
    let analysisResult;
    try {
      analysisResult = JSON.parse(aiContent);
      console.log("Parsed analysis result:", JSON.stringify(analysisResult));
    } catch (e) {
      console.error("Failed to parse AI response:", aiContent);
      console.error("Parse error:", e);
      
      // Fallback: try to extract JSON from markdown
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          analysisResult = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          return new Response(
            JSON.stringify({ error: "Failed to parse AI response", rawResponse: aiContent }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        return new Response(
          JSON.stringify({ error: "No valid JSON in AI response", rawResponse: aiContent }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify(analysisResult),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in analyze-pdf-content:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
