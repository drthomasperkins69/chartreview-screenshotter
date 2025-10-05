import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Download, Copy, FileText } from "lucide-react";
import { toast } from "sonner";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

interface PDFContent {
  fileName: string;
  fileIndex: number;
  pages: Array<{ pageNum: number; text: string }>;
}

interface DiagnosticAssessmentResultsProps {
  pdfContent: PDFContent[];
  selectedPages: Set<string>;
  pdfFiles: File[];
}

export const DiagnosticAssessmentResults = ({ pdfContent, selectedPages, pdfFiles }: DiagnosticAssessmentResultsProps) => {
  const [assessment, setAssessment] = useState<string>("");
  const [editableAssessment, setEditableAssessment] = useState<string>("");
  const [capturedPages, setCapturedPages] = useState<any[]>([]);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const handleAssessmentGenerated = (event: any) => {
      const { assessment: generatedAssessment, capturedPages: pages } = event.detail;
      setAssessment(generatedAssessment);
      setEditableAssessment(generatedAssessment);
      setCapturedPages(pages);
      setShowResults(true);
    };

    window.addEventListener('assessment-generated', handleAssessmentGenerated);
    return () => window.removeEventListener('assessment-generated', handleAssessmentGenerated);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(editableAssessment);
    toast.success("Assessment copied to clipboard!");
  };

  const handleDownloadCombinedPDF = async () => {
    try {
      toast("Creating combined PDF with assessment and page screenshots...");
      
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
            const imageBytes = content.image.split(',')[1]; // Remove data:image prefix
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
      link.download = `diagnostic-assessment-combined-${Date.now()}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Combined PDF downloaded!");
    } catch (error) {
      console.error("Error creating combined PDF:", error);
      toast.error("Failed to create combined PDF");
    }
  };

  if (!showResults) {
    return null;
  }

  return (
    <Card className="mt-4 p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Generated Assessment
          </Label>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="gap-2"
          >
            <Copy className="w-4 h-4" />
            Copy
          </Button>
        </div>

        <Textarea
          value={editableAssessment}
          onChange={(e) => setEditableAssessment(e.target.value)}
          className="w-full min-h-[400px] font-mono text-sm"
          placeholder="Assessment will appear here..."
        />

        <Button
          onClick={handleDownloadCombinedPDF}
          className="w-full gap-2"
          size="lg"
        >
          <Download className="w-4 h-4" />
          Download Combined PDF (Assessment + {capturedPages.length} Page Screenshots)
        </Button>
      </div>
    </Card>
  );
};
