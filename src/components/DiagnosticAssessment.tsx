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
}

export const DiagnosticAssessment = ({ pdfContent, selectedPages, pdfFiles }: DiagnosticAssessmentProps) => {
  const { diaInstructions } = useDIA();
  const [localInstructions, setLocalInstructions] = useState(diaInstructions);
  const [selectedModel, setSelectedModel] = useState<"gemini" | "claude">("gemini");
  const [isGenerating, setIsGenerating] = useState(false);
  const [assessment, setAssessment] = useState<string>("");
  const [editableAssessment, setEditableAssessment] = useState<string>("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [sopFiles, setSopFiles] = useState<File[]>([]);
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string>("");

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

  const handleSopUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newFiles = Array.from(files).filter(file => 
      file.type === "application/pdf" || 
      file.name.toLowerCase().endsWith('.pdf')
    );

    if (newFiles.length === 0) {
      toast.error("Please upload PDF files only");
      return;
    }

    setSopFiles(prev => [...prev, ...newFiles]);
    toast.success(`${newFiles.length} SOP file(s) added`);
  };

  const removeSopFile = (index: number) => {
    setSopFiles(prev => prev.filter((_, i) => i !== index));
    toast.success("SOP file removed");
  };

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

    // Use SOP files from event if provided, otherwise use local state
    const filesToUse = sopFilesFromEvent.length > 0 ? sopFilesFromEvent : sopFiles;

    try {
      // Parse SOP files if any
      let sopContent = "";
      if (filesToUse.length > 0) {
        toast("Extracting SOP content...");
        
        for (const file of filesToUse) {
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

      // Extract content and capture screenshots for selected pages
      toast("Capturing page screenshots...");
      const selectedContent = await Promise.all(
        Array.from(selectedPages).map(async (key) => {
          const [fileIndexStr, pageNumStr] = key.split('-');
          const fileIndex = parseInt(fileIndexStr);
          const pageNum = parseInt(pageNumStr);
          
          const pdfDoc = pdfContent.find(p => p.fileIndex === fileIndex);
          const page = pdfDoc?.pages.find(p => p.pageNum === pageNum);
          
          let image: string | null = null;
          
          // Render page to canvas to capture screenshot
          try {
            const file = pdfFiles[fileIndex];
            if (file) {
              const arrayBuffer = await file.arrayBuffer();
              const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
              const pdfPage = await pdf.getPage(pageNum);
              
              // Create a canvas to render the page
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              if (context) {
                const viewport = pdfPage.getViewport({ scale: 1.5 });
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                await pdfPage.render({
                  canvasContext: context,
                  viewport: viewport,
                  canvas: canvas,
                }).promise;
                
                // Convert canvas to base64 image
                image = canvas.toDataURL('image/jpeg', 0.85);
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

      // Now create the combined PDF with assessment + page screenshots
      toast("Creating PDF document...");
      await createCombinedPDF(assessmentText, selectedContent);
      
      // Open the dialog to show the results
      setIsDialogOpen(true);
      toast.success("Diagnostic assessment generated successfully!");
    } catch (error) {
      console.error("Error generating assessment:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate assessment");
    } finally {
      setIsGenerating(false);
    }
  };

  const createCombinedPDF = async (assessmentText: string, selectedContent: any[]) => {
    try {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      // Add assessment text pages
      const fontSize = 11;
      const lineHeight = 14;
      const margin = 50;
      const maxWidth = 500;
      
      let page = pdfDoc.addPage([595, 842]); // A4 size
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
      
      // Add assessment text with word wrapping
      const lines = assessmentText.split('\n');
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
      
      // Add source pages section
      page = pdfDoc.addPage([595, 842]);
      page.drawText("Source Document Pages", {
        x: margin,
        y: 792,
        size: 14,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      let sourceY = 760;
      for (const content of selectedContent) {
        if (sourceY < margin + 40) {
          page = pdfDoc.addPage([595, 842]);
          sourceY = 792;
        }
        
        page.drawText(`• ${content.fileName} - Page ${content.pageNum}`, {
          x: margin,
          y: sourceY,
          size: 10,
          font: font,
          color: rgb(0.3, 0.3, 0.3),
        });
        sourceY -= 20;
      }
      
      // Save and create download URL
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setGeneratedPdfUrl(url);
      
    } catch (error) {
      console.error("Error creating PDF:", error);
      toast.error("Failed to create PDF document");
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editableAssessment);
    toast.success("Assessment copied to clipboard!");
  };

  const handleDownload = async () => {
    // Regenerate PDF with edited content
    toast("Creating PDF with edited content...");
    
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
    
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diagnostic-assessment-${Date.now()}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("PDF downloaded!");
  };

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Generate Settings</Label>
          <DIASettings />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Label htmlFor="model-select" className="text-sm font-medium mb-2 block">
              AI Model
            </Label>
            <Select value={selectedModel} onValueChange={(value: "gemini" | "claude") => setSelectedModel(value)}>
              <SelectTrigger id="model-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Google Gemini (Free)
                  </div>
                </SelectItem>
                <SelectItem value="claude">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Claude (Paid)
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium mb-2 block">
            Upload SOP Documents (from rma.gov.au)
          </Label>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById('sop-upload')?.click()}
                className="w-full gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload SOP PDFs
              </Button>
              <input
                id="sop-upload"
                type="file"
                accept=".pdf"
                multiple
                onChange={handleSopUpload}
                className="hidden"
              />
            </div>
            {sopFiles.length > 0 && (
              <div className="space-y-1">
                {sopFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                    <span className="truncate flex-1">{file.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSopFile(index)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {isGenerating && (
        <Card className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Generating assessment...</p>
          </div>
        </Card>
      )}

      {!isGenerating && (
        <Card className="flex-1 flex items-center justify-center text-center p-6 border-dashed">
          <div className="space-y-2">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Configure settings above and click Generate button below to create your diagnostic assessment PDF
            </p>
          </div>
        </Card>
      )}

      {/* Assessment Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Diagnostic Assessment Results</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden">
            <Label className="text-sm font-medium mb-2 block">
              Edit Assessment (changes will be reflected in the downloaded PDF)
            </Label>
            <Textarea
              value={editableAssessment}
              onChange={(e) => setEditableAssessment(e.target.value)}
              className="w-full h-[60vh] resize-none font-mono text-sm"
              placeholder="Assessment will appear here..."
            />
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={handleCopy} className="gap-2">
              <Copy className="w-4 h-4" />
              Copy
            </Button>
            <Button onClick={handleDownload} className="gap-2">
              <Download className="w-4 h-4" />
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
