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
    const { query, pdfContent } = await req.json();
    
    if (!query || !pdfContent || !Array.isArray(pdfContent)) {
      return new Response(
        JSON.stringify({ error: "Missing query or pdfContent" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build context from PDF content - send more text per page
    const pdfContext = pdfContent.map((doc: any) => 
      `Document: ${doc.fileName}\n${doc.pages.map((p: any) => 
        `Page ${p.pageNum}: ${p.text.substring(0, 2000)}${p.text.length > 2000 ? '...' : ''}`
      ).join('\n\n')}`
    ).join('\n\n=== NEXT DOCUMENT ===\n\n');

    const systemPrompt = `You are a medical document analyzer. Your job is to find pages in medical documents that match the user's query.

IMPORTANT: Be generous in your matches - if a page has ANY relevance to the query, include it.

Analyze the PDF content carefully and return ONLY a valid JSON object (no markdown, no code blocks) with this exact structure:
{
  "relevantPages": [
    {
      "fileIndex": 0,
      "pageNum": 1,
      "reason": "Brief explanation"
    }
  ],
  "keywords": ["keyword1", "keyword2"]
}

If you find relevant pages, include them. If not, return empty arrays but still valid JSON.`;


    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Query: ${query}\n\n=== PDF CONTENT ===\n${pdfContext}` }
        ],
        response_format: { type: "json_object" }
      }),
    });

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
    const aiContent = aiResponse.choices?.[0]?.message?.content;

    if (!aiContent) {
      return new Response(
        JSON.stringify({ error: "No response from AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse AI response
    let analysisResult;
    try {
      // Gemini with response_format should return clean JSON
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
