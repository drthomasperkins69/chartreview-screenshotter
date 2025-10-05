import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as pdfjsLib from "pdfjs-dist";
import { Loader2 } from "lucide-react";

interface PDFPageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File;
  pageNumber: number;
  title?: string;
}

export const PDFPageDialog = ({ open, onOpenChange, file, pageNumber, title }: PDFPageDialogProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !canvasRef.current) return;

    const renderPage = async () => {
      setLoading(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        const page = await pdf.getPage(pageNumber);
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const context = canvas.getContext("2d");
        if (!context) return;

        // Render at 2x scale for better quality
        const viewport = page.getViewport({ scale: 2.0 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        }).promise;

        setLoading(false);
      } catch (error) {
        console.error("Error rendering PDF page:", error);
        setLoading(false);
      }
    };

    renderPage();
  }, [open, file, pageNumber]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{title || `Page ${pageNumber}`}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading page...</p>
            </div>
          ) : (
            <canvas ref={canvasRef} className="max-w-full h-auto border shadow-lg" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
