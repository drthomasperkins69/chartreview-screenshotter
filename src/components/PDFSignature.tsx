import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileUpload } from "./FileUpload";
import { PDFViewer } from "./PDFViewer";
import { AISearchAssistant } from "./AISearchAssistant";
import { PDFPageDialog } from "./PDFPageDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FileText, Download, Upload, Search, CheckCircle2, Clock, Sparkles, Trash2, FileArchive, ChevronDown, ChevronRight, Loader2, FileEdit, ZoomIn } from "lucide-react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { uploadPdfToStorage } from "@/utils/supabaseStorage";
import dvaLogo from "@/assets/dva-logo.png";
import { Textarea } from "./ui/textarea";
import JSZip from "jszip";

import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import mammoth from "mammoth";

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

export const PDFSignature = ({ selectedFile }: { selectedFile?: { id: string; path: string; name: string } | null }) => {
  const { user } = useAuth();
  const { selectedWorkspace, refreshFiles } = useWorkspace();
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  
  // Load selected file from storage
  useEffect(() => {
    const loadFileFromStorage = async () => {
      if (!selectedFile) return;
      
      try {
        const { data, error } = await supabase.storage
          .from('pdf-files')
          .download(selectedFile.path);
        
        if (error) throw error;
        
        const file = new File([data], selectedFile.name, { type: 'application/pdf' });
        setPdfFiles([file]);
      } catch (error) {
        console.error('Error loading file:', error);
        toast.error('Failed to load file');
      }
    };
    
    loadFileFromStorage();
  }, [selectedFile]);
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
  const [pageDiagnoses, setPageDiagnoses] = useState<Record<string, string>>({});
  const [isAutoScanningAll, setIsAutoScanningAll] = useState(false);
  const [editingDiagnosis, setEditingDiagnosis] = useState<string | null>(null);
  const [editDiagnosisValue, setEditDiagnosisValue] = useState<string>("");
  const [generatingForm, setGeneratingForm] = useState<string | null>(null);
  const [diagnosisForms, setDiagnosisForms] = useState<Record<string, {
    medicalDiagnosis: string;
    basisForDiagnosis: string;
    relatedConditions: string;
    dateOfOnset: string;
    firstConsultation: string;
  }>>({});
  const [enlargedPageDialog, setEnlargedPageDialog] = useState<{
    open: boolean;
    fileIndex: number;
    pageNum: number;
  }>({ open: false, fileIndex: 0, pageNum: 1 });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfFilesRef = useRef<File[]>(pdfFiles);
  useEffect(() => {
    pdfFilesRef.current = pdfFiles;
  }, [pdfFiles]);

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
      toast.error("Please select a PDF file");
      return;
    }
    setPdfFiles(prev => [...prev, file]);
    setMatchingPages(new Set());
    setKeywordMatches([]);
    setSelectedPagesForExtraction(new Set());
    toast.success("PDF added successfully!");
  }, []);

  const handleMultipleFileSelect = useCallback(async (files: FileList) => {
    const filesArray = Array.from(files);
    const processedFiles: File[] = [];
    
    toast.info(`Processing ${filesArray.length} file(s)...`);
    
    for (const file of filesArray) {
      try {
        let processedFile = file;
        
        // Convert HTML to PDF
        if (file.type === 'text/html' || file.name.match(/\.(html?|htm)$/i)) {
          toast.info(`Converting ${file.name} to PDF...`);
          const html = await file.text();
          const container = document.createElement('div');
          container.innerHTML = html;
          container.style.position = 'absolute';
          container.style.left = '-9999px';
          container.style.width = '800px';
          document.body.appendChild(container);
          
          try {
            const canvas = await html2canvas(container, { scale: 2, useCORS: true, logging: false });
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width, canvas.height] });
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
            const pdfBlob = pdf.output('blob');
            processedFile = new File([pdfBlob], file.name.replace(/\.(html?|htm)$/i, '.pdf'), { type: 'application/pdf' });
          } finally {
            document.body.removeChild(container);
          }
        }
        // Convert Word to PDF
        else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.match(/\.docx?$/i)) {
          toast.info(`Converting ${file.name} to PDF...`);
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer });
          const html = result.value;
          
          const container = document.createElement('div');
          container.innerHTML = html;
          container.style.position = 'absolute';
          container.style.left = '-9999px';
          container.style.width = '800px';
          container.style.padding = '40px';
          container.style.fontFamily = 'Arial, sans-serif';
          container.style.fontSize = '14px';
          container.style.lineHeight = '1.6';
          document.body.appendChild(container);
          
          try {
            const canvas = await html2canvas(container, { scale: 2, useCORS: true, logging: false });
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4' });
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const imgWidth = pdf.internal.pageSize.getWidth();
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
            const pdfBlob = pdf.output('blob');
            processedFile = new File([pdfBlob], file.name.replace(/\.docx?$/i, '.pdf'), { type: 'application/pdf' });
          } finally {
            document.body.removeChild(container);
          }
        }
        // Check if it's a PDF
        else if (file.type !== "application/pdf") {
          toast.error(`Unsupported file type: ${file.name}`);
          continue;
        }
        
        processedFiles.push(processedFile);
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        toast.error(`Failed to process ${file.name}`);
      }
    }
    
    if (processedFiles.length === 0) {
      toast.error("No valid files to add");
      return;
    }
    
    setPdfFiles(prev => [...prev, ...processedFiles]);
    setMatchingPages(new Set());
    setKeywordMatches([]);
    setSelectedPagesForExtraction(new Set());
    toast.success(`${processedFiles.length} file(s) added successfully!`);
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
    const key = `${fileIndex}-${pageNum}`;
    
    setSelectedPagesForExtraction(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
        // Remove from keyword matches too
        setKeywordMatches(prevMatches => 
          prevMatches.filter(m => !(m.fileIndex === fileIndex && m.page === pageNum))
        );
      } else {
        newSet.add(key);
        // Add to keyword matches
        setKeywordMatches(prevMatches => [
          ...prevMatches,
          {
            page: pageNum,
            keyword: "Manually Added",
            count: 1,
            fileName: pdfFiles[fileIndex]?.name || `Document ${fileIndex + 1}`,
            fileIndex
          }
        ]);
      }
      return newSet;
    });
  }, [pdfFiles]);

  const selectAllPages = useCallback(() => {
    const allMatchingPages = new Set(keywordMatches.map(m => `${m.fileIndex}-${m.page}`));
    setSelectedPagesForExtraction(allMatchingPages);
  }, [keywordMatches]);

  const deselectAllPages = useCallback(() => {
    setSelectedPagesForExtraction(new Set());
  }, []);

  const removeMatchFromList = useCallback(async (fileIndex: number, pageNum: number) => {
    try {
      // Load the original PDF
      const file = pdfFiles[fileIndex];
      if (!file) return;
      
      toast("Removing page from PDF file...");
      
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      
      // Create new PDF without the deleted page
      const newPdfDoc = await PDFDocument.create();
      const totalPages = pdfDoc.getPageCount();
      
      for (let i = 0; i < totalPages; i++) {
        if (i + 1 !== pageNum) { // Skip the page to delete (convert 0-indexed to 1-indexed)
          const [copiedPage] = await newPdfDoc.copyPages(pdfDoc, [i]);
          newPdfDoc.addPage(copiedPage);
        }
      }
      
      // Save the new PDF
      const pdfBytes = await newPdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const newFile = new File([blob], file.name, { type: 'application/pdf' });
      
      // Update the files array
      setPdfFiles(prev => {
        const newFiles = [...prev];
        newFiles[fileIndex] = newFile;
        return newFiles;
      });
      
      // Update all page references for this file (shift down page numbers after deleted page)
      setKeywordMatches(prev => prev
        .filter(m => !(m.fileIndex === fileIndex && m.page === pageNum))
        .map(m => {
          if (m.fileIndex === fileIndex && m.page > pageNum) {
            return { ...m, page: m.page - 1 };
          }
          return m;
        })
      );
      
      // Update selected pages
      setSelectedPagesForExtraction(prev => {
        const newSet = new Set<string>();
        prev.forEach(key => {
          const [fIdx, pNum] = key.split('-').map(Number);
          if (fIdx === fileIndex) {
            if (pNum !== pageNum) {
              // Shift page numbers down for pages after the deleted one
              const newPageNum = pNum > pageNum ? pNum - 1 : pNum;
              newSet.add(`${fIdx}-${newPageNum}`);
            }
          } else {
            newSet.add(key);
          }
        });
        return newSet;
      });
      
      // Update diagnoses
      setPageDiagnoses(prev => {
        const newDiagnoses: Record<string, string> = {};
        Object.entries(prev).forEach(([key, value]) => {
          const [fIdx, pNum] = key.split('-').map(Number);
          if (fIdx === fileIndex) {
            if (pNum !== pageNum) {
              const newPageNum = pNum > pageNum ? pNum - 1 : pNum;
              newDiagnoses[`${fIdx}-${newPageNum}`] = value;
            }
          } else {
            newDiagnoses[key] = value;
          }
        });
        return newDiagnoses;
      });
      
      // Update PDF content
      setPdfContent(prev => prev.map(content => {
        if (content.fileIndex === fileIndex) {
          return {
            ...content,
            pages: content.pages
              .filter(p => p.pageNum !== pageNum)
              .map(p => ({
                ...p,
                pageNum: p.pageNum > pageNum ? p.pageNum - 1 : p.pageNum
              }))
          };
        }
        return content;
      }));
      
      // Remove from matching pages if it's the current PDF
      if (fileIndex === currentPdfIndex) {
        setMatchingPages(prev => {
          const newSet = new Set<number>();
          prev.forEach(p => {
            if (p !== pageNum) {
              newSet.add(p > pageNum ? p - 1 : p);
            }
          });
          return newSet;
        });
        
        // Navigate to previous page if we deleted the current page
        if (selectedPage === pageNum) {
          setSelectedPage(Math.max(1, pageNum - 1));
        } else if (selectedPage && selectedPage > pageNum) {
          setSelectedPage(selectedPage - 1);
        }
      }
      
      toast.success("Page removed from PDF file");
    } catch (error) {
      console.error("Error removing page from PDF:", error);
      toast.error("Failed to remove page from PDF");
    }
  }, [pdfFiles, currentPdfIndex, selectedPage]);

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

  const handleAddFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    
    const pdfFiles = Array.from(files).filter(file => file.type === "application/pdf");
    if (pdfFiles.length === 0) {
      toast.error("Please select PDF files only");
      return;
    }
    
    setPdfFiles(prev => [...prev, ...pdfFiles]);
    toast.success(`${pdfFiles.length} PDF file(s) added`);
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

  const handleDiagnosisChange = useCallback(async (fileIndex: number, pageNum: number, diagnosis: string) => {
    // Update state immediately for UI responsiveness
    setPageDiagnoses(prev => ({
      ...prev,
      [`${fileIndex}-${pageNum}`]: diagnosis
    }));

    // If diagnosis is empty, just update state and return
    if (!diagnosis.trim()) {
      toast.success("Diagnosis cleared");
      return;
    }

    try {
      const file = pdfFilesRef.current[fileIndex];
      if (!file) return;

      // Load the PDF
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const page = pdfDoc.getPage(pageNum - 1); // Convert to 0-indexed
      
      // Get page dimensions
      const { width, height } = page.getSize();
      
      // Embed font
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      // Add diagnosis text at the top of the page
      const fontSize = 12;
      const textWidth = font.widthOfTextAtSize(diagnosis, fontSize);
      const maxWidth = width - 100; // Leave margins
      
      // Wrap text if too long
      const words = diagnosis.split(' ');
      let lines: string[] = [];
      let currentLine = '';
      
      words.forEach(word => {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);
        
        if (testWidth > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      });
      if (currentLine) lines.push(currentLine);
      
      // Draw text on page (top section with background)
      const padding = 10;
      const lineHeight = 16;
      const boxHeight = (lines.length * lineHeight) + (padding * 2);
      
      // Draw background rectangle
      page.drawRectangle({
        x: 20,
        y: height - 30 - boxHeight,
        width: width - 40,
        height: boxHeight,
        color: rgb(1, 1, 0.9),
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 1,
      });
      
      // Draw text lines
      lines.forEach((line, index) => {
        page.drawText(line, {
          x: 30,
          y: height - 40 - (index * lineHeight),
          size: fontSize,
          font: font,
          color: rgb(0, 0, 0),
        });
      });
      
      // Save the modified PDF
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const newFile = new File([blob], file.name, { type: 'application/pdf' });
      
      // Update the files array and keep ref in sync
      await new Promise<void>((resolve) => {
        setPdfFiles(prev => {
          const newFiles = [...prev];
          newFiles[fileIndex] = newFile;
          pdfFilesRef.current = newFiles;
          return newFiles;
        });
        // Let React commit the state update before resolving
        setTimeout(resolve, 10);
      });
      
      toast.success("Diagnosis saved to PDF");
    } catch (error) {
      console.error("Error adding diagnosis to PDF:", error);
      toast.error("Failed to save diagnosis to PDF");
      throw error; // Re-throw to handle in auto-scan
    }
  }, [pdfFiles]);

  const handleRenameDiagnosis = useCallback((oldDiagnosis: string, newDiagnosis: string) => {
    if (!newDiagnosis.trim() || oldDiagnosis === newDiagnosis) {
      setEditingDiagnosis(null);
      return;
    }

    setPageDiagnoses(prev => {
      const updated = { ...prev };
      
      Object.keys(updated).forEach(key => {
        const diagnoses = updated[key].split(',').map(d => d.trim());
        const hasOldDiagnosis = diagnoses.includes(oldDiagnosis);
        
        if (hasOldDiagnosis) {
          // Replace old diagnosis with new one
          const updatedDiagnoses = diagnoses.map(d => 
            d === oldDiagnosis ? newDiagnosis.trim() : d
          );
          updated[key] = updatedDiagnoses.join(', ');
        }
      });
      
      return updated;
    });

    // Rename the form data key if it exists
    setDiagnosisForms(prev => {
      if (prev[oldDiagnosis]) {
        const updated = { ...prev };
        updated[newDiagnosis] = prev[oldDiagnosis];
        delete updated[oldDiagnosis];
        return updated;
      }
      return prev;
    });

    setEditingDiagnosis(null);
    toast.success(`Renamed "${oldDiagnosis}" to "${newDiagnosis}"`);
  }, []);

  const handleDeleteDiagnosis = useCallback((diagnosisToDelete: string) => {
    setPageDiagnoses(prev => {
      const updated = { ...prev };
      
      Object.keys(updated).forEach(key => {
        const diagnoses = updated[key].split(',').map(d => d.trim()).filter(d => d);
        const filtered = diagnoses.filter(d => d !== diagnosisToDelete);
        
        if (filtered.length > 0) {
          updated[key] = filtered.join(', ');
        } else {
          delete updated[key];
        }
      });
      
      return updated;
    });

    // Remove the form data for this diagnosis
    setDiagnosisForms(prev => {
      const updated = { ...prev };
      delete updated[diagnosisToDelete];
      return updated;
    });

    toast.success(`Deleted diagnosis "${diagnosisToDelete}"`);
  }, []);

  const handleGenerateDiagnosisForm = useCallback(async (diagnosis: string) => {
    setGeneratingForm(diagnosis);
    toast.info('Generating diagnosis form with AI...');

    try {
      // Get all pages associated with this diagnosis
      const associatedPages: Array<{ key: string; fileIndex: number; pageNum: number }> = [];
      
      Object.entries(pageDiagnoses).forEach(([key, diagnosisString]) => {
        const diagnoses = diagnosisString.split(',').map(d => d.trim());
        if (diagnoses.includes(diagnosis)) {
          const [fileIndex, pageNum] = key.split('-').map(Number);
          associatedPages.push({ key, fileIndex, pageNum });
        }
      });

      // Collect PDF content for these pages
      let combinedContent = '';
      for (const page of associatedPages) {
        const fileName = pdfFiles[page.fileIndex]?.name || `Document ${page.fileIndex + 1}`;
        const pageContent = pdfContent.find(
          pc => pc.fileIndex === page.fileIndex
        )?.pages.find(p => p.pageNum === page.pageNum);
        
        if (pageContent) {
          combinedContent += `\n\n=== ${fileName} - Page ${page.pageNum} ===\n${pageContent.text}`;
        }
      }

      if (!combinedContent.trim()) {
        toast.error('No content found for this diagnosis');
        setGeneratingForm(null);
        return;
      }

      // Call the edge function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-diagnosis-form`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
          },
          body: JSON.stringify({
            diagnosis,
            pdfContent: combinedContent
          })
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success || !data.formData) {
        throw new Error('Invalid response from server');
      }

      // Store the form data in state
      setDiagnosisForms(prev => ({
        ...prev,
        [diagnosis]: data.formData
      }));

      toast.success('Diagnosis form generated!');
    } catch (error) {
      console.error('Error generating diagnosis form:', error);
      toast.error('Failed to generate diagnosis form');
    } finally {
      setGeneratingForm(null);
    }
  }, [pageDiagnoses, pdfFiles, pdfContent]);

  const handleScanAllFiles = useCallback(async () => {
    if (pdfFiles.length === 0) {
      toast.error("No PDFs to scan");
      return;
    }

    // Filter out already scanned files
    const filesToScan = pdfFiles
      .map((file, index) => ({ file, index }))
      .filter(({ index }) => !ocrCompletedFiles.has(index));

    if (filesToScan.length === 0) {
      toast("All files have already been scanned");
      return;
    }

    setIsAutoScanningAll(true);
    toast(`Starting OCR scan of ${filesToScan.length} PDF(s)...`);

    try {
      const { createWorker } = await import("tesseract.js");
      const pdfjsLib = await import("pdfjs-dist");

      // Create a shared worker for all files
      const worker = await createWorker('eng');

      for (const { file, index } of filesToScan) {
        setScanningFiles(prev => new Set(prev).add(index));
        
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
          const totalPages = pdfDoc.numPages;
          
          setOcrProgress({ current: 0, total: totalPages, message: `Scanning ${file.name}...` });
          
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

          handlePDFTextExtracted(index, file.name, pageTexts);
          toast.success(`Scan complete for ${file.name}`);
        } catch (error) {
          console.error(`Error scanning ${file.name}:`, error);
          toast.error(`Scan failed for ${file.name}`);
        } finally {
          setScanningFiles(prev => {
            const newSet = new Set(prev);
            newSet.delete(index);
            return newSet;
          });
        }
      }

      await worker.terminate();
      setOcrProgress(null);
      toast.success(`All scans complete!`);
    } catch (error) {
      console.error("Error in batch scan:", error);
      toast.error("Batch scan failed");
      setOcrProgress(null);
    } finally {
      setIsAutoScanningAll(false);
    }
  }, [pdfFiles, ocrCompletedFiles, handlePDFTextExtracted]);

  const handleAutoScanAllPDFs = useCallback(async (model: "gemini" | "claude") => {
    if (pdfFiles.length === 0) {
      toast.error("No PDFs to scan");
      return;
    }

    setIsAutoScanningAll(true);
    let totalScanned = 0;
    let totalPages = 0;

    try {
      toast(`Starting AI auto-scan of all ${pdfFiles.length} PDF(s)...`);

      // Calculate total pages across all PDFs
      for (const file of pdfFiles) {
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        totalPages += pdfDoc.numPages;
      }

      // Scan each PDF
      for (let fileIndex = 0; fileIndex < pdfFiles.length; fileIndex++) {
        const file = pdfFiles[fileIndex];
        toast.info(`Scanning ${file.name}...`);

        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        const numPages = pdfDoc.numPages;
        const fileDiagnoses: { pageNum: number; diagnosis: string }[] = [];

        // Scan each page in this PDF
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          let tempCanvas: HTMLCanvasElement | null = null;
          
          try {
            totalScanned++;
            toast.info(`Scanning page ${totalScanned}/${totalPages}...`, { duration: 1000 });

            // Render page to get image
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.2 });
            
            tempCanvas = document.createElement('canvas');
            tempCanvas.width = viewport.width;
            tempCanvas.height = viewport.height;
            const context = tempCanvas.getContext('2d');
            
            if (!context) {
              tempCanvas = null;
              continue;
            }

            await page.render({
              canvasContext: context,
              viewport: viewport,
              canvas: tempCanvas,
            }).promise;

            const pageImage = tempCanvas.toDataURL('image/jpeg', 0.85);
            
            // Clean up canvas immediately after getting image
            tempCanvas.width = 0;
            tempCanvas.height = 0;
            tempCanvas = null;
            
            // Get extracted text for this page if available
            const fileContent = pdfContent.find(p => p.fileIndex === fileIndex);
            const pageText = fileContent?.pages.find(p => p.pageNum === pageNum)?.text || "";

            // Call edge function with selected model
            const { data, error } = await supabase.functions.invoke('suggest-diagnosis', {
              body: {
                pageImage,
                pageText,
                fileName: file.name,
                pageNum: pageNum,
                model: model
              }
            });

            if (error) {
              console.error(`AI suggestion error for ${file.name} page ${pageNum}:`, error);
              // Longer delay on error to avoid rate limiting
              await new Promise(resolve => setTimeout(resolve, 2000));
              continue;
            }

            if (data?.diagnosis) {
              // Store diagnosis for this page
              fileDiagnoses.push({ pageNum, diagnosis: data.diagnosis });
              
              // Update state immediately for UI
              setPageDiagnoses(prev => ({
                ...prev,
                [`${fileIndex}-${pageNum}`]: data.diagnosis
              }));
            }

            // Longer delay to avoid rate limiting and reduce system load
            await new Promise(resolve => setTimeout(resolve, 1500));

          } catch (pageError) {
            console.error(`Error processing ${file.name} page ${pageNum}:`, pageError);
            // Clean up canvas on error
            if (tempCanvas) {
              tempCanvas.width = 0;
              tempCanvas.height = 0;
            }
            // Longer delay on error
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        // Save all diagnoses to PDF for this file in one batch
        if (fileDiagnoses.length > 0) {
          toast.info(`Saving ${fileDiagnoses.length} diagnoses to ${file.name}...`);
          
          try {
            // Load the PDF once
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            
            // Add all diagnoses to the PDF
            for (const { pageNum, diagnosis } of fileDiagnoses) {
              try {
                const page = pdfDoc.getPage(pageNum - 1); // Convert to 0-indexed
                const { width, height } = page.getSize();
                
                const fontSize = 12;
                const maxWidth = width - 100; // Leave margins
                
                // Wrap text if too long
                const words = diagnosis.split(' ');
                let lines: string[] = [];
                let currentLine = '';
                
                words.forEach(word => {
                  const testLine = currentLine + (currentLine ? ' ' : '') + word;
                  const testWidth = font.widthOfTextAtSize(testLine, fontSize);
                  
                  if (testWidth > maxWidth && currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                  } else {
                    currentLine = testLine;
                  }
                });
                if (currentLine) lines.push(currentLine);
                
                // Draw text on page (top section with background)
                const padding = 10;
                const lineHeight = 16;
                const boxHeight = (lines.length * lineHeight) + (padding * 2);
                
                // Draw background rectangle
                page.drawRectangle({
                  x: 20,
                  y: height - 30 - boxHeight,
                  width: width - 40,
                  height: boxHeight,
                  color: rgb(1, 1, 0.9),
                  borderColor: rgb(0.8, 0.8, 0.8),
                  borderWidth: 1,
                });
                
                // Draw text lines
                lines.forEach((line, index) => {
                  page.drawText(line, {
                    x: 30,
                    y: height - 40 - (index * lineHeight),
                    size: fontSize,
                    font: font,
                    color: rgb(0, 0, 0),
                  });
                });
              } catch (pageError) {
                console.error(`Error adding diagnosis to ${file.name} page ${pageNum}:`, pageError);
              }
            }
            
            // Save the modified PDF once with all diagnoses
            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const newFile = new File([blob], file.name, { type: 'application/pdf' });
            
            // Update the files array
            await new Promise<void>((resolve) => {
              setPdfFiles(prev => {
                const newFiles = [...prev];
                newFiles[fileIndex] = newFile;
                pdfFilesRef.current = newFiles;
                return newFiles;
              });
              setTimeout(resolve, 10);
            });
            
            toast.success(`${fileDiagnoses.length} diagnoses saved to ${file.name}`);
          } catch (error) {
            console.error(`Error saving diagnoses to ${file.name}:`, error);
            toast.error(`Failed to save diagnoses to ${file.name}`);
          }
        }
      }

      toast.success(`Auto-scan complete! Scanned ${totalScanned} pages across ${pdfFiles.length} PDF(s).`);
    } catch (error) {
      console.error("Error in auto-scan all:", error);
      toast.error("Auto-scan failed");
    } finally {
      setIsAutoScanningAll(false);
    }
  }, [pdfFiles, pdfContent, handleDiagnosisChange]);

  const handleGeneratePDF = async () => {
    if (selectedPagesForExtraction.size === 0) {
      toast.error("Please select at least one page");
      return;
    }

    try {
      toast("Capturing page screenshots and creating PDF...");
      
      const selectedContent = await captureSelectedPages(Array.from(selectedPagesForExtraction));
      const pdfBytes = await createPDFWithPages(selectedContent, pageDiagnoses);
      
      await downloadPDF(pdfBytes, `all-pages-${Date.now()}.pdf`);
      toast.success("PDF with screenshots created successfully!");
    } catch (error) {
      console.error("Error creating PDF:", error);
      toast.error("Failed to create PDF");
    }
  };

  const captureSelectedPages = async (pageKeys: string[]) => {
    return await Promise.all(
      pageKeys.map(async (key) => {
        const [fileIndexStr, pageNumStr] = key.split('-');
        const fileIndex = parseInt(fileIndexStr);
        const pageNum = parseInt(pageNumStr);
        
        const pdfDoc = pdfContent.find(p => p.fileIndex === fileIndex);
        
        let image: string | null = null;
        
        try {
          const file = pdfFiles[fileIndex];
          if (file) {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
            const pdfPage = await pdf.getPage(pageNum);
            
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
          image
        };
      })
    );
  };

  const createPDFWithPages = async (pages: any[], diagnoses: Record<string, string>, coverPageDiagnosis?: string) => {
    const pdfDoc = await PDFDocument.create();
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Add cover page if diagnosis is provided
    if (coverPageDiagnosis) {
      const coverPage = pdfDoc.addPage([595, 842]);
      const fontSize = 36;
      const textWidth = boldFont.widthOfTextAtSize(coverPageDiagnosis, fontSize);
      const x = (595 - textWidth) / 2;
      const y = 421; // Center vertically
      
      coverPage.drawText(coverPageDiagnosis, {
        x,
        y,
        size: fontSize,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
    }
    
    for (const content of pages) {
      if (content.image) {
        try {
          const screenshotPage = pdfDoc.addPage([595, 842]);
          
          screenshotPage.drawText(`${content.fileName} - Page ${content.pageNum}`, {
            x: 50,
            y: 792,
            size: 10,
            font: boldFont,
            color: rgb(0, 0, 0),
          });
          
          const diagnosis = diagnoses[`${content.fileIndex}-${content.pageNum}`];
          if (diagnosis && diagnosis.trim()) {
            screenshotPage.drawText(`Diagnosis: ${diagnosis}`, {
              x: 50,
              y: 775,
              size: 9,
              color: rgb(0.2, 0.2, 0.2),
            });
          }
          
          const imageBytes = content.image.split(',')[1];
          const imageData = Uint8Array.from(atob(imageBytes), c => c.charCodeAt(0));
          
          let embeddedImage;
          if (content.image.includes('image/png')) {
            embeddedImage = await pdfDoc.embedPng(imageData);
          } else {
            embeddedImage = await pdfDoc.embedJpg(imageData);
          }
          
          const imgWidth = embeddedImage.width;
          const imgHeight = embeddedImage.height;
          const maxImageWidth = 495;
          const maxImageHeight = 700;
          
          let scaledWidth = imgWidth;
          let scaledHeight = imgHeight;
          
          if (imgWidth > maxImageWidth || imgHeight > maxImageHeight) {
            const widthRatio = maxImageWidth / imgWidth;
            const heightRatio = maxImageHeight / imgHeight;
            const scale = Math.min(widthRatio, heightRatio);
            
            scaledWidth = imgWidth * scale;
            scaledHeight = imgHeight * scale;
          }
          
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
    
    return await pdfDoc.save();
  };

  const downloadPDF = async (pdfBytes: Uint8Array, filename: string) => {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    
    // Save to Supabase if workspace is selected
    if (selectedWorkspace && user) {
      await uploadPdfToStorage(blob, filename, selectedWorkspace.id, user.id);
      await refreshFiles();
    }
    
    // Also download locally
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadByDiagnosis = async (diagnosis: string) => {
    // Get all pages that have this diagnosis (could be part of a comma-separated list)
    const pagesForDiagnosis = Object.entries(pageDiagnoses)
      .filter(([_, diagnosisString]) => {
        if (!diagnosisString?.trim()) return false;
        // Split by comma and check if this diagnosis is in the list
        const individualDiagnoses = diagnosisString.split(',').map(d => d.trim());
        return individualDiagnoses.includes(diagnosis);
      })
      .map(([key]) => key);

    if (pagesForDiagnosis.length === 0) {
      toast.error("No pages found for this diagnosis");
      return;
    }

    try {
      toast(`Creating PDF for ${diagnosis}...`);
      const selectedContent = await captureSelectedPages(pagesForDiagnosis);
      const pdfBytes = await createPDFWithPages(selectedContent, pageDiagnoses, diagnosis);
      
      const safeFilename = diagnosis.replace(/[^a-z0-9]/gi, '-').toLowerCase();
      await downloadPDF(pdfBytes, `${safeFilename}-${Date.now()}.pdf`);
      toast.success(`PDF for ${diagnosis} created successfully!`);
    } catch (error) {
      console.error("Error creating diagnosis PDF:", error);
      toast.error("Failed to create PDF");
    }
  };

  const handleDownloadAllAsZip = async () => {
    // Get all unique individual diagnoses by splitting comma-separated values
    const allIndividualDiagnoses = new Set<string>();
    Object.values(pageDiagnoses).forEach(diagnosisString => {
      if (diagnosisString?.trim()) {
        diagnosisString.split(',').forEach(d => {
          const trimmed = d.trim();
          if (trimmed) allIndividualDiagnoses.add(trimmed);
        });
      }
    });
    
    if (allIndividualDiagnoses.size === 0) {
      toast.error("No diagnoses to download");
      return;
    }

    try {
      toast("Creating ZIP file with all diagnoses...");
      const zip = new JSZip();

      for (const diagnosis of Array.from(allIndividualDiagnoses)) {
        // Get all pages that contain this diagnosis
        const pagesForDiagnosis = Object.entries(pageDiagnoses)
          .filter(([_, diagnosisString]) => {
            if (!diagnosisString?.trim()) return false;
            const individualDiagnoses = diagnosisString.split(',').map(d => d.trim());
            return individualDiagnoses.includes(diagnosis);
          })
          .map(([key]) => key);

        const selectedContent = await captureSelectedPages(pagesForDiagnosis);
        const pdfBytes = await createPDFWithPages(selectedContent, pageDiagnoses, diagnosis);
        
        const safeFilename = diagnosis.replace(/[^a-z0-9]/gi, '-').toLowerCase();
        zip.file(`${safeFilename}.pdf`, pdfBytes);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `all-diagnoses-${Date.now()}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      
      toast.success("ZIP file created successfully!");
    } catch (error) {
      console.error("Error creating ZIP:", error);
      toast.error("Failed to create ZIP file");
    }
  };

  const handleDownloadAllModifiedPDFs = async () => {
    if (pdfFiles.length === 0) {
      toast.error("No PDFs to download");
      return;
    }

    try {
      toast("Creating ZIP with all modified PDFs...");
      const zip = new JSZip();

      for (let i = 0; i < pdfFiles.length; i++) {
        const file = pdfFiles[i];
        const arrayBuffer = await file.arrayBuffer();
        zip.file(file.name, arrayBuffer);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `all-modified-pdfs-${Date.now()}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      
      toast.success("All modified PDFs downloaded!");
    } catch (error) {
      console.error("Error creating ZIP:", error);
      toast.error("Failed to create ZIP file");
    }
  };

  const getDiagnosisGroups = useMemo(() => {
    const groups: Record<string, string[]> = {};
    
    Array.from(selectedPagesForExtraction).forEach(key => {
      const diagnosis = pageDiagnoses[key]?.trim();
      if (diagnosis) {
        if (!groups[diagnosis]) {
          groups[diagnosis] = [];
        }
        groups[diagnosis].push(key);
      }
    });

    return Object.entries(groups).map(([diagnosis, pages]) => ({
      diagnosis,
      pageCount: pages.length,
      pages
    })).sort((a, b) => a.diagnosis.localeCompare(b.diagnosis));
  }, [selectedPagesForExtraction, pageDiagnoses]);

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
                <h1 className="text-xl font-semibold text-foreground">dr.advocate.ai (Beta)</h1>
                <p className="text-sm text-muted-foreground">Extract pages by keywords with AI</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  🔒 All data stays in your browser - nothing stored or transmitted
                </p>
              </div>
            </div>
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
        {/* Privacy Notice - Show when no PDFs */}
        {pdfFiles.length === 0 && (
          <Card className="p-6 mb-4 bg-accent/20 border-accent">
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
        )}

        {/* PDF File Selector */}
        {pdfFiles.length > 0 && (
                <Card className="p-4 shadow-medium mb-4">
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Select PDF to View</Label>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleScanAllFiles}
                          disabled={isAutoScanningAll}
                          variant="secondary"
                          size="sm"
                          className="gap-2"
                        >
                          {isAutoScanningAll ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Scanning...
                            </>
                          ) : (
                            <>
                              <Search className="w-4 h-4" />
                              OCR Scan All
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={() => handleAutoScanAllPDFs("claude")}
                          disabled={isAutoScanningAll}
                          variant="default"
                          size="sm"
                          className="gap-2"
                        >
                          {isAutoScanningAll ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              AI Scanning...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              AI Auto-scan All (Claude)
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
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
                              <>{isComplete ? 'Rescan & OCR' : 'Scan & OCR'}</>
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

        {/* 3-Panel Layout: Search Categories | PDF Viewer | AI Assistant & Matches */}
        <ResizablePanelGroup direction="horizontal" className="min-h-[calc(100vh-300px)] rounded-lg border">
                {/* Left Panel: Search Categories Only */}
                <ResizablePanel defaultSize={20} minSize={15} maxSize={30} collapsible>
                  <Card className="h-full rounded-none border-0">
                    <div className="p-4 border-b">
                      <h3 className="font-semibold">Search Categories</h3>
                    </div>
                      
                      <ScrollArea className="h-full">
                        <div className="p-4">
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
                          </div>
                        </ScrollArea>
                  </Card>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Middle Panel: PDF Viewer Only */}
                <ResizablePanel defaultSize={50} minSize={30}>
                  <Card className="h-full rounded-none border-0 overflow-hidden">
            {pdfFiles.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center p-6">
                        {!selectedWorkspace && (
                          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md max-w-md">
                            <p className="text-sm text-yellow-800">
                              ⚠️ No workspace selected. Altered PDFs will only download locally. Select a workspace to save to cloud.
                            </p>
                          </div>
                        )}
                        <FileUpload onFileSelect={handleFileSelect} />
                      </div>
                    ) : (
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
                        onTogglePageSelection={togglePageSelection}
                        selectedPagesForExtraction={selectedPagesForExtraction}
                        pageDiagnoses={pageDiagnoses}
                        onDiagnosisChange={handleDiagnosisChange}
                        onDeletePage={removeMatchFromList}
                        pdfContent={pdfContent}
                      />
                    )}
                  </Card>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Right Panel: AI Assistant & Matches in Tabs */}
                <ResizablePanel defaultSize={25} minSize={20} maxSize={40} collapsible>
                  <Card className="h-full rounded-none border-0 flex flex-col">
                    <Tabs defaultValue="assistant" className="h-full flex flex-col">
                      <TabsList className="w-full rounded-none border-b grid grid-cols-2">
                        <TabsTrigger value="assistant">AI Assistant</TabsTrigger>
                        <TabsTrigger value="matches">Matches ({selectedPagesForExtraction.size})</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="assistant" className="flex-1 mt-0 p-0 h-full">
                        <ScrollArea className="h-full">
                          <div className="p-4">
                            <AISearchAssistant 
                              onKeywordSuggest={handleKeywordSuggest}
                              onPagesSelected={handleAIPageSelection}
                              currentKeywords={keywords}
                              pdfContent={pdfContent}
                              onTriggerAutoScan={handleAutoScanAllPDFs}
                              isAutoScanning={isAutoScanningAll}
                            />
                          </div>
                        </ScrollArea>
                      </TabsContent>
                      
                      <TabsContent value="matches" className="flex-1 mt-0 p-0 h-full">
                        <div className="p-4 flex flex-col h-full">
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
                                            className="mt-0.5 w-4 h-4 cursor-pointer flex-shrink-0"
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
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 flex-shrink-0 hover:text-destructive"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              removeMatchFromList(fileIndex, page);
                                            }}
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
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
                        </div>
                      </TabsContent>
                    </Tabs>
                  </Card>
                </ResizablePanel>
        </ResizablePanelGroup>

        {/* Diagnosis Tracker Section */}
        {Object.keys(pageDiagnoses).filter(key => pageDiagnoses[key]?.trim()).length > 0 && (
          <Card className="mt-4 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Diagnosis Tracker</h3>
              <Button
                onClick={handleDownloadAllAsZip}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <FileArchive className="w-4 h-4" />
                Download All as ZIP
              </Button>
            </div>
            <div className="space-y-2">
              {(() => {
                // Split comma-separated diagnoses and group pages by individual diagnosis
                const diagnosisGroups: Record<string, Array<{ key: string; fileIndex: number; pageNum: number; fileName: string }>> = {};
                
                Object.entries(pageDiagnoses).forEach(([key, diagnosisString]) => {
                  if (!diagnosisString?.trim()) return;
                  
                  // Split by comma and trim each diagnosis
                  const individualDiagnoses = diagnosisString.split(',').map(d => d.trim()).filter(d => d);
                  
                  individualDiagnoses.forEach(diagnosis => {
                    if (!diagnosisGroups[diagnosis]) {
                      diagnosisGroups[diagnosis] = [];
                    }
                    
                    const [fileIndex, pageNum] = key.split('-').map(Number);
                    diagnosisGroups[diagnosis].push({
                      key,
                      fileIndex,
                      pageNum,
                      fileName: pdfFiles[fileIndex]?.name || `Document ${fileIndex + 1}`
                    });
                  });
                });
                
                // Sort diagnoses alphabetically and then sort pages within each diagnosis
                return Object.entries(diagnosisGroups)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([diagnosis, pages]) => {
                    const sortedPages = pages.sort((a, b) => {
                      if (a.fileIndex !== b.fileIndex) return a.fileIndex - b.fileIndex;
                      return a.pageNum - b.pageNum;
                    });

                    return (
                      <Collapsible key={diagnosis} defaultOpen={true}>
                        <div className="border rounded-lg">
                          <CollapsibleTrigger className="w-full p-3 flex items-center justify-between hover:bg-accent/5">
                            <div className="flex items-center gap-2 flex-1">
                              <ChevronRight className="w-4 h-4 transition-transform group-data-[state=open]:rotate-90" />
                              {editingDiagnosis === diagnosis ? (
                                <Input
                                  value={editDiagnosisValue}
                                  onChange={(e) => setEditDiagnosisValue(e.target.value)}
                                  onBlur={() => handleRenameDiagnosis(diagnosis, editDiagnosisValue)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleRenameDiagnosis(diagnosis, editDiagnosisValue);
                                    } else if (e.key === 'Escape') {
                                      setEditingDiagnosis(null);
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  autoFocus
                                  className="h-8 font-medium"
                                />
                              ) : (
                                <span 
                                  className="font-medium cursor-pointer hover:text-primary transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingDiagnosis(diagnosis);
                                    setEditDiagnosisValue(diagnosis);
                                  }}
                                >
                                  {diagnosis}
                                </span>
                              )}
                              <span className="text-sm text-muted-foreground">
                                ({sortedPages.length} page{sortedPages.length !== 1 ? 's' : ''})
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleGenerateDiagnosisForm(diagnosis);
                                }}
                                disabled={generatingForm === diagnosis}
                                className="h-8 w-8 p-0 hover:text-primary"
                                aria-label="Generate diagnosis form"
                              >
                                {generatingForm === diagnosis ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <FileEdit className="w-4 h-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Delete all instances of "${diagnosis}"?`)) {
                                    handleDeleteDiagnosis(diagnosis);
                                  }
                                }}
                                className="h-8 w-8 p-0 hover:text-destructive"
                                aria-label="Delete diagnosis"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadByDiagnosis(diagnosis);
                                }}
                                className="ml-1 h-8 w-8 p-0"
                                aria-label="Download PDF"
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            {diagnosisForms[diagnosis] && (
                              <div className="px-3 py-3 bg-accent/5 border-b space-y-3">
                                <div className="grid gap-3">
                                  <div>
                                    <Label className="text-sm font-semibold">Medical Diagnosis</Label>
                                    <p className="text-sm mt-1">{diagnosisForms[diagnosis].medicalDiagnosis}</p>
                                  </div>
                                  <div>
                                    <Label className="text-sm font-semibold">Basis for Diagnosis</Label>
                                    <p className="text-sm mt-1 whitespace-pre-wrap">{diagnosisForms[diagnosis].basisForDiagnosis}</p>
                                  </div>
                                  <div>
                                    <Label className="text-sm font-semibold">Related Conditions</Label>
                                    <p className="text-sm mt-1">{diagnosisForms[diagnosis].relatedConditions}</p>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <Label className="text-sm font-semibold">Date of Onset</Label>
                                      <p className="text-sm mt-1">{diagnosisForms[diagnosis].dateOfOnset}</p>
                                    </div>
                                    <div>
                                      <Label className="text-sm font-semibold">First Consultation</Label>
                                      <p className="text-sm mt-1">{diagnosisForms[diagnosis].firstConsultation}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                            <div className="px-3 pb-3 space-y-1">
                              {sortedPages.map((page) => (
                            <div
                              key={page.key}
                              className="flex items-center justify-between py-2 px-3 rounded hover:bg-accent/10 cursor-pointer"
                            >
                              <div 
                                className="flex items-center gap-2 text-sm flex-1"
                                onClick={() => {
                                  setCurrentPdfIndex(page.fileIndex);
                                  setSelectedPage(page.pageNum);
                                }}
                              >
                                <FileText className="w-4 h-4 text-muted-foreground" />
                                <span>{page.fileName}</span>
                                <span className="text-muted-foreground">- Page {page.pageNum}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEnlargedPageDialog({
                                      open: true,
                                      fileIndex: page.fileIndex,
                                      pageNum: page.pageNum,
                                    });
                                  }}
                                  className="h-7 w-7 p-0 hover:text-primary"
                                  title="View enlarged"
                                >
                                  <ZoomIn className="h-3 w-3" />
                                </Button>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeMatchFromList(page.fileIndex, page.pageNum);
                                }}
                                className="h-7 w-7 p-0 hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              });
              })()}
            </div>
          </Card>
        )}

        {/* Diagnosis Summary Section */}
        {getDiagnosisGroups.length > 0 && (
          <Card className="mt-4 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Diagnoses Summary</h3>
              <Button
                onClick={handleDownloadAllAsZip}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <FileArchive className="w-4 h-4" />
                Download All as ZIP
              </Button>
            </div>
            <div className="space-y-2">
              {getDiagnosisGroups.map((group, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-accent/10 rounded-lg border"
                >
                  <div className="flex-1">
                    <p className="font-medium">{group.diagnosis}</p>
                    <p className="text-sm text-muted-foreground">
                      {group.pageCount} page{group.pageCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <Button
                    onClick={() => handleDownloadByDiagnosis(group.diagnosis)}
                    size="sm"
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Generate PDF Button - Full Width at Bottom */}
        <div className="mt-4">
          <Button 
            onClick={handleGeneratePDF}
            disabled={selectedPagesForExtraction.size === 0}
            className="w-full gap-2"
            size="lg"
          >
            <Download className="w-4 h-4" />
            Download PDF with All Selected Pages & Diagnoses ({selectedPagesForExtraction.size} page{selectedPagesForExtraction.size !== 1 ? 's' : ''})
          </Button>
          {selectedPagesForExtraction.size > 0 && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              {Object.keys(pageDiagnoses).filter(key => selectedPagesForExtraction.has(key) && pageDiagnoses[key]?.trim()).length} page(s) with diagnosis notes
            </p>
          )}
        </div>
      </main>
      
      {/* Download All Modified PDFs Button */}
      {pdfFiles.length > 0 && (
        <div className="container mx-auto px-4 py-4 border-t">
          <Button
            onClick={handleDownloadAllModifiedPDFs}
            variant="outline"
            size="lg"
            className="w-full gap-2"
          >
            <FileArchive className="w-5 h-5" />
            Download All Modified PDF Files ({pdfFiles.length} file{pdfFiles.length !== 1 ? 's' : ''})
          </Button>
        </div>
      )}
      
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.html,.htm,.docx,.doc"
        multiple
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            handleMultipleFileSelect(files);
          }
        }}
        className="hidden"
      />

      {/* Enlarged Page Dialog */}
      {enlargedPageDialog.open && pdfFiles[enlargedPageDialog.fileIndex] && (
        <PDFPageDialog
          open={enlargedPageDialog.open}
          onOpenChange={(open) => setEnlargedPageDialog({ ...enlargedPageDialog, open })}
          file={pdfFiles[enlargedPageDialog.fileIndex]}
          pageNumber={enlargedPageDialog.pageNum}
          title={`${pdfFiles[enlargedPageDialog.fileIndex].name} - Page ${enlargedPageDialog.pageNum}`}
        />
      )}
    </div>
  );
};
