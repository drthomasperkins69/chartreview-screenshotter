import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, FileText, Sparkles, Upload, Download, X, Copy } from "lucide-react";
import { toast } from "sonner";
import { useDIA } from "@/contexts/DIAContext";
import { DIASettings } from "./DIASettings";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";

const FUNCTIONS_BASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  "https://hpclzzykgxolszduecqa.supabase.co";

interface PDFContent {
  fileName: string;
  fileIndex: number;
  pages: Array<{ pageNum: number; text: string }>;
}

interface DiagnosticAssessmentProps {
  pdfContent: PDFContent[];
  selectedPages: Set<string>; // Format: "fileIndex-pageNum"
  pdfFiles: File[]; // Add PDF files to capture screenshots
  selectedModel: "gemini" | "claude";
}

export const DiagnosticAssessment = ({ pdfContent, selectedPages, pdfFiles, selectedModel }: DiagnosticAssessmentProps) => {
  const { diaInstructions } = useDIA();
  const [localInstructions, setLocalInstructions] = useState(diaInstructions);
  const [isGenerating, setIsGenerating] = useState(false);
  const [assessment, setAssessment] = useState<string>("");
  const [editableAssessment, setEditableAssessment] = useState<string>("");
  const [capturedPages, setCapturedPages] = useState<any[]>([]);

  // Update local instructions when global instructions change
  useEffect(() => {
    setLocalInstructions(diaInstructions);
  }, [diaInstructions]);

  // Listen for generate event from parent
  useEffect(() => {
    const handleGenerate = (event: any) => {
      const sopFilesFromEvent = event.detail?.sopFiles || [];
      if (selectedPages.size > 0 && localInstructions.trim()) {
        handleGenerateAssessment(sopFilesFromEvent);
      }
    };

    window.addEventListener('generate-assessment', handleGenerate);
    return () => window.removeEventListener('generate-assessment', handleGenerate);
  }, [selectedPages, localInstructions]);

  const handleGenerateAssessment = async (sopFilesFromEvent: File[] = []) => {
    if (!localInstructions.trim()) {
      toast.error("Please enter DIA instructions");
      return;
    }

    if (selectedPages.size === 0) {
      toast.error("Please select at least one page to assess");
      return;
    }

    setIsGenerating(true);
    setAssessment("");
    setEditableAssessment("");

    try {
      // Parse SOP files if any
      let sopContent = "";
      if (sopFilesFromEvent.length > 0) {
        toast("Extracting SOP content...");
        
        for (const file of sopFilesFromEvent) {
          const arrayBuffer = await file.arrayBuffer();
          const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
          let fileText = `\n\n--- SOP Document: ${file.name} ---\n\n`;
          
          for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fileText += pageText + '\n';
          }
          
          sopContent += fileText;
        }
      }

      // Extract content and capture HIGH QUALITY screenshots for selected pages
      toast("Capturing high-resolution page screenshots...");
      const selectedContent = await Promise.all(
        Array.from(selectedPages).map(async (key) => {
          const [fileIndexStr, pageNumStr] = key.split('-');
          const fileIndex = parseInt(fileIndexStr);
          const pageNum = parseInt(pageNumStr);
          
          const pdfDoc = pdfContent.find(p => p.fileIndex === fileIndex);
          const page = pdfDoc?.pages.find(p => p.pageNum === pageNum);
          
          let image: string | null = null;
          
          // Render page to canvas to capture screenshot at HIGH RESOLUTION
          try {
            const file = pdfFiles[fileIndex];
            if (file) {
              const arrayBuffer = await file.arrayBuffer();
              const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
              const pdfPage = await pdf.getPage(pageNum);
              
              // Create a canvas to render the page at 2x scale for better quality
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              if (context) {
                // Use 2.5x scale for very high quality screenshots
                const viewport = pdfPage.getViewport({ scale: 2.5 });
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                await pdfPage.render({
                  canvasContext: context,
                  viewport: viewport,
                  canvas: canvas,
                }).promise;
                
                // Convert canvas to base64 PNG for lossless quality
                image = canvas.toDataURL('image/png');
              }
            }
          } catch (error) {
            console.error(`Failed to capture screenshot for page ${key}:`, error);
          }
          
          return {
            fileName: pdfDoc?.fileName || `Document ${fileIndex + 1}`,
            fileIndex,
            pageNum,
            text: page?.text || "",
            image
          };
        })
      );

      // Log what we're sending to help debug
      console.log(`Sending ${selectedContent.length} pages to AI`);
      console.log(`Pages with images: ${selectedContent.filter(p => p.image).length}`);
      console.log(`Pages with text: ${selectedContent.filter(p => p.text && p.text.trim()).length}`);

      const resp = await fetch(`${FUNCTIONS_BASE}/functions/v1/generate-diagnostic-assessment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructions: localInstructions,
          selectedContent,
          sopContent,
          model: selectedModel
        }),
      });

      if (!resp.ok) {
        if (resp.status === 429) throw new Error("Rate limits exceeded, please try again later.");
        if (resp.status === 402) throw new Error("AI credits exhausted. Please add credits.");
        const errorText = await resp.text();
        throw new Error(`Assessment generation error: ${errorText}`);
      }

      const data = await resp.json();
      const assessmentText = data.assessment;
      setAssessment(assessmentText);
      setEditableAssessment(assessmentText);
      setCapturedPages(selectedContent);
      
      // Dispatch event for DiagnosticAssessmentResults component
      const event = new CustomEvent('assessment-generated', {
        detail: { assessment: assessmentText, capturedPages: selectedContent }
      });
      window.dispatchEvent(event);
      
      toast.success("Diagnostic assessment generated successfully!");
    } catch (error) {
      console.error("Error generating assessment:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate assessment");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editableAssessment);
    toast.success("Assessment copied to clipboard!");
  };

  const handleDownload = async () => {
    try {
      toast("Creating PDF with assessment and page screenshots...");
      
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      const fontSize = 11;
      const lineHeight = 14;
      const margin = 50;
      const maxWidth = 500;
      
      let page = pdfDoc.addPage([595, 842]);
      let yPosition = 792;
      
      // Title
      page.drawText("Diagnostic Assessment Report", {
        x: margin,
        y: yPosition,
        size: 16,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      yPosition -= 30;
      
      // Add edited assessment text
      const lines = editableAssessment.split('\n');
      for (const line of lines) {
        if (yPosition < margin + 20) {
          page = pdfDoc.addPage([595, 842]);
          yPosition = 792;
        }
        
        const words = line.split(' ');
        let currentLine = '';
        
        for (const word of words) {
          const testLine = currentLine + (currentLine ? ' ' : '') + word;
          const width = font.widthOfTextAtSize(testLine, fontSize);
          
          if (width > maxWidth && currentLine) {
            page.drawText(currentLine, {
              x: margin,
              y: yPosition,
              size: fontSize,
              font: font,
              color: rgb(0, 0, 0),
            });
            yPosition -= lineHeight;
            currentLine = word;
            
            if (yPosition < margin + 20) {
              page = pdfDoc.addPage([595, 842]);
              yPosition = 792;
            }
          } else {
            currentLine = testLine;
          }
        }
        
        if (currentLine) {
          page.drawText(currentLine, {
            x: margin,
            y: yPosition,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0),
          });
          yPosition -= lineHeight;
        }
      }
      
      // Add separator page
      page = pdfDoc.addPage([595, 842]);
      page.drawText("Source Document Pages", {
        x: margin,
        y: 792,
        size: 14,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      // Add captured page screenshots
      for (const content of capturedPages) {
        if (content.image) {
          try {
            // Create a new page for each screenshot
            const screenshotPage = pdfDoc.addPage([595, 842]);
            
            // Add header with page info
            screenshotPage.drawText(`${content.fileName} - Page ${content.pageNum}`, {
              x: margin,
              y: 792,
              size: 10,
              font: boldFont,
              color: rgb(0, 0, 0),
            });
            
            // Embed the image
            const imageBytes = content.image.split(',')[1]; // Remove data:image/jpeg;base64, prefix
            const imageData = Uint8Array.from(atob(imageBytes), c => c.charCodeAt(0));
            
            let embeddedImage;
            if (content.image.includes('image/png')) {
              embeddedImage = await pdfDoc.embedPng(imageData);
            } else {
              embeddedImage = await pdfDoc.embedJpg(imageData);
            }
            
            // Calculate dimensions to fit on page
            const imgWidth = embeddedImage.width;
            const imgHeight = embeddedImage.height;
            const maxImageWidth = 495; // Page width minus margins
            const maxImageHeight = 700; // Leave space for header
            
            let scaledWidth = imgWidth;
            let scaledHeight = imgHeight;
            
            // Scale down if needed
            if (imgWidth > maxImageWidth || imgHeight > maxImageHeight) {
              const widthRatio = maxImageWidth / imgWidth;
              const heightRatio = maxImageHeight / imgHeight;
              const scale = Math.min(widthRatio, heightRatio);
              
              scaledWidth = imgWidth * scale;
              scaledHeight = imgHeight * scale;
            }
            
            // Center the image
            const x = (595 - scaledWidth) / 2;
            const y = 762 - scaledHeight;
            
            screenshotPage.drawImage(embeddedImage, {
              x,
              y,
              width: scaledWidth,
              height: scaledHeight,
            });
          } catch (error) {
            console.error(`Failed to add screenshot for page ${content.pageNum}:`, error);
          }
        }
      }
      
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `diagnostic-assessment-${Date.now()}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Combined PDF downloaded!");
    } catch (error) {
      console.error("Error creating combined PDF:", error);
      toast.error("Failed to create combined PDF");
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      {isGenerating && (
        <Card className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Generating assessment...</p>
          </div>
        </Card>
      )}

      {!assessment && !isGenerating && (
        <Card className="flex-1 flex items-center justify-center text-center p-6 border-dashed">
          <div className="space-y-2">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Configure settings above and click Generate button below to create your diagnostic assessment
            </p>
          </div>
        </Card>
      )}
    </div>
  );
};
