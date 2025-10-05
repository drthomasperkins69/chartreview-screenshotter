import { useState, useRef, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FileUpload } from "./FileUpload";
import { PDFViewer } from "./PDFViewer";
import { AISearchAssistant } from "./AISearchAssistant";
import { FileText, Download, Upload, Search } from "lucide-react";
import { PDFDocument } from "pdf-lib";

interface KeywordMatch {
  page: number;
  keyword: string;
  count: number;
  fileName: string;
  fileIndex: number;
}

export const PDFSignature = () => {
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [currentPdfIndex, setCurrentPdfIndex] = useState<number>(0);
  const [keywords, setKeywords] = useState<string>("");
  const [suggestedKeywords, setSuggestedKeywords] = useState<string>("");
  const [searchCategories, setSearchCategories] = useState(() => {
    const saved = localStorage.getItem('pdfSearchCategories');
    return saved ? JSON.parse(saved) : [
      { id: 1, label: "Lumbar", terms: "", checked: false }
    ];
  });
  const [matchingPages, setMatchingPages] = useState<Set<number>>(new Set());
  const [selectedPagesForExtraction, setSelectedPagesForExtraction] = useState<Set<string>>(new Set()); // Format: "fileIndex-pageNumber"
  const [keywordMatches, setKeywordMatches] = useState<KeywordMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [autoNavigate, setAutoNavigate] = useState(true);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentPdf = pdfFiles[currentPdfIndex] || null;

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
    // Filter out any invalid matches
    const validMatches = matches.filter(m => 
      !isNaN(m.fileIndex) && 
      m.fileIndex >= 0 && 
      m.fileIndex < pdfFiles.length &&
      !isNaN(m.page) &&
      m.page > 0
    );
    
    setKeywordMatches(validMatches);
    const pages = new Set(validMatches.filter(m => m.fileIndex === currentPdfIndex).map(m => m.page));
    setMatchingPages(pages);
    
    // Auto-select all matching pages across all documents
    const allMatchingPages = new Set(validMatches.map(m => `${m.fileIndex}-${m.page}`));
    setSelectedPagesForExtraction(allMatchingPages);
    
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
      
      // Group selections by file index
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
      
      // Sort file indices and process in order
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
    fileInputRef.current?.click();
  };

  const handlePageClick = useCallback((pageNum: number, fileIndex: number) => {
    if (!isNaN(fileIndex) && fileIndex >= 0 && fileIndex < pdfFiles.length) {
      if (fileIndex !== currentPdfIndex) {
        setCurrentPdfIndex(fileIndex);
        // Update matches for the new PDF
        const newMatches = keywordMatches.filter(m => m.fileIndex === fileIndex);
        const pages = new Set(newMatches.map(m => m.page));
        setMatchingPages(pages);
      }
      if (autoNavigate) {
        setSelectedPage(pageNum);
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
    
    // Auto-populate keywords when checked
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
      // Remove terms when unchecked
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
    setSearchCategories(prev => {
      const updated = prev.map(cat => 
        cat.id === categoryId ? { ...cat, terms } : cat
      );
      localStorage.setItem('pdfSearchCategories', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Persist search categories to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('pdfSearchCategories', JSON.stringify(searchCategories));
  }, [searchCategories]);

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="border-b bg-card shadow-soft">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-primary">
                <FileText className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">PDF Keyword Extractor</h1>
                <p className="text-sm text-muted-foreground">Extract pages by keywords</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
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

      <main className="container mx-auto px-4 py-6">
        {pdfFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <FileUpload onFileSelect={handleFileSelect} />
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                  handleMultipleFileSelect(files);
                }
              }}
              className="hidden"
            />
          </div>
        ) : (
          <div className="space-y-6">
            {/* PDF File Selector */}
            {pdfFiles.length > 1 && (
              <Card className="p-4 shadow-medium">
                <Label className="text-sm font-medium mb-2 block">Select PDF to View</Label>
                <div className="flex flex-wrap gap-2">
                  {pdfFiles.map((file, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Button
                        variant={currentPdfIndex === index ? "default" : "outline"}
                        onClick={() => {
                          setCurrentPdfIndex(index);
                          setMatchingPages(new Set());
                          setKeywordMatches([]);
                          setSelectedPagesForExtraction(new Set());
                          setSelectedPage(null);
                        }}
                        className="gap-2"
                        size="sm"
                      >
                        <FileText className="w-4 h-4" />
                        {file.name || `PDF ${index + 1}`}
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
                  ))}
                </div>
              </Card>
            )}

            {/* AI Assistant */}
            <div className="h-[400px]">
              <AISearchAssistant 
                onKeywordSuggest={handleKeywordSuggest}
                currentKeywords={keywords}
              />
            </div>

            {/* Search Controls */}
            <Card className="p-4 shadow-medium">
              <Label className="text-sm font-medium mb-3 block">
                Quick Search Categories
              </Label>
              
              <div className="space-y-3 mb-4">
                {searchCategories.map((category) => (
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
                      <Input
                        placeholder="Enter keywords (comma separated)"
                        value={category.terms}
                        onChange={(e) => updateCategoryTerms(category.id, e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>

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
                  disabled={isSearching || !keywords.trim()}
                >
                  <Search className="w-4 h-4" />
                  {isSearching ? "Searching..." : "Search PDF"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Separate multiple keywords with commas
              </p>
            </Card>

            {/* PDF Viewer and Matches Side by Side */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* PDF Viewer - Takes up 2/3 of space */}
              <div className="lg:col-span-2">
                <Card className="shadow-medium overflow-hidden">
                  <PDFViewer
                    files={pdfFiles}
                    currentFileIndex={currentPdfIndex}
                    keywords={keywords}
                    dateSearch=""
                    matchingPages={matchingPages}
                    isSearching={isSearching}
                    onKeywordMatchesDetected={handleKeywordMatchesDetected}
                    selectedPage={selectedPage}
                    onPageChange={setSelectedPage}
                  />
                </Card>
              </div>

              {/* Matches Panel - Takes up 1/3 of space */}
              {keywordMatches.length > 0 && (
                <div className="lg:col-span-1">
                  <Card className="p-4 shadow-medium h-full">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">
                          Matches Found ({selectedPagesForExtraction.size} selected)
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
                          Auto-navigate
                        </label>
                      </div>
                      <div className="space-y-3 max-h-[600px] overflow-y-auto">
                        {/* Group matches by file */}
                        {Array.from(new Set(keywordMatches.map(m => m.fileIndex)))
                          .filter(idx => !isNaN(idx) && idx >= 0)
                          .sort((a, b) => a - b)
                          .map((fileIndex) => {
                            const fileMatches = keywordMatches.filter(m => m.fileIndex === fileIndex);
                            const fileName = pdfFiles[fileIndex]?.name || fileMatches[0]?.fileName || `Document ${fileIndex + 1}`;
                            const pages = Array.from(new Set(fileMatches.map(m => m.page))).sort((a, b) => a - b);
                            
                            return (
                              <div key={fileIndex} className="space-y-1">
                                <div className="text-xs font-semibold text-primary sticky top-0 bg-background py-1">
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
                    </div>
                  </Card>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};