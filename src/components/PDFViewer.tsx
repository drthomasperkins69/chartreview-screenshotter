import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight, Trash2, Save, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import * as pdfjsLib from "pdfjs-dist";
import { createWorker } from "tesseract.js";
import { PDFPageDialog } from "./PDFPageDialog";
import { format, formatDistanceToNow } from "date-fns";
// Use Vite worker for pdf.js to avoid CORS/version issues
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Vite ?worker returns a Worker constructor
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - assign worker instance to workerPort
pdfjsLib.GlobalWorkerOptions.workerPort = new pdfjsWorker();

// Levenshtein distance for fuzzy matching
const levenshteinDistance = (str1: string, str2: string): number => {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
};

// Calculate similarity score (0 to 1, where 1 is exact match)
const similarityScore = (str1: string, str2: string): number => {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1.0;
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  return 1 - distance / maxLen;
};

interface KeywordMatch {
  page: number;
  keyword: string;
  count: number;
  fileName: string;
  fileIndex: number;
}

interface PDFContent {
  fileName: string;
  fileIndex: number;
  pages: Array<{ pageNum: number; text: string }>;
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
  triggerScan?: (fileIndex: number) => void;
  onTogglePageSelection?: (fileIndex: number, pageNum: number) => void;
  selectedPagesForExtraction?: Set<string>;
  pageDiagnoses?: Record<string, string>;
  onDiagnosisChange?: (fileIndex: number, pageNum: number, diagnosis: string) => void;
  onDeletePage?: (fileIndex: number, pageNum: number) => void;
  pdfContent?: PDFContent[];
  refreshDiagnoses?: () => Promise<void>;
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
  triggerScan,
  onTogglePageSelection,
  selectedPagesForExtraction,
  pageDiagnoses = {},
  onDiagnosisChange,
  onDeletePage,
  pdfContent = [],
  refreshDiagnoses,
}: PDFViewerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  // Click to enlarge page dialog state
  const [showEnlargedPage, setShowEnlargedPage] = useState(false);
  // Track last modified time for each file
  const [fileLastModified, setFileLastModified] = useState<Record<number, Date>>({});
  const [, setTick] = useState(0); // Force re-render for relative time updates

  const currentFile = files[currentFileIndex] || null;

  // Update relative time display every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(prev => prev + 1);
    }, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, []);

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
          onPageChange(1);
        } else {
          setCurrentPage(selectedPage);
          onPageChange(selectedPage);
        }
        setLoading(false);
        console.log("PDF load complete");
      } catch (error) {
        console.error("Error loading PDF:", error);
        setLoading(false);
      }
    };

    loadPdf();
  }, [currentFile, selectedPage, onPageChange]);

  // Manual OCR scan function exposed to parent
  useEffect(() => {
    if (!triggerScan) return;
    
    // This effect doesn't do anything automatically anymore
    // Scanning is now triggered manually via the triggerScan callback
  }, [triggerScan]);

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

            // Extract words from page text
            const pageWords = pageText.toLowerCase().split(/\s+/).filter(w => w.length > 0);

            for (const term of searchTerms) {
              const searchTerm = term.toLowerCase();
              let matchCount = 0;
              
              // For date searches, use exact matching
              if (dateSearch.trim()) {
                const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
                matchCount = (pageText.match(regex) || []).length;
              } else {
                // For keyword searches, use fuzzy matching
                // Threshold: 0.85 similarity (allows 1-2 character differences)
                const SIMILARITY_THRESHOLD = 0.85;
                
                for (const word of pageWords) {
                  // Clean word of punctuation
                  const cleanWord = word.replace(/[^\w]/g, '');
                  if (cleanWord.length === 0) continue;
                  
                  const similarity = similarityScore(searchTerm, cleanWord);
                  if (similarity >= SIMILARITY_THRESHOLD) {
                    matchCount++;
                  }
                }
              }
              
              if (matchCount > 0) {
                matches.push({ 
                  page: pageNum, 
                  keyword: term, 
                  count: matchCount,
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

  // Function to extract and format dates from text using regex
  const extractDatesFromText = (text: string): string[] => {
    const datePatterns = [
      // DD/MM/YYYY or MM/DD/YYYY
      /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g,
      // YYYY-MM-DD or YYYY/MM/DD
      /\b\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}\b/g,
      // Month DD, YYYY or DD Month YYYY
      /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b/gi,
      /\b\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\b/gi,
    ];

    const foundDates = new Set<string>();
    const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    datePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const parsedDate = new Date(match.trim());
          if (!isNaN(parsedDate.getTime())) {
            const day = String(parsedDate.getDate()).padStart(2, '0');
            const month = monthNamesShort[parsedDate.getMonth()];
            const year = parsedDate.getFullYear();
            foundDates.add(`${day} ${month} ${year}`);
          }
        });
      }
    });

    return Array.from(foundDates);
  };

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

      // Extract text and find dates
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      
      const datesFound = extractDatesFromText(pageText);
      
      // Display dates found on page
      if (datesFound.length > 0) {
        context.save();
        context.font = `${12 * scale}px Arial`;
        context.fillStyle = 'rgba(255, 0, 0, 0.9)';
        context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        context.lineWidth = 3;
        
        const lineHeight = 20 * scale;
        const startY = 30 * scale;
        const padding = 10 * scale;
        
        datesFound.forEach((date, index) => {
          const yPos = startY + (index * lineHeight);
          
          // Draw white outline for readability
          context.strokeText(date, padding, yPos);
          // Draw red text
          context.fillText(date, padding, yPos);
        });
        
        context.restore();
      }

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

  const handleCanvasClick = () => {
    setShowEnlargedPage(true);
  };

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

  const handleAddCurrentPage = () => {
    if (onTogglePageSelection) {
      onTogglePageSelection(currentFileIndex, currentPage);
      const isSelected = selectedPagesForExtraction?.has(`${currentFileIndex}-${currentPage}`);
      toast.success(isSelected ? "Page removed from selection" : "Page added to selection");
    }
  };

  const handleDeleteCurrentPage = () => {
    if (onDeletePage) {
      onDeletePage(currentFileIndex, currentPage);
      toast.success("Page removed completely");
    }
  };

  const isCurrentPageSelected = selectedPagesForExtraction?.has(`${currentFileIndex}-${currentPage}`) || false;
  const pageKey = `${currentFileIndex}-${currentPage}`;
  const currentDiagnosis = pageDiagnoses[pageKey] || "";
  const [diagnosisInput, setDiagnosisInput] = useState(currentDiagnosis);
  const [isAISuggesting, setIsAISuggesting] = useState(false);
  const [isAutoScanning, setIsAutoScanning] = useState(false);
  const shouldStopScanRef = useRef(false);
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(numPages);
  const [selectedModel, setSelectedModel] = useState<string>("gemini-2.5-flash");

  // Sync input when diagnosis for current page changes
  useEffect(() => {
    console.log(`Syncing diagnosis for page ${currentPage}: "${currentDiagnosis}"`);
    setDiagnosisInput(currentDiagnosis);
  }, [currentDiagnosis, currentPage, currentFileIndex]);

  // Update endPage when numPages changes (switching files)
  useEffect(() => {
    setEndPage(numPages);
  }, [numPages]);

  // Wrap onDiagnosisChange to track file updates
  const handleSaveToDatabase = useCallback(async (fileIndex: number, pageNum: number, diagnosis: string) => {
    if (onDiagnosisChange) {
      await onDiagnosisChange(fileIndex, pageNum, diagnosis);
      // Update the last modified time for this file
      setFileLastModified(prev => ({
        ...prev,
        [fileIndex]: new Date()
      }));
    }
  }, [onDiagnosisChange]);

  // Extract top-of-page text from rendered PDF (best-effort)
  const extractDiagnosisFromPdf = useCallback(async (pageNum: number): Promise<string | null> => {
    try {
      if (!pdf) return null;
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const height = viewport.height;
      const textContent: any = await page.getTextContent();
      const items: any[] = textContent.items || [];
      // Widen search band to be robust
      const topBand = height * 0.7; // top 30%
      let topItems = items
        .map((it) => ({ str: (it.str as string) || '', x: it.transform?.[4] ?? 0, y: it.transform?.[5] ?? 0 }))
        .filter((it) => it.str.trim().length > 0 && it.y >= topBand);
      // Fallback: top 50%
      if (topItems.length === 0) {
        const band50 = height * 0.5;
        topItems = items
          .map((it) => ({ str: (it.str as string) || '', x: it.transform?.[4] ?? 0, y: it.transform?.[5] ?? 0 }))
          .filter((it) => it.str.trim().length > 0 && it.y >= band50);
      }
      if (topItems.length === 0) return null;
      topItems.sort((a, b) => (b.y - a.y) || (a.x - b.x));
      const lines: string[] = [];
      let currentY: number | null = null;
      let currentLine: string[] = [];
      for (const it of topItems) {
        if (currentY === null || Math.abs(it.y - currentY) <= 8) {
          currentY = currentY === null ? it.y : currentY;
          currentLine.push(it.str.trim());
        } else {
          lines.push(currentLine.join(' '));
          currentY = it.y;
          currentLine = [it.str.trim()];
        }
      }
      if (currentLine.length) lines.push(currentLine.join(' '));
      const text = lines.slice(0, 2).join(' ').replace(/\s{2,}/g, ' ').trim();
      return text || null;
    } catch (e) {
      console.error('extractDiagnosisFromPdf error:', e);
      return null;
    }
  }, [pdf]);

  const handleAISuggest = async () => {
    if (!canvasRef.current || !currentFile) {
      toast.error("Unable to capture page");
      return;
    }

    setIsAISuggesting(true);
    try {
      // Capture current page as image
      const pageImage = canvasRef.current.toDataURL('image/jpeg', 0.85);
      
      // Get extracted text for current page if available
      const fileContent = pdfContent.find(p => p.fileIndex === currentFileIndex);
      const pageText = fileContent?.pages.find(p => p.pageNum === currentPage)?.text || "";

      // Call edge function
      const { data, error } = await supabase.functions.invoke('suggest-diagnosis', {
        body: {
          pageImage,
          pageText,
          fileName: currentFile.name,
          pageNum: currentPage,
          model: selectedModel
        }
      });

      if (error) {
        console.error("AI suggestion error:", error);
        if (error.message?.includes('429')) {
          toast.error("Rate limits exceeded. Please try again later.");
        } else if (error.message?.includes('402')) {
          toast.error("Payment required. Please add funds to your workspace.");
        } else {
          toast.error("Failed to get AI suggestion");
        }
        return;
      }

      if (data?.diagnosis) {
        setDiagnosisInput(data.diagnosis);
        // Immediately save to database for persistence
        await handleSaveToDatabase(currentFileIndex, currentPage, data.diagnosis);
        
        // Refresh diagnoses from database to ensure they're loaded
        if (refreshDiagnoses) {
          await refreshDiagnoses();
        }
        
        toast.success("AI diagnosis saved!");
      } else {
        toast.error("No diagnosis suggestion received");
      }
    } catch (error) {
      console.error("Error suggesting diagnosis:", error);
      toast.error("Failed to suggest diagnosis");
    } finally {
      setIsAISuggesting(false);
    }
  };

  const handleAutoScanAll = async () => {
    if (!pdf || !currentFile || !onDiagnosisChange) {
      toast.error("Unable to scan pages");
      return;
    }

    // Validate page range
    const start = Math.max(1, Math.min(startPage, numPages));
    const end = Math.max(start, Math.min(endPage, numPages));
    
    if (start > end) {
      toast.error("Start page must be less than or equal to end page");
      return;
    }

    setIsAutoScanning(true);
    shouldStopScanRef.current = false;
    const totalPages = end - start + 1;
    let successCount = 0;
    const diagnosesToSave: { pageNum: number; diagnosis: string }[] = [];
    
    try {
      toast(`Starting AI scan from page ${start} to ${end} (${totalPages} pages)...`);

      for (let pageNum = start; pageNum <= end; pageNum++) {
        // Check if scan should stop before starting new page
        if (shouldStopScanRef.current) {
          toast.info(`Scan stopped after page ${pageNum - 1}. ${successCount} pages diagnosed.`);
          break;
        }

        try {
          // Show progress only if not stopping
          if (!shouldStopScanRef.current) {
            toast.info(`Scanning page ${pageNum}/${end}...`, { duration: 1000 });
          }
          
          // Render the page to canvas to get image
          const page = await pdf.getPage(pageNum);
          
          // Check again after async operation
          if (shouldStopScanRef.current) {
            toast.info(`Scan stopped after page ${pageNum - 1}. ${successCount} pages diagnosed.`);
            break;
          }
          
          const viewport = page.getViewport({ scale: 1.2 });
          
          // Create temporary canvas for this page
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = viewport.width;
          tempCanvas.height = viewport.height;
          const context = tempCanvas.getContext('2d');
          
          if (!context) continue;

          await page.render({
            canvasContext: context,
            viewport: viewport,
            canvas: tempCanvas,
          }).promise;

          // Check again after render
          if (shouldStopScanRef.current) {
            toast.info(`Scan stopped after page ${pageNum - 1}. ${successCount} pages diagnosed.`);
            break;
          }

          const pageImage = tempCanvas.toDataURL('image/jpeg', 0.85);
          
          // Get extracted text for this page if available
          const fileContent = pdfContent.find(p => p.fileIndex === currentFileIndex);
          const pageText = fileContent?.pages.find(p => p.pageNum === pageNum)?.text || "";

          // Call edge function with timeout protection
          const { data, error } = await Promise.race([
            supabase.functions.invoke('suggest-diagnosis', {
              body: {
                pageImage,
                pageText,
                fileName: currentFile.name,
                pageNum: pageNum,
                model: selectedModel
              }
            }),
            new Promise<{ data: null, error: Error }>((_, reject) => 
              setTimeout(() => reject(new Error('Request timeout')), 30000)
            )
          ]).catch(err => ({ data: null, error: err }));

          // Check after edge function call
          if (shouldStopScanRef.current) {
            toast.info(`Scan stopped after page ${pageNum}. ${successCount} pages diagnosed.`);
            break;
          }

          if (error) {
            console.error(`AI suggestion error for page ${pageNum}:`, error);
            if (!shouldStopScanRef.current) {
              toast.error(`Page ${pageNum} failed`, { duration: 2000 });
            }
            continue;
          }

          if (data?.diagnosis) {
            // Collect diagnosis to save at the end
            diagnosesToSave.push({ pageNum, diagnosis: data.diagnosis });
            successCount++;
            
            // Update textarea if this is the current page
            if (pageNum === currentPage) {
              setDiagnosisInput(data.diagnosis);
            }
            
            // Show success only if not stopping
            if (!shouldStopScanRef.current) {
              toast.success(`Diagnosis "${data.diagnosis}" found for page ${pageNum}`, { duration: 2000 });
            }
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (pageError) {
          console.error(`Error processing page ${pageNum}:`, pageError);
          if (!shouldStopScanRef.current) {
            toast.error(`Error on page ${pageNum}`, { duration: 2000 });
          }
          // Continue with next page instead of failing entire scan
        }
      }

      // Save all diagnoses to database at once
      if (diagnosesToSave.length > 0 && !shouldStopScanRef.current) {
        toast.info("Saving all diagnoses to database...");
        for (const { pageNum, diagnosis } of diagnosesToSave) {
          try {
            await handleSaveToDatabase(currentFileIndex, pageNum, diagnosis);
            
            // If this is the current page, update the textarea immediately
            if (pageNum === currentPage) {
              setDiagnosisInput(diagnosis);
            }
          } catch (saveError) {
            console.error(`Failed to save diagnosis for page ${pageNum}:`, saveError);
          }
        }
        
        // Refresh diagnoses from database to ensure they're loaded
        if (refreshDiagnoses) {
          try {
            await refreshDiagnoses();
          } catch (refreshError) {
            console.error('Failed to refresh diagnoses:', refreshError);
          }
        }
      }

      if (!shouldStopScanRef.current) {
        toast.success(`Auto-scan complete! ${successCount}/${totalPages} pages diagnosed and saved to database.`);
      }
    } catch (error) {
      console.error("Fatal error in auto-scan:", error);
      if (!shouldStopScanRef.current) {
        toast.error("Auto-scan failed - please try again");
      }
    } finally {
      // Always clean up state, even if there was an error
      setIsAutoScanning(false);
      shouldStopScanRef.current = false;
    }
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
    <div className="relative bg-pdf-background flex flex-col h-full">
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
          {onTogglePageSelection && (
            <div className="flex items-center gap-1 ml-2">
              <Button
                variant={isCurrentPageSelected ? "default" : "outline"}
                size="sm"
                onClick={handleAddCurrentPage}
              >
                {isCurrentPageSelected ? "✓ Added" : "+ Add Page"}
              </Button>
              {onDeletePage && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteCurrentPage}
                  title="Remove this page from matches and selections"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}
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

      {/* Diagnosis Input - Above PDF */}
      {onDiagnosisChange && (
        <div className="border-b bg-toolbar-background p-4">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="diagnosis-input" className="text-sm font-medium">
              Diagnosis for Page {currentPage}:
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">AI Model:</span>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                  <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                  <SelectItem value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</SelectItem>
                  <SelectItem value="gpt-5">GPT-5</SelectItem>
                  <SelectItem value="gpt-5-mini">GPT-5 Mini</SelectItem>
                  <SelectItem value="gpt-5-nano">GPT-5 Nano</SelectItem>
                  <SelectItem value="claude">Claude Sonnet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={async () => {
                const pageKey = `${currentFileIndex}-${currentPage}`;
                const stateDiagnosis = pageDiagnoses[pageKey] || "";
                if (stateDiagnosis) {
                  setDiagnosisInput(stateDiagnosis);
                  toast.success(`Loaded diagnosis from state`);
                  return;
                }
                const extracted = await extractDiagnosisFromPdf(currentPage);
                if (extracted) {
                  setDiagnosisInput(extracted);
                  // Also propagate so tracker sees it
                  await handleSaveToDatabase(currentFileIndex, currentPage, extracted);
                  toast.success("Loaded diagnosis from PDF");
                } else {
                  toast.info("No diagnosis found on this page");
                }
              }}
              size="sm"
              variant="outline"
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Load From PDF
            </Button>
          </div>
          <div className="flex gap-2 mb-2">
            <textarea
              id="diagnosis-input"
              value={diagnosisInput}
              onChange={(e) => setDiagnosisInput(e.target.value)}
              placeholder="Enter diagnosis..."
              rows={3}
              className="flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-background resize-y"
            />
            <Button
              onClick={handleAISuggest}
              disabled={isAISuggesting || isAutoScanning}
              size="default"
              variant="secondary"
              className="gap-2"
            >
              {isAISuggesting ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  AI Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  AI Suggest
                </>
              )}
            </Button>
            <Button
              onClick={() => handleSaveToDatabase(currentFileIndex, currentPage, diagnosisInput)}
              disabled={diagnosisInput === currentDiagnosis}
              size="default"
              className="gap-2"
            >
              <Save className="w-4 h-4" />
              Save
            </Button>
          </div>
          
          {/* Display current diagnosis from database */}
          {currentDiagnosis && (
            <div className="mb-2 p-3 bg-muted/50 rounded-md border">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Saved Diagnosis for Page {currentPage}:
              </p>
              <p className="text-sm">{currentDiagnosis}</p>
            </div>
          )}
          <div className="mt-2">
            <Button
              onClick={() => handleSaveToDatabase(currentFileIndex, currentPage, diagnosisInput)}
              disabled={diagnosisInput === currentDiagnosis}
              size="sm"
              className="gap-2 w-full"
            >
              <Save className="w-4 h-4" />
              Save to Database
            </Button>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handleAutoScanAll}
                disabled={isAutoScanning || isAISuggesting}
                size="sm"
                variant="outline"
                className="gap-2 w-full"
              >
                {isAutoScanning ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Auto-scanning...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    AI Auto-Scan
                  </>
                )}
              </Button>
              
              <Button
                onClick={async () => {
                  if (!pdf) return toast.error("PDF not loaded");
                  let updated = 0;
                  for (let page = 1; page <= numPages; page++) {
                    const extracted = await extractDiagnosisFromPdf(page);
                    if (extracted) {
                      await handleSaveToDatabase(currentFileIndex, page, extracted);
                      if (page === currentPage) setDiagnosisInput(extracted);
                      updated++;
                    }
                  }
                  if (updated > 0) {
                    toast.success(`Loaded diagnoses from PDF for ${updated} page(s)`);
                  } else {
                    toast.info("No diagnosis text found in top area on any page");
                  }
                }}
                size="sm"
                variant="outline"
                className="gap-2 w-full"
              >
                <RefreshCw className="w-4 h-4" />
                Load All From PDF
              </Button>
            </div>
            
            {/* Page range inputs */}
            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Start Page</label>
                <input
                  type="number"
                  min={1}
                  max={numPages}
                  value={startPage}
                  onChange={(e) => setStartPage(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={isAutoScanning}
                  className="w-full px-2 py-1 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">End Page</label>
                <input
                  type="number"
                  min={1}
                  max={numPages}
                  value={endPage}
                  onChange={(e) => setEndPage(Math.max(1, parseInt(e.target.value) || numPages))}
                  disabled={isAutoScanning}
                  className="w-full px-2 py-1 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                />
              </div>
            </div>
            
            {isAutoScanning && (
              <Button
                onClick={() => {
                  shouldStopScanRef.current = true;
                  toast.info("Stopping scan after current page finishes...");
                }}
                size="sm"
                variant="destructive"
                className="gap-2 w-full"
              >
                Stop Scan
              </Button>
            )}
          </div>
          
          {/* File Status Info */}
          {currentFile && (
            <div className="mt-3 pt-3 border-t space-y-1">
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Current file:</span>{" "}
                <span className="break-all">
                  {currentFile.name}
                  {fileLastModified[currentFileIndex] && (
                    <>
                      {" "}
                      <span className="text-muted-foreground/70">
                        ({format(fileLastModified[currentFileIndex], 'yyyy-MM-dd HH:mm:ss')})
                      </span>
                    </>
                  )}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Last modified:</span>{" "}
                {new Date(currentFile.lastModified).toLocaleString()}
              </div>
              {fileLastModified[currentFileIndex] && (
                <div className="text-xs text-green-600 font-medium">
                  Last updated {formatDistanceToNow(fileLastModified[currentFileIndex], { addSuffix: true })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* PDF Canvas */}
      <div
        ref={containerRef}
        className="flex-1 flex justify-center p-6 overflow-auto relative"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-sm text-muted-foreground">Loading PDF...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Left Navigation Arrow */}
            <Button
              onClick={prevPage}
              disabled={currentPage === 1}
              variant="outline"
              size="icon"
              className="absolute left-8 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full shadow-lg"
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>
            
            <canvas
              ref={canvasRef}
              className="shadow-medium border cursor-pointer hover:shadow-lg transition-shadow"
              style={{
                maxWidth: "100%",
                height: "auto",
              }}
              onClick={handleCanvasClick}
            />
            
            {/* Right Navigation Arrow */}
            <Button
              onClick={nextPage}
              disabled={currentPage === numPages}
              variant="outline"
              size="icon"
              className="absolute right-8 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full shadow-lg"
            >
              <ChevronRight className="w-6 h-6" />
            </Button>
          </>
        )}
      </div>

      {currentFile && (
        <PDFPageDialog
          open={showEnlargedPage}
          onOpenChange={setShowEnlargedPage}
          pdfDocument={pdf}
          pageNumber={currentPage}
          title={`${currentFile.name} - Page ${currentPage}`}
        />
      )}

      {matchingPages.size > 0 && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-lg shadow-medium text-sm">
          Page {currentPage} {matchingPages.has(currentPage) ? '✓ Contains keywords' : ''}
        </div>
      )}
    </div>
  );
};