import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
// Use Vite worker for pdf.js to avoid CORS/version issues
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Vite ?worker returns a Worker constructor
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - assign worker instance to workerPort
pdfjsLib.GlobalWorkerOptions.workerPort = new pdfjsWorker();

interface KeywordMatch {
  page: number;
  keyword: string;
  count: number;
}

interface PDFViewerProps {
  file: File;
  keywords: string;
  matchingPages: Set<number>;
  isSearching: boolean;
  onKeywordMatchesDetected: (matches: KeywordMatch[]) => void;
}

export const PDFViewer = ({
  file,
  keywords,
  matchingPages,
  isSearching,
  onKeywordMatchesDetected,
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
        const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
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

  useEffect(() => {
    const searchKeywords = async () => {
      if (!pdf || !keywords.trim() || !isSearching) return;

      const keywordList = keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k);
      const matches: KeywordMatch[] = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ')
          .toLowerCase();

        for (const keyword of keywordList) {
          const regex = new RegExp(keyword, 'gi');
          const count = (pageText.match(regex) || []).length;
          if (count > 0) {
            matches.push({ page: pageNum, keyword, count });
          }
        }
      }

      onKeywordMatchesDetected(matches);
    };

    searchKeywords();
  }, [pdf, keywords, isSearching, onKeywordMatchesDetected]);

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

      // Highlight matching pages
      if (matchingPages.has(currentPage)) {
        context.strokeStyle = "#22c55e";
        context.lineWidth = 4;
        context.strokeRect(0, 0, canvas.width, canvas.height);
      }
    } catch (error) {
      console.error("Error rendering page:", error);
    }
  }, [pdf, currentPage, scale, rotation, matchingPages]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

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
          className="shadow-medium border"
          style={{
            maxWidth: "100%",
            height: "auto",
          }}
        />
      </div>

      {matchingPages.size > 0 && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-lg shadow-medium text-sm">
          Page {currentPage} {matchingPages.has(currentPage) ? '✓ Contains keywords' : ''}
        </div>
      )}
    </div>
  );
};