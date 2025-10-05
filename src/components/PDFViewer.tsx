import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";
import { createWorker } from "tesseract.js";
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
  fileName: string;
  fileIndex: number;
}

interface PDFViewerProps {
  files: File[];
  currentFileIndex: number;
  keywords: string;
  dateSearch: string;
  matchingPages: Set<number>;
  isSearching: boolean;
  onKeywordMatchesDetected: (matches: KeywordMatch[]) => void;
  onTextExtracted?: (fileIndex: number, fileName: string, pageTexts: Array<{ pageNum: number; text: string }>) => void;
  onOCRProgress?: (current: number, total: number, message: string) => void;
  selectedPage: number | null;
  onPageChange: (page: number) => void;
}

export const PDFViewer = ({
  files,
  currentFileIndex,
  keywords,
  dateSearch,
  matchingPages,
  isSearching,
  onKeywordMatchesDetected,
  onTextExtracted,
  onOCRProgress,
  selectedPage,
  onPageChange,
}: PDFViewerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);

  const currentFile = files[currentFileIndex] || null;

  // Navigate to selected page when it changes
  useEffect(() => {
    if (selectedPage !== null && selectedPage !== currentPage && selectedPage <= numPages) {
      setCurrentPage(selectedPage);
      onPageChange(selectedPage);
    }
  }, [selectedPage, currentPage, numPages]);

  useEffect(() => {
    const loadPdf = async () => {
      if (!currentFile) return;
      
      try {
        console.log("Starting PDF load...");
        setLoading(true);
        const arrayBuffer = await currentFile.arrayBuffer();
        console.log("PDF arrayBuffer created, size:", arrayBuffer.byteLength);
        const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        console.log("PDF document loaded, pages:", pdfDoc.numPages);
        setPdf(pdfDoc);
        setNumPages(pdfDoc.numPages);
        // Only reset to page 1 if there's no selectedPage, otherwise keep the selection
        if (selectedPage === null || selectedPage > pdfDoc.numPages) {
          setCurrentPage(1);
        } else {
          setCurrentPage(selectedPage);
        }
        setLoading(false);
        console.log("PDF load complete");
      } catch (error) {
        console.error("Error loading PDF:", error);
        setLoading(false);
      }
    };

    loadPdf();
  }, [currentFile, selectedPage]);

  // Extract text from all files for AI analysis with OCR
  useEffect(() => {
    const extractAllFilesText = async () => {
      if (files.length === 0 || !onTextExtracted) return;

      try {
        // Calculate total pages across all files
        let totalPages = 0;
        const filePagesMap = new Map<number, number>();
        
        for (let i = 0; i < files.length; i++) {
          const arrayBuffer = await files[i].arrayBuffer();
          const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
          filePagesMap.set(i, pdfDoc.numPages);
          totalPages += pdfDoc.numPages;
        }

        let processedPages = 0;
        onOCRProgress?.(0, totalPages, "Initializing OCR for all files...");
        
        const worker = await createWorker('eng');

        for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
          const file = files[fileIndex];
          onOCRProgress?.(processedPages, totalPages, `Processing ${file.name}...`);
          
          const arrayBuffer = await file.arrayBuffer();
          const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
          const pageTexts: Array<{ pageNum: number; text: string }> = [];

          for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            onOCRProgress?.(
              processedPages + pageNum, 
              totalPages, 
              `Processing ${file.name} - page ${pageNum}/${pdfDoc.numPages}...`
            );
            
            const page = await pdfDoc.getPage(pageNum);
            
            // Extract existing text layer
            const textContent = await page.getTextContent();
            const extractedText = textContent.items
              .map((item: any) => item.str)
              .join(' ');
            
            // Render page to canvas for OCR
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            if (context) {
              await page.render({
                canvasContext: context,
                viewport: viewport,
                canvas: canvas,
              }).promise;
              
              // Perform OCR on the rendered page
              const { data: { text: ocrText } } = await worker.recognize(canvas);
              
              // Combine extracted text and OCR text
              const combinedText = `${extractedText} ${ocrText}`.trim();
              pageTexts.push({ pageNum, text: combinedText });
            } else {
              // Fallback to just extracted text if canvas fails
              pageTexts.push({ pageNum, text: extractedText });
            }
          }

          processedPages += pdfDoc.numPages;
          onTextExtracted(fileIndex, file.name, pageTexts);
        }

        await worker.terminate();
        onOCRProgress?.(totalPages, totalPages, "OCR complete!");
        toast.success(`OCR completed for ${files.length} file(s)`);
      } catch (error) {
        console.error("Error extracting text with OCR:", error);
        toast.error("OCR processing failed");
      }
    };

    extractAllFilesText();
  }, [files, onTextExtracted, onOCRProgress]);

  useEffect(() => {
    const searchKeywords = async () => {
      if (files.length === 0 || !isSearching) return;
      if (!keywords.trim() && !dateSearch.trim()) return;

      const matches: KeywordMatch[] = [];

      // Search across ALL PDF files
      for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
        const file = files[fileIndex];
        
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

          // Generate date format variations if searching by date
          let searchTerms: string[] = [];
          
          if (dateSearch.trim()) {
            searchTerms = generateDateFormats(dateSearch);
          } else if (keywords.trim()) {
            searchTerms = keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k);
          }

          for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
              .map((item: any) => item.str)
              .join(' ');

            for (const term of searchTerms) {
              // Use word boundaries to match exact words only
              const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
              const count = (pageText.match(regex) || []).length;
              if (count > 0) {
                matches.push({ 
                  page: pageNum, 
                  keyword: term, 
                  count,
                  fileName: file.name,
                  fileIndex 
                });
              }
            }
          }
        } catch (error) {
          console.error(`Error searching file ${file.name}:`, error);
        }
      }

      onKeywordMatchesDetected(matches);
    };

    // Function to generate multiple date format variations
    const generateDateFormats = (dateInput: string): string[] => {
      const formats: string[] = [];
      
      // Try to parse the date
      const date = new Date(dateInput);
      if (isNaN(date.getTime())) {
        // If can't parse, just search for the raw input
        return [dateInput];
      }

      const month = date.getMonth() + 1;
      const day = date.getDate();
      const year = date.getFullYear();
      
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      const monthName = monthNames[month - 1];
      const monthNameShort = monthNamesShort[month - 1];
      
      const padZero = (num: number) => num.toString().padStart(2, '0');

      // Generate all common date formats
      formats.push(
        // MM/DD/YYYY variations
        `${padZero(month)}/${padZero(day)}/${year}`,
        `${month}/${day}/${year}`,
        `${padZero(month)}/${day}/${year}`,
        `${month}/${padZero(day)}/${year}`,
        
        // DD/MM/YYYY variations
        `${padZero(day)}/${padZero(month)}/${year}`,
        `${day}/${month}/${year}`,
        `${padZero(day)}/${month}/${year}`,
        `${day}/${padZero(month)}/${year}`,
        
        // YYYY-MM-DD variations
        `${year}-${padZero(month)}-${padZero(day)}`,
        `${year}-${month}-${day}`,
        
        // Month DD, YYYY
        `${monthName} ${padZero(day)}, ${year}`,
        `${monthName} ${day}, ${year}`,
        `${monthNameShort} ${padZero(day)}, ${year}`,
        `${monthNameShort} ${day}, ${year}`,
        
        // DD Month YYYY
        `${padZero(day)} ${monthName} ${year}`,
        `${day} ${monthName} ${year}`,
        `${padZero(day)} ${monthNameShort} ${year}`,
        `${day} ${monthNameShort} ${year}`,
        
        // MM-DD-YYYY variations
        `${padZero(month)}-${padZero(day)}-${year}`,
        `${month}-${day}-${year}`,
        
        // DD-MM-YYYY variations
        `${padZero(day)}-${padZero(month)}-${year}`,
        `${day}-${month}-${year}`,
        
        // Month DD YYYY (no comma)
        `${monthName} ${padZero(day)} ${year}`,
        `${monthName} ${day} ${year}`,
        `${monthNameShort} ${padZero(day)} ${year}`,
        `${monthNameShort} ${day} ${year}`,
        
        // YYYY/MM/DD
        `${year}/${padZero(month)}/${padZero(day)}`,
        `${year}/${month}/${day}`,
        
        // DD.MM.YYYY (European)
        `${padZero(day)}.${padZero(month)}.${year}`,
        `${day}.${month}.${year}`
      );

      return [...new Set(formats)]; // Remove duplicates
    };

    searchKeywords();
  }, [files, keywords, dateSearch, isSearching, onKeywordMatchesDetected]);

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
    const newPage = Math.min(currentPage + 1, numPages);
    setCurrentPage(newPage);
    onPageChange(newPage);
  };

  const prevPage = () => {
    const newPage = Math.max(currentPage - 1, 1);
    setCurrentPage(newPage);
    onPageChange(newPage);
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
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-sm text-muted-foreground">Loading PDF...</p>
            </div>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="shadow-medium border"
            style={{
              maxWidth: "100%",
              height: "auto",
            }}
          />
        )}
      </div>

      {matchingPages.size > 0 && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-lg shadow-medium text-sm">
          Page {currentPage} {matchingPages.has(currentPage) ? '✓ Contains keywords' : ''}
        </div>
      )}
    </div>
  );
};