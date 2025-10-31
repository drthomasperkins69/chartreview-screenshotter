import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as pdfjsLib from "pdfjs-dist";
// Use Vite worker for pdf.js to ensure fast, reliable rendering
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Vite ?worker returns a Worker constructor
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - assign worker instance to workerPort
pdfjsLib.GlobalWorkerOptions.workerPort = new pdfjsWorker();
import { Loader2 } from "lucide-react";

interface PDFPageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfDocument?: pdfjsLib.PDFDocumentProxy | null;
  file?: File;
  pageNumber: number;
  title?: string;
}

export const PDFPageDialog = ({ open, onOpenChange, pdfDocument, file, pageNumber, title }: PDFPageDialogProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [loadedPdf, setLoadedPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);

  // Load PDF from file if pdfDocument is not provided
  useEffect(() => {
    if (!open || !file || pdfDocument) return;

    const loadPdf = async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        setLoadedPdf(pdf);
      } catch (error) {
        console.error("Error loading PDF:", error);
      }
    };

    loadPdf();
  }, [open, file, pdfDocument]);

  useEffect(() => {
    const pdf = pdfDocument || loadedPdf;
    
    // Reset loading when dialog opens or page changes
    if (open) {
      setLoading(true);
    }
    
    if (!open || !pdf) {
      return;
    }

    const renderPage = async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        
        // Wait for canvas to be available
        const canvas = canvasRef.current;
        if (!canvas) {
          console.log("Canvas not ready for PDF page dialog");
          setLoading(false);
          return;
        }
        
        const context = canvas.getContext("2d");
        if (!context) {
          console.log("Canvas context not available");
          setLoading(false);
          return;
        }

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

    // Small delay to ensure canvas is mounted
    const timer = setTimeout(() => {
      renderPage();
    }, 100);
    
    return () => clearTimeout(timer);
  }, [open, pdfDocument, loadedPdf, pageNumber]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{title || `Page ${pageNumber}`}</DialogTitle>
          <DialogDescription>
            Enlarged view of the PDF page
          </DialogDescription>
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
