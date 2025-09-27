import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface Signature {
  id: string;
  dataURL: string;
  width: number;
  height: number;
}

interface PlacedSignature {
  id: string;
  signatureId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

interface SignatureField {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  filled: boolean;
  signatureId?: string;
}

interface PDFViewerProps {
  file: File;
  placedSignatures: PlacedSignature[];
  signatureFields: SignatureField[];
  signatures: Signature[];
  mode: "view" | "sign" | "create" | "field";
  selectedSignature: string | null;
  onSignaturePlace: (x: number, y: number, page: number) => void;
  onFieldFill: (fieldId: string, signatureId: string) => void;
}

export const PDFViewer = ({
  file,
  placedSignatures,
  signatureFields,
  signatures,
  mode,
  selectedSignature,
  onSignaturePlace,
  onFieldFill,
}: PDFViewerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPdf = async () => {
      try {
        console.log("Starting PDF load...");
        setLoading(true);
        const arrayBuffer = await file.arrayBuffer();
        console.log("PDF arrayBuffer created, size:", arrayBuffer.byteLength);
        const pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
        console.log("PDF document loaded, pages:", pdfDoc.numPages);
        setPdf(pdfDoc);
        setNumPages(pdfDoc.numPages);
        setLoading(false);
        console.log("PDF load complete");
      } catch (error) {
        console.error("Error loading PDF:", error);
        setLoading(false);
      }
    };

    if (file) {
      loadPdf();
    }
  }, [file]);

  const renderPage = useCallback(async () => {
    console.log("renderPage called, pdf:", !!pdf, "canvas:", !!canvasRef.current);
    if (!pdf || !canvasRef.current) return;

    try {
      console.log("Getting page", currentPage);
      const page = await pdf.getPage(currentPage);
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      
      console.log("Canvas context:", !!context);
      if (!context) return;

      const viewport = page.getViewport({ scale, rotation });
      console.log("Viewport:", viewport.width, "x", viewport.height);
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Clear canvas
      context.clearRect(0, 0, canvas.width, canvas.height);

      console.log("Starting page render...");
      // Render PDF page
      await page.render({
        canvasContext: context,
        viewport: viewport,
        canvas: canvas,
      }).promise;
      console.log("Page render complete");

      // Render placed signatures for current page
      const currentPageSignatures = placedSignatures.filter(ps => ps.page === currentPage);
      
      for (const placedSig of currentPageSignatures) {
        const signature = signatures.find(s => s.id === placedSig.signatureId);
        if (signature) {
          const img = new Image();
          img.onload = () => {
            context.drawImage(
              img,
              placedSig.x * scale,
              placedSig.y * scale,
              placedSig.width * scale,
              placedSig.height * scale
            );
          };
          img.src = signature.dataURL;
        }
      }

      // Render signature fields for current page
      const currentPageFields = signatureFields.filter(sf => sf.page === currentPage);
      
      for (const field of currentPageFields) {
        if (field.filled && field.signatureId) {
          // Render filled field with signature
          const signature = signatures.find(s => s.id === field.signatureId);
          if (signature) {
            const img = new Image();
            img.onload = () => {
              context.drawImage(
                img,
                field.x * scale,
                field.y * scale,
                field.width * scale,
                field.height * scale
              );
            };
            img.src = signature.dataURL;
          }
        } else {
          // Render empty field placeholder
          context.strokeStyle = "#3b82f6";
          context.lineWidth = 2;
          context.setLineDash([5, 5]);
          context.strokeRect(
            field.x * scale,
            field.y * scale,
            field.width * scale,
            field.height * scale
          );
          context.setLineDash([]);
          
          // Add "Sign Here" text
          context.fillStyle = "#3b82f6";
          context.font = `${12 * scale}px Arial`;
          context.textAlign = "center";
          context.fillText(
            "Sign Here",
            (field.x + field.width / 2) * scale,
            (field.y + field.height / 2) * scale + 4
          );
        }
      }
    } catch (error) {
      console.error("Error rendering page:", error);
    }
  }, [pdf, currentPage, scale, rotation, placedSignatures, signatureFields, signatures]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / scale;
      const y = (e.clientY - rect.top) / scale;

      if (mode === "field") {
        onSignaturePlace(x, y, currentPage);
        return;
      }

      if (mode === "sign" && selectedSignature) {
        // Check if clicking on an empty signature field
        const clickedField = signatureFields.find(field => 
          field.page === currentPage &&
          !field.filled &&
          x >= field.x && x <= field.x + field.width &&
          y >= field.y && y <= field.y + field.height
        );

        if (clickedField) {
          onFieldFill(clickedField.id, selectedSignature);
        } else {
          onSignaturePlace(x, y, currentPage);
        }
      }
    },
    [mode, selectedSignature, scale, currentPage, signatureFields, onSignaturePlace, onFieldFill]
  );

  const nextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, numPages));
  };

  const prevPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  const zoomIn = () => {
    setScale(prev => Math.min(prev + 0.2, 3));
  };

  const zoomOut = () => {
    setScale(prev => Math.max(prev - 0.2, 0.5));
  };

  const rotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 bg-pdf-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-muted-foreground">Loading PDF...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-pdf-background">
      {/* Controls */}
      <div className="flex items-center justify-between p-4 bg-toolbar-background border-b">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={prevPage}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            {currentPage} of {numPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={nextPage}
            disabled={currentPage >= numPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={zoomOut}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground px-2 min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button variant="secondary" size="sm" onClick={zoomIn}>
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={rotate}>
            <RotateCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* PDF Canvas */}
      <div
        ref={containerRef}
        className="flex justify-center p-6 min-h-[600px] overflow-auto"
      >
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className={`shadow-medium border ${
            (mode === "sign" && selectedSignature) || mode === "field"
              ? "cursor-crosshair"
              : "cursor-default"
          }`}
          style={{
            maxWidth: "100%",
            height: "auto",
          }}
        />
      </div>

      {/* Mode indicator */}
      {mode === "field" && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-secondary text-secondary-foreground px-4 py-2 rounded-lg shadow-medium text-sm">
          Click to add signature fields
        </div>
      )}
      
      {mode === "sign" && selectedSignature && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-medium text-sm">
          Click fields or anywhere to place your signature
        </div>
      )}
    </div>
  );
};