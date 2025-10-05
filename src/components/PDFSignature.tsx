import { useState, useRef, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { FileUpload } from "./FileUpload";
import { PDFViewer } from "./PDFViewer";
import { AISearchAssistant } from "./AISearchAssistant";
import { DiagnosticAssessment } from "./DiagnosticAssessment";
import { DIASettings } from "./DIASettings";
import { FileText, Download, Upload, Search, CheckCircle2, Clock } from "lucide-react";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import dvaLogo from "@/assets/dva-logo.png";

// Default global categories (used when backend is unavailable)
const DEFAULT_CATEGORIES: Array<{ id: number; label: string }> = [
  { id: 1, label: 'Lumbar' },
  { id: 2, label: 'Thoracic' },
  { id: 3, label: 'Right Hip' },
  { id: 4, label: 'Left Hip' },
  { id: 5, label: 'Right Knee' },
  { id: 6, label: 'Left Knee' },
  { id: 7, label: 'Shins' },
  { id: 8, label: 'Right Ankle' },
  { id: 9, label: 'Left Ankle' },
  { id: 10, label: 'Right Foot' },
  { id: 11, label: 'Left Foot' },
  { id: 12, label: 'Cervical' },
  { id: 13, label: 'Right Shoulder' },
  { id: 14, label: 'Left Shoulder' },
  { id: 15, label: 'Right Elbow' },
  { id: 16, label: 'Left Elbow' },
  { id: 17, label: 'Right Wrist' },
  { id: 18, label: 'Left Wrist' },
  { id: 19, label: 'Right Hand' },
  { id: 20, label: 'Left Hand' },
  { id: 21, label: 'Strain and Sprain' },
  { id: 22, label: 'Osteoarthritis' },
  { id: 23, label: 'Labral Tear' },
  { id: 24, label: 'Fracture' },
  { id: 25, label: 'Tendinopathy' },
  { id: 26, label: 'Iliotibial Band Syndrome' },
  { id: 27, label: 'Trochanteric Bursitis' },
  { id: 28, label: 'Chondromalacia Patella' },
  { id: 29, label: 'Gluteal Tendinopathy' },
  { id: 30, label: 'Epicondylitis' },
  { id: 31, label: 'Ganglion' },
];

// IDs 1-20 are body parts, 21-31 are conditions
const BODY_PART_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const CONDITION_IDS = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31];

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

export const PDFSignature = () => {
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [currentPdfIndex, setCurrentPdfIndex] = useState<number>(0);
  const [keywords, setKeywords] = useState<string>("");
  const [suggestedKeywords, setSuggestedKeywords] = useState<string>("");
  const [pdfContent, setPdfContent] = useState<PDFContent[]>([]);
  const [searchCategories, setSearchCategories] = useState<Array<{
    id: number;
    label: string;
    terms: string;
    checked: boolean;
  }>>(
    DEFAULT_CATEGORIES.map((c) => ({ ...c, terms: '', checked: false }))
  );
  const [matchingPages, setMatchingPages] = useState<Set<number>>(new Set());
  const [selectedPagesForExtraction, setSelectedPagesForExtraction] = useState<Set<string>>(new Set());
  const [keywordMatches, setKeywordMatches] = useState<KeywordMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [autoNavigate, setAutoNavigate] = useState(true);
  const [ocrProgress, setOcrProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const [ocrCompletedFiles, setOcrCompletedFiles] = useState<Set<number>>(new Set());
  const [scanningFiles, setScanningFiles] = useState<Set<number>>(new Set());
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentPdf = pdfFiles[currentPdfIndex] || null;

  useEffect(() => {
    const fetchCategories = async () => {
      const url = (import.meta.env.VITE_SUPABASE_URL as string) || "https://hpclzzykgxolszduecqa.supabase.co";
      const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwY2x6enlrZ3hvbHN6ZHVlY3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MTI4NzgsImV4cCI6MjA3NTA4ODg3OH0.FjuWjLB2XDzSytypFd8tLTrE8F2fhrdTXUlDmphKbnI";

      try {
        const client = createClient(url, key, {
          auth: {
            persistSession: false,
          }
        });
        const { data, error } = await client
          .from('search_categories')
          .select('id, label, terms')
          .order('id');
        
        if (error) {
          console.error('Error fetching search categories:', error);
          toast.error('Failed to load search categories');
          setSearchCategories(
            DEFAULT_CATEGORIES.map((c) => ({ ...c, terms: '', checked: false }))
          );
          return;
        }
        
        setSearchCategories((data ?? []).map(cat => ({ ...cat, checked: false })));
      } catch (e) {
        console.error('Failed to fetch categories', e);
        setSearchCategories(
          DEFAULT_CATEGORIES.map((c) => ({ ...c, terms: '', checked: false }))
        );
      }
    };
    
    fetchCategories();
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    if (file.type !== "application/pdf") {
      toast("Please select a PDF file");
      return;
    }
    setPdfFiles(prev => [...prev, file]);
    setMatchingPages(new Set());
    setKeywordMatches([]);
    setSelectedPagesForExtraction(new Set());
    toast("PDF added successfully!");
  }, []);

  const handleMultipleFileSelect = useCallback((files: FileList) => {
    const pdfFilesArray = Array.from(files).filter(file => file.type === "application/pdf");
    if (pdfFilesArray.length === 0) {
      toast("No valid PDF files selected");
      return;
    }
    setPdfFiles(prev => [...prev, ...pdfFilesArray]);
    setMatchingPages(new Set());
    setKeywordMatches([]);
    setSelectedPagesForExtraction(new Set());
    toast(`${pdfFilesArray.length} PDF(s) added successfully!`);
  }, []);

  const handleKeywordMatchesDetected = useCallback((matches: KeywordMatch[]) => {
    const validMatches = matches.filter(m => 
      !isNaN(m.fileIndex) && 
      m.fileIndex >= 0 && 
      m.fileIndex < pdfFiles.length &&
      !isNaN(m.page) &&
      m.page > 0
    );
    
    // Add to existing matches instead of replacing
    setKeywordMatches(prev => [...prev, ...validMatches]);
    
    // Add pages to existing matching pages for current PDF
    setMatchingPages(prev => {
      const newPages = new Set(prev);
      validMatches
        .filter(m => m.fileIndex === currentPdfIndex)
        .forEach(m => newPages.add(m.page));
      return newPages;
    });
    
    // Add matching pages to existing selections
    setSelectedPagesForExtraction(prev => {
      const newSet = new Set(prev);
      validMatches.forEach(m => newSet.add(`${m.fileIndex}-${m.page}`));
      return newSet;
    });
    
    if (validMatches.length > 0) {
      const totalPages = new Set(validMatches.map(m => `${m.fileIndex}-${m.page}`)).size;
      toast(`Found keywords on ${totalPages} page(s) across ${new Set(validMatches.map(m => m.fileIndex)).size} PDF(s)!`);
    } else {
      toast("No matching keywords found");
    }
    setIsSearching(false);
  }, [currentPdfIndex, pdfFiles.length]);

  const handleSearch = useCallback(() => {
    if (!keywords.trim()) {
      toast("Please enter keywords to search");
      return;
    }
    setIsSearching(true);
    toast("Searching for keywords...");
  }, [keywords]);

  const handleDownload = useCallback(async () => {
    if (selectedPagesForExtraction.size === 0) {
      toast("No pages selected for extraction");
      return;
    }
    
    try {
      toast("Creating PDF with selected pages...");
      
      const newPdfDoc = await PDFDocument.create();
      
      const pagesByFile = new Map<number, number[]>();
      Array.from(selectedPagesForExtraction).forEach(key => {
        const [fileIndexStr, pageStr] = key.split('-');
        const fileIndex = parseInt(fileIndexStr);
        const page = parseInt(pageStr);
        
        if (!pagesByFile.has(fileIndex)) {
          pagesByFile.set(fileIndex, []);
        }
        pagesByFile.get(fileIndex)!.push(page);
      });
      
      const sortedFileIndices = Array.from(pagesByFile.keys()).sort((a, b) => a - b);
      
      for (const fileIndex of sortedFileIndices) {
        const pages = pagesByFile.get(fileIndex)!.sort((a, b) => a - b);
        const file = pdfFiles[fileIndex];
        
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        
        for (const pageNum of pages) {
          const [copiedPage] = await newPdfDoc.copyPages(pdfDoc, [pageNum - 1]);
          newPdfDoc.addPage(copiedPage);
        }
      }
      
      const pdfBytes = await newPdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `extracted-pages-${Date.now()}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      
      toast(`Downloaded PDF with ${selectedPagesForExtraction.size} page(s) from ${sortedFileIndices.length} document(s)!`);
    } catch (error) {
      console.error("Error creating PDF:", error);
      toast("Failed to create PDF");
    }
  }, [pdfFiles, selectedPagesForExtraction]);

  const handleRemovePdf = useCallback((index: number) => {
    setPdfFiles(prev => prev.filter((_, i) => i !== index));
    if (currentPdfIndex >= index && currentPdfIndex > 0) {
      setCurrentPdfIndex(prev => prev - 1);
    }
    setMatchingPages(new Set());
    setSelectedPagesForExtraction(new Set());
    setKeywordMatches([]);
    setOcrCompletedFiles(prev => {
      const newSet = new Set(prev);
      newSet.delete(index);
      // Re-index remaining files
      const reindexed = new Set<number>();
      Array.from(newSet).forEach(i => {
        if (i > index) reindexed.add(i - 1);
        else reindexed.add(i);
      });
      return reindexed;
    });
    toast("PDF removed");
  }, [currentPdfIndex]);

  const handleRemoveAllPdfs = useCallback(() => {
    setPdfFiles([]);
    setCurrentPdfIndex(0);
    setMatchingPages(new Set());
    setSelectedPagesForExtraction(new Set());
    setKeywordMatches([]);
    setKeywords("");
    setSuggestedKeywords("");
    setSearchCategories(prev => prev.map(cat => ({ ...cat, checked: false })));
    setOcrCompletedFiles(new Set());
    toast("All PDFs removed");
  }, []);

  const handleKeywordSuggest = useCallback((suggested: string) => {
    setSuggestedKeywords(suggested);
  }, []);

  const useSuggestedKeywords = useCallback(() => {
    setKeywords(suggestedKeywords);
    toast("Keywords applied - click Search to find matches!");
  }, [suggestedKeywords]);

  const triggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handlePageClick = useCallback((pageNum: number, fileIndex: number) => {
    if (!isNaN(fileIndex) && fileIndex >= 0 && fileIndex < pdfFiles.length) {
      if (fileIndex !== currentPdfIndex) {
        // Switch to new file first
        setCurrentPdfIndex(fileIndex);
        const newMatches = keywordMatches.filter(m => m.fileIndex === fileIndex);
        const pages = new Set(newMatches.map(m => m.page));
        setMatchingPages(pages);
        
        // Set page for the new file
        if (autoNavigate) {
          setSelectedPage(pageNum);
        }
      } else {
        // Same file, just navigate to page
        if (autoNavigate) {
          setSelectedPage(pageNum);
        }
      }
    }
  }, [autoNavigate, currentPdfIndex, pdfFiles.length, keywordMatches]);

  const togglePageSelection = useCallback((pageNum: number, fileIndex: number) => {
    setSelectedPagesForExtraction(prev => {
      const newSet = new Set(prev);
      const key = `${fileIndex}-${pageNum}`;
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  }, []);

  const selectAllPages = useCallback(() => {
    const allMatchingPages = new Set(keywordMatches.map(m => `${m.fileIndex}-${m.page}`));
    setSelectedPagesForExtraction(allMatchingPages);
  }, [keywordMatches]);

  const deselectAllPages = useCallback(() => {
    setSelectedPagesForExtraction(new Set());
  }, []);

  const handleCategoryCheckbox = useCallback((categoryId: number, checked: boolean) => {
    setSearchCategories(prev => 
      prev.map(cat => 
        cat.id === categoryId ? { ...cat, checked } : cat
      )
    );
    
    if (checked) {
      const category = searchCategories.find(cat => cat.id === categoryId);
      if (category?.terms.trim()) {
        setKeywords(prev => {
          const existing = prev.split(',').map(k => k.trim()).filter(k => k);
          const newTerms = category.terms.split(',').map(t => t.trim()).filter(t => t);
          const combined = [...new Set([...existing, ...newTerms])];
          return combined.join(', ');
        });
      }
    } else {
      const category = searchCategories.find(cat => cat.id === categoryId);
      if (category?.terms.trim()) {
        setKeywords(prev => {
          const existing = prev.split(',').map(k => k.trim()).filter(k => k);
          const termsToRemove = category.terms.split(',').map(t => t.trim());
          const filtered = existing.filter(k => !termsToRemove.includes(k));
          return filtered.join(', ');
        });
      }
    }
  }, [searchCategories]);

  const updateCategoryTerms = useCallback((categoryId: number, terms: string) => {
    setSearchCategories(prev => 
      prev.map(cat => 
        cat.id === categoryId ? { ...cat, terms } : cat
      )
    );
  }, []);

  const saveCategoryTerms = useCallback(async (categoryId: number) => {
    const category = searchCategories.find(cat => cat.id === categoryId);
    if (!category) return;

    try {
      const url = (import.meta.env.VITE_SUPABASE_URL as string) || "https://hpclzzykgxolszduecqa.supabase.co";
      const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwY2x6enlrZ3hvbHN6ZHVlY3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MTI4NzgsImV4cCI6MjA3NTA4ODg3OH0.FjuWjLB2XDzSytypFd8tLTrE8F2fhrdTXUlDmphKbnI";

      const client = createClient(url, key, { auth: { persistSession: false } });
      const { error } = await client
        .from('search_categories')
        .update({ terms: category.terms })
        .eq('id', categoryId);

      if (error) {
        console.error('Error updating search category:', error);
        toast.error('Failed to save keywords');
      } else {
        toast.success('Keywords saved successfully');
      }
    } catch (e) {
      console.error('Failed to update category', e);
      toast.error('Failed to save keywords');
    }
  }, [searchCategories]);

  const handleAIPageSelection = useCallback((pages: Array<{ fileIndex: number; pageNum: number; reason?: string }>) => {
    // Create keyword matches for display in the Matches Found panel
    const matches: KeywordMatch[] = pages.map(p => ({
      page: p.pageNum,
      keyword: p.reason || "AI Selected",
      count: 1,
      fileName: pdfFiles[p.fileIndex]?.name || `Document ${p.fileIndex + 1}`,
      fileIndex: p.fileIndex
    }));
    
    // Add to existing matches instead of replacing
    setKeywordMatches(prev => [...prev, ...matches]);
    
    // Add matching pages for current PDF
    setMatchingPages(prev => {
      const newPages = new Set(prev);
      matches
        .filter(m => m.fileIndex === currentPdfIndex)
        .forEach(m => newPages.add(m.page));
      return newPages;
    });
    
    // Add AI-selected pages to existing selections
    setSelectedPagesForExtraction(prev => {
      const newSet = new Set(prev);
      pages.forEach(p => newSet.add(`${p.fileIndex}-${p.pageNum}`));
      return newSet;
    });
  }, [pdfFiles, currentPdfIndex]);

  const handlePDFTextExtracted = useCallback((fileIndex: number, fileName: string, pageTexts: Array<{ pageNum: number; text: string }>) => {
    setPdfContent(prev => {
      const existing = prev.filter(p => p.fileIndex !== fileIndex);
      return [...existing, { fileName, fileIndex, pages: pageTexts }];
    });
    
    // Mark this file as OCR complete
    setOcrCompletedFiles(prev => new Set(prev).add(fileIndex));
  }, []);

  const handleOCRProgress = useCallback((current: number, total: number, message: string) => {
    setOcrProgress({ current, total, message });
    
    // Clear progress when complete
    if (current >= total) {
      setTimeout(() => setOcrProgress(null), 2000);
    }
  }, []);

  const handleScanFile = useCallback(async (fileIndex: number) => {
    if (fileIndex < 0 || fileIndex >= pdfFiles.length) return;
    if (ocrCompletedFiles.has(fileIndex)) {
      toast("This file has already been scanned");
      return;
    }

    const file = pdfFiles[fileIndex];
    setScanningFiles(prev => new Set(prev).add(fileIndex));
    
    try {
      const { createWorker } = await import("tesseract.js");
      const pdfjsLib = await import("pdfjs-dist");
      
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const totalPages = pdfDoc.numPages;
      
      setOcrProgress({ current: 0, total: totalPages, message: `Scanning ${file.name}...` });
      
      const worker = await createWorker('eng');
      const pageTexts: Array<{ pageNum: number; text: string }> = [];

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        setOcrProgress({
          current: pageNum,
          total: totalPages,
          message: `Scanning ${file.name} - page ${pageNum}/${totalPages}...`
        });
        
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

      await worker.terminate();
      handlePDFTextExtracted(fileIndex, file.name, pageTexts);
      
      setOcrProgress(null);
      toast.success(`Scan complete for ${file.name}`);
    } catch (error) {
      console.error("Error scanning PDF:", error);
      toast.error("Scan failed");
      setOcrProgress(null);
    } finally {
      setScanningFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(fileIndex);
        return newSet;
      });
    }
  }, [pdfFiles, ocrCompletedFiles, handlePDFTextExtracted]);

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="border-b bg-card shadow-soft">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src={dvaLogo} 
                alt="DVA Logo" 
                className="w-12 h-12 object-contain"
              />
              <div>
                <h1 className="text-xl font-semibold text-foreground">DVA Screenshotter</h1>
                <p className="text-sm text-muted-foreground">Extract pages by keywords with AI</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  🔒 All data stays in your browser - nothing stored or transmitted
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <DIASettings />
              {pdfFiles.length === 0 ? (
                <Button onClick={triggerFileUpload} className="gap-2">
                  <Upload className="w-4 h-4" />
                  Upload PDF(s)
                </Button>
              ) : (
                <>
                  <Button 
                    variant="outline" 
                    onClick={triggerFileUpload}
                    className="gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Add More PDFs
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleRemoveAllPdfs}
                    className="gap-2"
                  >
                    Remove All
                  </Button>
                  <Button 
                    onClick={handleDownload}
                    disabled={selectedPagesForExtraction.size === 0}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download {selectedPagesForExtraction.size > 0 ? `(${selectedPagesForExtraction.size})` : 'Extracted Pages'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Veterans Health Centre Banner */}
      <div className="bg-primary/10 border-b border-primary/20">
        <div className="container mx-auto px-4 py-3">
          <div className="text-center space-y-1">
            <p className="text-sm text-muted-foreground">Brought to you by</p>
            <p className="text-base font-semibold text-foreground">Veterans Health Centre</p>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
              <a href="https://vhc.org.au" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                vhc.org.au
              </a>
              <a href="tel:1300838372" className="text-primary hover:underline">
                1300 VETERAN
              </a>
              <a href="mailto:reception@vhc.org.au" className="text-primary hover:underline">
                reception@vhc.org.au
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* OCR Progress Bar */}
      {ocrProgress && (
        <div className="bg-card border-b shadow-soft">
          <div className="container mx-auto px-4 py-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{ocrProgress.message}</span>
                <span className="text-muted-foreground font-medium">
                  {Math.round((ocrProgress.current / ocrProgress.total) * 100)}%
                </span>
              </div>
              <Progress value={(ocrProgress.current / ocrProgress.total) * 100} className="h-2" />
            </div>
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 py-6">
        {pdfFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-6">
              <Card className="p-6 max-w-2xl bg-accent/20 border-accent">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-accent/30 flex items-center justify-center">
                    🔒
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">Your Privacy is Protected</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      All PDF processing happens entirely in your browser. Your documents are never uploaded to any server, 
                      and no data is stored or transmitted. When you close this tab, everything is automatically cleared from memory. 
                      Your sensitive documents remain completely private and secure on your device.
                    </p>
                  </div>
                </div>
              </Card>
              <FileUpload onFileSelect={handleFileSelect} />
            </div>
          ) : (
            <>
              {/* PDF File Selector */}
              {pdfFiles.length > 1 && (
                <Card className="p-4 shadow-medium mb-4">
                  <Label className="text-sm font-medium mb-2 block">Select PDF to View</Label>
                  <div className="flex flex-wrap gap-2">
                    {pdfFiles.map((file, index) => {
                      const isComplete = ocrCompletedFiles.has(index);
                      const isScanning = scanningFiles.has(index);
                      return (
                        <div key={index} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Button
                              variant={currentPdfIndex === index ? "default" : "outline"}
                              onClick={() => {
                                setCurrentPdfIndex(index);
                                setMatchingPages(new Set());
                                setKeywordMatches([]);
                                setSelectedPagesForExtraction(new Set());
                                setSelectedPage(null);
                              }}
                              className="gap-2 relative flex-1"
                              size="sm"
                            >
                              <FileText className="w-4 h-4" />
                              <span className="truncate">{file.name || `PDF ${index + 1}`}</span>
                              {isComplete && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 ml-1" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemovePdf(index)}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            >
                              ×
                            </Button>
                          </div>
                          {!isComplete && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleScanFile(index)}
                              disabled={isScanning}
                              className="w-full text-xs"
                            >
                              {isScanning ? (
                                <>
                                  <Clock className="w-3 h-3 mr-1 animate-spin" />
                                  Scanning...
                                </>
                              ) : (
                                <>Scan & OCR</>
                              )}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* 3-Panel Layout: Search Controls | PDF Viewer | Matches */}
              <ResizablePanelGroup direction="horizontal" className="min-h-[calc(100vh-300px)] rounded-lg border">
                {/* Left Panel: AI Assistant & Search Categories in Tabs */}
                <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
                  <Card className="h-full rounded-none border-0">
                    <Tabs defaultValue="ai" className="h-full flex flex-col">
                      <TabsList className="w-full rounded-none border-b grid grid-cols-3">
                        <TabsTrigger value="ai">AI Assistant</TabsTrigger>
                        <TabsTrigger value="categories">Search Categories</TabsTrigger>
                        <TabsTrigger value="assessment">Diagnostic Assessment</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="ai" className="flex-1 mt-0 p-4 overflow-auto">
                        <AISearchAssistant 
                          onKeywordSuggest={handleKeywordSuggest}
                          onPagesSelected={handleAIPageSelection}
                          currentKeywords={keywords}
                          pdfContent={pdfContent}
                        />
                      </TabsContent>
                      
                      <TabsContent value="assessment" className="flex-1 mt-0 overflow-auto">
                        <DiagnosticAssessment 
                          pdfContent={pdfContent}
                          selectedPages={selectedPagesForExtraction}
                        />
                      </TabsContent>
                      
                      <TabsContent value="categories" className="flex-1 mt-0 p-4 overflow-auto">
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 gap-6">
                            {/* Body Parts */}
                            <div>
                              <h3 className="text-sm font-semibold mb-3 text-primary">Body Regions</h3>
                              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                                {searchCategories.filter(cat => BODY_PART_IDS.includes(cat.id)).map((category) => (
                                  <div key={category.id} className="flex items-start gap-3">
                                    <input
                                      type="checkbox"
                                      id={`category-${category.id}`}
                                      checked={category.checked}
                                      onChange={(e) => handleCategoryCheckbox(category.id, e.target.checked)}
                                      className="mt-1 w-4 h-4 cursor-pointer"
                                    />
                                    <div className="flex-1 space-y-2">
                                      <Label 
                                        htmlFor={`category-${category.id}`} 
                                        className="text-sm font-medium cursor-pointer"
                                      >
                                        {category.label}
                                      </Label>
                                      <div className="flex gap-2">
                                        <Input
                                          placeholder="Keywords"
                                          value={category.terms}
                                          onChange={(e) => updateCategoryTerms(category.id, e.target.value)}
                                          className="text-sm"
                                        />
                                        <Button
                                          size="sm"
                                          onClick={() => saveCategoryTerms(category.id)}
                                          className="whitespace-nowrap"
                                        >
                                          Save
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Conditions */}
                            <div>
                              <h3 className="text-sm font-semibold mb-3 text-primary">Conditions</h3>
                              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                                {searchCategories.filter(cat => CONDITION_IDS.includes(cat.id)).map((category) => (
                                  <div key={category.id} className="flex items-start gap-3">
                                    <input
                                      type="checkbox"
                                      id={`category-${category.id}`}
                                      checked={category.checked}
                                      onChange={(e) => handleCategoryCheckbox(category.id, e.target.checked)}
                                      className="mt-1 w-4 h-4 cursor-pointer"
                                    />
                                    <div className="flex-1 space-y-2">
                                      <Label 
                                        htmlFor={`category-${category.id}`} 
                                        className="text-sm font-medium cursor-pointer"
                                      >
                                        {category.label}
                                      </Label>
                                      <div className="flex gap-2">
                                        <Input
                                          placeholder="Keywords"
                                          value={category.terms}
                                          onChange={(e) => updateCategoryTerms(category.id, e.target.value)}
                                          className="text-sm"
                                        />
                                        <Button
                                          size="sm"
                                          onClick={() => saveCategoryTerms(category.id)}
                                          className="whitespace-nowrap"
                                        >
                                          Save
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Main Search Input */}
                          <div className="pt-4 border-t">
                            <Label htmlFor="keywords" className="text-sm font-medium mb-2 block">
                              Search Keywords
                            </Label>
                            <Input
                              id="keywords"
                              placeholder="e.g., contract, invoice, report"
                              value={keywords}
                              onChange={(e) => setKeywords(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                              className="mb-2"
                            />
                            
                            <div className="flex gap-2">
                              {suggestedKeywords && (
                                <Button 
                                  onClick={useSuggestedKeywords}
                                  variant="outline"
                                  className="gap-2"
                                  size="sm"
                                >
                                  Use Keywords
                                </Button>
                              )}
                              
                              <Button 
                                onClick={handleSearch} 
                                className="gap-2"
                                disabled={isSearching || !keywords.trim() || pdfFiles.length === 0}
                              >
                                <Search className="w-4 h-4" />
                                {isSearching ? "Searching..." : "Search"}
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              Separate multiple keywords with commas
                            </p>
                          </div>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </Card>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Middle Panel: PDF Viewer */}
                <ResizablePanel defaultSize={50} minSize={30}>
                  <Card className="h-full rounded-none border-0 overflow-hidden">
                    <PDFViewer
                      files={pdfFiles}
                      currentFileIndex={currentPdfIndex}
                      keywords={keywords}
                      dateSearch=""
                      matchingPages={matchingPages}
                      isSearching={isSearching}
                      onKeywordMatchesDetected={handleKeywordMatchesDetected}
                      onTextExtracted={handlePDFTextExtracted}
                      onOCRProgress={handleOCRProgress}
                      selectedPage={selectedPage}
                      onPageChange={setSelectedPage}
                      triggerScan={handleScanFile}
                    />
                  </Card>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Right Panel: Matches Found */}
                <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
                  <Card className="h-full rounded-none border-0 p-4 flex flex-col">
                    {keywordMatches.length > 0 ? (
                      <>
                        <div className="space-y-2 mb-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold">
                              Matches Found ({selectedPagesForExtraction.size})
                            </h3>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={selectAllPages}
                              className="h-7 text-xs"
                            >
                              Select All
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={deselectAllPages}
                              className="h-7 text-xs"
                            >
                              Clear
                            </Button>
                            <label className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={autoNavigate}
                                onChange={(e) => setAutoNavigate(e.target.checked)}
                                className="w-3 h-3"
                              />
                              Auto-nav
                            </label>
                          </div>
                        </div>
                        <ScrollArea className="flex-1">
                          <div className="space-y-3 pr-4">
                            {Array.from(new Set(keywordMatches.map(m => m.fileIndex)))
                              .filter(idx => !isNaN(idx) && idx >= 0)
                              .sort((a, b) => a - b)
                              .map((fileIndex) => {
                                const fileMatches = keywordMatches.filter(m => m.fileIndex === fileIndex);
                                const fileName = pdfFiles[fileIndex]?.name || fileMatches[0]?.fileName || `Document ${fileIndex + 1}`;
                                const pages = Array.from(new Set(fileMatches.map(m => m.page))).sort((a, b) => a - b);
                                
                                return (
                                  <div key={fileIndex} className="space-y-1">
                                    <div className="text-xs font-semibold text-primary sticky top-0 bg-card py-1">
                                      📄 {fileName}
                                    </div>
                                    {pages.map((page) => {
                                      const pageMatches = fileMatches.filter(m => m.page === page);
                                      const selectionKey = `${fileIndex}-${page}`;
                                      const isSelected = selectedPagesForExtraction.has(selectionKey);
                                      const isCurrent = selectedPage === page && fileIndex === currentPdfIndex;
                                      
                                      return (
                                        <div 
                                          key={`${fileIndex}-${page}`}
                                          className={`text-xs p-2 bg-muted rounded flex items-start gap-2 ${
                                            isCurrent ? 'ring-2 ring-primary' : ''
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => togglePageSelection(page, fileIndex)}
                                            className="mt-0.5 w-4 h-4 cursor-pointer"
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                          <div 
                                            className="flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                                            onClick={() => handlePageClick(page, fileIndex)}
                                          >
                                            <div className="font-medium">Page {page}</div>
                                            {pageMatches.map((match, idx) => (
                                              <div key={idx} className="text-muted-foreground">
                                                "{match.keyword}" ({match.count}x)
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })}
                          </div>
                        </ScrollArea>
                      </>
                    ) : (
                      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                        No matches yet. Use AI or search to find pages.
                      </div>
                    )}
                  </Card>
                </ResizablePanel>
              </ResizablePanelGroup>
            </>
          )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
              handleMultipleFileSelect(files);
            }
          }}
          className="hidden"
        />
      </main>
    </div>
  );
};
