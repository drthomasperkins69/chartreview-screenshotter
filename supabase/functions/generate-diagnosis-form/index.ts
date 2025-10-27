import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  diagnosis: z.string().min(1).max(500),
  pdfContent: z.string().max(200000)
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const { diagnosis, pdfContent } = requestSchema.parse(rawBody);

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating diagnosis form for:', diagnosis);

    const systemPrompt = `You are a medical documentation assistant helping to fill out a DVA (Department of Veterans' Affairs) Diagnosis Form. Based on the provided medical records and diagnosis, extract and organize relevant information to complete the form fields.

Return the information in this exact JSON format:
{
  "medicalDiagnosis": "The specific diagnosis with ICD code if available",
  "basisForDiagnosis": "Detailed summary including clinical examination findings, test results, imaging reports, and symptom history",
  "relatedConditions": "List of related conditions, or 'None specified' if not mentioned",
  "dateOfOnset": "MM/YYYY or DD/MM/YYYY format, or 'Not specified in records'",
  "firstConsultation": "Today's date in DD/MM/YYYY format"
}

Be factual and only include information clearly stated in the records.`;

    const userPrompt = `Diagnosis: ${diagnosis}

Medical Records Content:
${pdfContent}

Analyze these medical records and extract information for a DVA Diagnosis Form.`;

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [
          { 
            role: 'user', 
            content: `${systemPrompt}\n\n${userPrompt}` 
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Claude API error:', aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'AI service error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.content?.[0]?.text || '';
    
    console.log('Claude response:', aiContent);

    let formData;
    try {
      const jsonMatch = aiContent.match(/```json\s*(\{[\s\S]*?\})\s*```/) || 
                       aiContent.match(/(\{[\s\S]*\})/);
      formData = JSON.parse(jsonMatch ? jsonMatch[1] : aiContent);
    } catch (e) {
      console.error('Failed to parse Claude response:', e);
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { width, height } = page.getSize();
    let yPosition = height - 50;

    const drawText = (text: string, x: number, y: number, size: number, maxWidth: number, currentFont = font) => {
      const words = text.split(' ');
      let line = '';
      let currentY = y;

      for (const word of words) {
        const testLine = line + (line ? ' ' : '') + word;
        const textWidth = currentFont.widthOfTextAtSize(testLine, size);
        
        if (textWidth > maxWidth && line) {
          page.drawText(line, { x, y: currentY, size, font: currentFont, color: rgb(0, 0, 0) });
          line = word;
          currentY -= size + 4;
        } else {
          line = testLine;
        }
      }
      
      if (line) {
        page.drawText(line, { x, y: currentY, size, font: currentFont, color: rgb(0, 0, 0) });
        currentY -= size + 4;
      }
      
      return currentY;
    };

    page.drawText('DVA Diagnosis Form', { x: 50, y: yPosition, size: 20, font: boldFont, color: rgb(0, 0, 0) });
    yPosition -= 40;

    page.drawText('Medical Diagnosis:', { x: 50, y: yPosition, size: 12, font: boldFont, color: rgb(0, 0, 0) });
    yPosition -= 20;
    yPosition = drawText(formData.medicalDiagnosis || 'Not specified', 50, yPosition, 10, width - 100);
    yPosition -= 20;

    page.drawText('Basis for Diagnosis:', { x: 50, y: yPosition, size: 12, font: boldFont, color: rgb(0, 0, 0) });
    yPosition -= 20;
    yPosition = drawText(formData.basisForDiagnosis || 'Not specified', 50, yPosition, 10, width - 100);
    yPosition -= 20;

    page.drawText('Related Diagnosed Conditions:', { x: 50, y: yPosition, size: 12, font: boldFont, color: rgb(0, 0, 0) });
    yPosition -= 20;
    yPosition = drawText(formData.relatedConditions || 'None specified', 50, yPosition, 10, width - 100);
    yPosition -= 20;

    page.drawText('Approximate Date of Onset:', { x: 50, y: yPosition, size: 12, font: boldFont, color: rgb(0, 0, 0) });
    yPosition -= 20;
    page.drawText(formData.dateOfOnset || 'Not specified', { x: 50, y: yPosition, size: 10, font, color: rgb(0, 0, 0) });
    yPosition -= 30;

    page.drawText('Date of First Consultation:', { x: 50, y: yPosition, size: 12, font: boldFont, color: rgb(0, 0, 0) });
    yPosition -= 20;
    const today = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    page.drawText(today, { x: 50, y: yPosition, size: 10, font, color: rgb(0, 0, 0) });

    console.log('Successfully generated diagnosis form data');

    return new Response(
      JSON.stringify({ 
        success: true,
        diagnosis,
        formData
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error generating diagnosis form:', error);
    
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
