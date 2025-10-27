import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const contentSchema = z.object({
  pageNumber: z.number().int().positive(),
  text: z.string().max(50000).optional(),
  image: z.string().max(10 * 1024 * 1024).optional()
});

const requestSchema = z.object({
  instructions: z.string().min(1).max(5000),
  selectedContent: z.array(contentSchema).min(1).max(50),
  sopContent: z.string().max(100000).optional(),
  model: z.string().max(50).default('gemini')
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const { instructions, selectedContent, sopContent, model } = requestSchema.parse(rawBody);

    console.log(`Received ${selectedContent.length} pages`);
    console.log(`Pages with images: ${selectedContent.filter((p: any) => p.image).length}`);
    console.log(`Pages with text: ${selectedContent.filter((p: any) => p.text && p.text.trim()).length}`);

    // Build context from selected pages with images
    const contentParts: any[] = [];
    
    // Add text context (but emphasize that images are the primary source)
    let textContext = "Selected PDF Pages:\n\n";
    selectedContent.forEach((page: any, index: number) => {
      textContext += `Page ${index + 1}: ${page.fileName} (Original Page ${page.pageNum})\n`;
      if (page.text && page.text.trim()) {
        textContext += `Extracted text: ${page.text.substring(0, 500)}${page.text.length > 500 ? '...' : ''}\n`;
      } else {
        textContext += `(Text extraction unavailable - analyze the image)\n`;
      }
      textContext += `\n`;
    });

    // Add SOP content if provided
    if (sopContent) {
      textContext += "\n\n=== UPLOADED SOP DOCUMENTS (from rma.gov.au) ===\n";
      textContext += sopContent;
    }

    const systemPrompt = `You are a medical diagnostic assessment specialist. Your task is to analyze the provided PDF page images and create a comprehensive diagnostic assessment based on the specific instructions given.

CRITICAL: You have been provided with HIGH-RESOLUTION images of the selected PDF pages. These images are your PRIMARY source of information. Read and analyze ALL text, tables, and information visible in these images carefully.

Follow the DIA (Diagnostic Instructions Assessment) provided exactly. Be thorough, accurate, and professional in your assessment.

**IMPORTANT**: When analyzing SOP factors, reference the uploaded SOP documents provided below. All SOP information is sourced from rma.gov.au (Repatriation Medical Authority).

Each page image contains the complete medical documentation you need to analyze. Read every detail in the images.`;

    const userPrompt = `DIA Instructions:
${instructions}

${textContext}

IMPORTANT: ${selectedContent.length} page image(s) are attached below. These contain the complete medical records you need to analyze. Please examine each image carefully and extract all relevant medical information to complete the diagnostic assessment as per the DIA instructions above.`;

    let response;

    if (model === "claude") {
      const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
      if (!ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is not configured");
      }

      console.log("Calling Claude API for diagnostic assessment");

      // Build content array with text and images for Claude
      const claudeContent: any[] = [
        { type: "text", text: `${systemPrompt}\n\n${userPrompt}` }
      ];

      // Add images from selected pages
      selectedContent.forEach((page: any, index: number) => {
        if (page.image) {
          // Add a text label before each image
          claudeContent.push({
            type: "text",
            text: `\n=== IMAGE ${index + 1}: ${page.fileName} - Page ${page.pageNum} ===`
          });
          
          // Claude expects base64 image data without the data URL prefix
          const base64Data = page.image.split(',')[1] || page.image;
          const mediaType = page.image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
          
          claudeContent.push({
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64Data
            }
          });
        } else {
          console.warn(`Page ${index + 1} (${page.fileName} p${page.pageNum}) has no image`);
        }
      });

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
              content: claudeContent
            }
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Claude API error:", response.status, errorText);
        console.error("Request details - Images:", selectedContent.filter((p: any) => p.image).length);
        console.error("Request details - Content parts:", claudeContent.length);
        
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
        if (response.status === 401) {
          return new Response(
            JSON.stringify({ error: "Invalid API key. Please check your ANTHROPIC_API_KEY in settings." }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw new Error(`Claude API error: ${response.status} - ${errorText}`);
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

      // Build content parts with text and images for Gemini
      const geminiParts: any[] = [
        { text: systemPrompt },
        { text: userPrompt }
      ];

      // Add images from selected pages with labels
      selectedContent.forEach((page: any, index: number) => {
        if (page.image) {
          // Add a text label before each image
          geminiParts.push({
            text: `\n=== IMAGE ${index + 1}: ${page.fileName} - Page ${page.pageNum} ===`
          });
          
          // Gemini expects inline data with base64
          const base64Data = page.image.split(',')[1] || page.image;
          const mimeType = page.image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
          
          geminiParts.push({
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          });
        } else {
          console.warn(`Page ${index + 1} (${page.fileName} p${page.pageNum}) has no image`);
        }
      });

      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GOOGLE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: geminiParts,
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
