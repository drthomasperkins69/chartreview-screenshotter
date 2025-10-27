import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  fileId: z.string().uuid(),
  content: z.string().max(100000),
  pageNumber: z.number().int().positive()
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const { fileId, content, pageNumber } = requestSchema.parse(rawBody);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const chunkSize = 1000;
    const chunks: string[] = [];
    
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }

    console.log(`Generating embeddings for ${chunks.length} chunks from file ${fileId}, page ${pageNumber}`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      try {
        const embeddingResponse = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: chunk,
          }),
        });

        if (!embeddingResponse.ok) {
          const errorText = await embeddingResponse.text();
          console.error(`Embedding API error for chunk ${i}:`, embeddingResponse.status, errorText);
          continue;
        }

        const embeddingData = await embeddingResponse.json();
        const embedding = embeddingData.data[0].embedding;

        const { error: insertError } = await supabase
          .from('document_embeddings')
          .insert({
            file_id: fileId,
            page_number: pageNumber,
            chunk_index: i,
            content: chunk,
            embedding: embedding,
          });

        if (insertError) {
          console.error(`Error inserting embedding for chunk ${i}:`, insertError);
        }
      } catch (chunkError) {
        console.error(`Error processing chunk ${i}:`, chunkError);
      }
    }

    console.log(`Successfully generated and stored embeddings for file ${fileId}, page ${pageNumber}`);

    return new Response(
      JSON.stringify({ success: true, chunksProcessed: chunks.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in generate-embeddings:', error);
    
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: "Invalid input", details: error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
