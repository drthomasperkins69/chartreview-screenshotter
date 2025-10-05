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
    const { diagnosis, pdfContent } = await req.json();
    
    if (!diagnosis || !pdfContent) {
      return new Response(
        JSON.stringify({ error: 'Missing diagnosis or pdfContent' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating diagnosis form for:', diagnosis);

    // Prepare the prompt for AI
    const systemPrompt = `You are a medical documentation assistant helping to fill out a DVA (Department of Veterans' Affairs) Diagnosis Form. Based on the provided medical records and diagnosis, extract and organize relevant information to complete the form fields.

The form requires the following information:
1. Medical diagnosis (ICD code and description if available)
2. Basis for diagnosis (brief summary with key findings)
3. Related diagnosed conditions (if any)
4. Approximate date of onset
5. Key medical findings and test results

Analyze the provided medical records carefully and extract relevant information. Be factual and only include information that is clearly stated in the records. If information is not available, indicate "Not specified in records".`;

    const userPrompt = `Diagnosis: ${diagnosis}

Medical Records Content:
${pdfContent}

Please analyze the above medical records and provide a structured response with the following information for the DVA Diagnosis Form:

1. **Medical Diagnosis**: Provide the full medical diagnosis with ICD code if mentioned
2. **Basis for Diagnosis**: Summarize the key medical findings, test results, and clinical observations that support this diagnosis (2-3 paragraphs)
3. **Related Conditions**: List any other diagnosed conditions mentioned that relate to this primary diagnosis
4. **Date of Onset**: Provide the approximate date when symptoms or condition first appeared (if mentioned)
5. **Key Findings**: Bullet points of important medical findings, test results, or imaging results

Format your response clearly with these section headings.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'AI service error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const generatedContent = aiData.choices?.[0]?.message?.content || '';

    console.log('Successfully generated diagnosis form content');

    return new Response(
      JSON.stringify({ 
        success: true,
        diagnosis,
        content: generatedContent
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error generating diagnosis form:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
