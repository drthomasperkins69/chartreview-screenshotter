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
    const { pageImage, pageText, fileName, pageNum, model } = await req.json();

    if (!pageImage && !pageText) {
      return new Response(
        JSON.stringify({ error: "Page image or text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Analyzing page ${pageNum} from ${fileName}`);

    let diagnosis: string;

    if (model === "claude") {
      // Use Claude API directly
      const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
      if (!ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is not configured");
      }

      // Build user message content
      const userContent: any[] = [];
      
      if (pageText && pageText.trim()) {
        userContent.push({
          type: "text",
          text: `Analyze this medical document from ${fileName}, page ${pageNum}:\n\n${pageText}\n\nProvide ONLY a comma-separated list of diagnoses using this EXACT format: "Side Joint - Condition" (e.g., "Right Ankle - Sprain", "Left Knee - Osteoarthritis"). NEVER use "Bilateral" - if both sides are affected, list each side separately (e.g., "Right Knee - Arthritis, Left Knee - Arthritis"). Use descriptive medical condition names, NO ICD codes. Maximum 3-5 diagnoses. No explanations, just diagnosis names in the specified format.`
        });
      } else {
        userContent.push({
          type: "text",
          text: `Analyze this medical document image from ${fileName}, page ${pageNum} and suggest relevant diagnoses. Return ONLY a comma-separated list using format: "Side Joint - Condition" (e.g., "Right Shoulder - Tendinopathy"). NEVER use "Bilateral" - list each side separately. NO ICD codes. Maximum 3-5 diagnoses.`
        });
      }

      if (pageImage) {
        const base64Data = pageImage.split(',')[1] || pageImage;
        const mediaType = pageImage.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
        
        userContent.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: base64Data
          }
        });
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          messages: [
            {
              role: "user",
              content: userContent
            }
          ]
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Claude API error:", response.status, errorText);
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();
      diagnosis = data.content[0].text.trim();
    } else {
      // Use Lovable AI Gateway for Gemini
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        throw new Error("LOVABLE_API_KEY is not configured");
      }

      const messages: any[] = [
        {
          role: "system",
          content: "You are a medical diagnosis assistant. Analyze the provided medical document page and suggest relevant diagnoses. Return ONLY a comma-separated list of diagnoses in PLAIN LANGUAGE - do NOT use ICD-9 or ICD-10 codes. Use descriptive medical condition names instead. Keep it concise - maximum 3-5 diagnoses. Do not include explanations, just the diagnosis names in plain words."
        }
      ];

      const userContent: any[] = [];
      
      if (pageText && pageText.trim()) {
        userContent.push({
          type: "text",
          text: `Analyze this medical document from ${fileName}, page ${pageNum}:\n\n${pageText}`
        });
      } else {
        userContent.push({
          type: "text",
          text: `Analyze this medical document image from ${fileName}, page ${pageNum} and suggest relevant diagnoses:`
        });
      }

      if (pageImage) {
        const base64Data = pageImage.split(',')[1] || pageImage;
        const mediaType = pageImage.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
        
        userContent.push({
          type: "image_url",
          image_url: {
            url: `data:${mediaType};base64,${base64Data}`
          }
        });
      }

      messages.push({
        role: "user",
        content: userContent
      });

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          max_tokens: 500,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("AI Gateway error:", response.status, errorText);
        
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw new Error(`AI Gateway error: ${response.status}`);
      }

      const data = await response.json();
      diagnosis = data.choices[0].message.content.trim();
    }


    console.log("AI suggested diagnosis:", diagnosis);

    return new Response(
      JSON.stringify({ diagnosis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in suggest-diagnosis:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
