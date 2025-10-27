import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  query: z.string().min(1).max(500),
  pdfContent: z.array(z.any()).max(100),
  model: z.string().max(50).default('gemini')
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const { query, pdfContent, model } = requestSchema.parse(rawBody);

    const pdfContext = pdfContent.map((doc: any) => 
      `Document: ${doc.fileName}\n${doc.pages.map((p: any) => 
        `Page ${p.pageNum}: ${p.text}`
      ).join('\n\n')}`
    ).join('\n\n=== NEXT DOCUMENT ===\n\n');

    const isDateQuery = /\b(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{4}|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(query);

    const systemPrompt = isDateQuery 
      ? `You are a medical document analyzer specialized in finding pages with specific dates.\n\nPRIMARY TASK: Extract dates from the user's query and, for EACH DATE, choose the SINGLE MOST RELEVANT PAGE that contains that date (or an equivalent format). Do not return multiple pages for the same date.\n\nCRITICAL INSTRUCTIONS:\n- Identify explicit dates in the user's query (e.g., "20 March 1989")\n- Consider equivalent formats (e.g., 20/03/1989, 1989-03-20, 20 Mar 89)\n- For each query date, pick ONE best page only. If several pages mention it, choose the one that most clearly references that date and context.\n- Include the matched date for that page as a separate field: matchedDate\n- Do NOT include keyword suggestions for date queries; return an empty array for keywords\n- Do NOT duplicate the same page across multiple entries\n\nReturn ONLY valid JSON (no markdown) with this exact structure:\n{\n  "relevantPages": [\n    { "fileIndex": 0, "pageNum": 1, "matchedDate": "1989-03-20 or '20 March 1989'", "reason": "Date: 20/03/1989 - brief description" }\n  ],\n  "keywords": []\n}`
      : `You are a medical document analyzer specialized in extracting pages relevant to medical conditions and topics.\n\nPRIMARY TASK: Find ALL pages that contain information about the conditions, symptoms, or medical topics mentioned in the query.\n\nKEY INSTRUCTIONS:\n- Match medical conditions, symptoms, diagnoses, treatments, and procedures\n- Be generous in matches - if a page has ANY relevance to the query, include it\n- Extract the specific reasons why each page is relevant\n- Suggest relevant search keywords based on the query\n- Return ONE entry per page (do NOT duplicate pages)\n\nReturn ONLY a valid JSON object (no markdown, no code blocks) with this exact structure:\n{\n  "relevantPages": [\n    {\n      "fileIndex": 0,\n      "pageNum": 1,\n      "reason": "Brief explanation of why this page matches"\n    }\n  ],\n  "keywords": ["keyword1", "keyword2"]\n}\n\nIf you find relevant pages, include them. If not, return empty arrays but still valid JSON.`;

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
      aiContent = aiResponse.candidates[0].content.parts[0].text;
    }

    if (!aiContent) {
      return new Response(
        JSON.stringify({ error: "No response from AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let analysisResult;
    try {
      analysisResult = JSON.parse(aiContent);
      console.log("Parsed analysis result:", JSON.stringify(analysisResult));
    } catch (e) {
      console.error("Failed to parse AI response:", aiContent);
      console.error("Parse error:", e);
      
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
    
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: "Invalid input", details: error.errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
