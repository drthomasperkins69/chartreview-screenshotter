import { useState, useRef, useCallback } from "react";
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
}

export const PDFSignature = () => {
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [currentPdfIndex, setCurrentPdfIndex] = useState<number>(0);
  const [keywords, setKeywords] = useState<string>("");
  const [dateSearch, setDateSearch] = useState<string>("");
  const [searchMode, setSearchMode] = useState<"keyword" | "date">("keyword");
  const [suggestedKeywords, setSuggestedKeywords] = useState<string>("");
  const [matchingPages, setMatchingPages] = useState<Set<number>>(new Set());
  const [selectedPagesForExtraction, setSelectedPagesForExtraction] = useState<Set<number>>(new Set());
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
    setKeywordMatches(matches);
    const pages = new Set(matches.map(m => m.page));
    setMatchingPages(pages);
    setSelectedPagesForExtraction(pages); // Auto-select all found pages
    
    if (matches.length > 0) {
      toast(`Found keywords on ${pages.size} page(s)!`);
    } else {
      toast("No matching keywords found");
    }
    setIsSearching(false);
  }, []);

  const handleSearch = useCallback(() => {
    if (searchMode === "keyword" && !keywords.trim()) {
      toast("Please enter keywords to search");
      return;
    }
    if (searchMode === "date" && !dateSearch.trim()) {
      toast("Please enter a date to search");
      return;
    }
    setIsSearching(true);
    toast(searchMode === "keyword" ? "Searching for keywords..." : "Searching for dates...");
  }, [keywords, dateSearch, searchMode]);

  const handleDownload = useCallback(async () => {
    if (!currentPdf || selectedPagesForExtraction.size === 0) {
      toast("No pages selected for extraction");
      return;
    }
    
    try {
      toast("Creating PDF with selected pages...");
      
      const arrayBuffer = await currentPdf.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const newPdfDoc = await PDFDocument.create();
      
      const sortedPages = Array.from(selectedPagesForExtraction).sort((a, b) => a - b);
      
      for (const pageNum of sortedPages) {
        const [copiedPage] = await newPdfDoc.copyPages(pdfDoc, [pageNum - 1]);
        newPdfDoc.addPage(copiedPage);
      }
      
      const pdfBytes = await newPdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `extracted-pages-${Date.now()}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      
      toast(`Downloaded PDF with ${sortedPages.length} page(s)!`);
    } catch (error) {
      console.error("Error creating PDF:", error);
      toast("Failed to create PDF");
    }
  }, [currentPdf, selectedPagesForExtraction]);

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
    setDateSearch("");
    setSuggestedKeywords("");
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

  const handlePageClick = useCallback((pageNum: number) => {
    if (autoNavigate) {
      setSelectedPage(pageNum);
    }
  }, [autoNavigate]);

  const togglePageSelection = useCallback((pageNum: number) => {
    setSelectedPagesForExtraction(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pageNum)) {
        newSet.delete(pageNum);
      } else {
        newSet.add(pageNum);
      }
      return newSet;
    });
  }, []);

  const selectAllPages = useCallback(() => {
    setSelectedPagesForExtraction(new Set(matchingPages));
  }, [matchingPages]);

  const deselectAllPages = useCallback(() => {
    setSelectedPagesForExtraction(new Set());
  }, []);

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
                        }}
                        className="gap-2"
                        size="sm"
                      >
                        <FileText className="w-4 h-4" />
                        {file.name}
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

            {/* AI Assistant at Top */}
            <div className="h-[400px]">
              <AISearchAssistant 
                onKeywordSuggest={handleKeywordSuggest}
                currentKeywords={keywords}
              />
            </div>

            {/* Search Controls */}
            <Card className="p-4 shadow-medium">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex gap-2 mb-3">
                    <Button
                      variant={searchMode === "keyword" ? "default" : "outline"}
                      onClick={() => setSearchMode("keyword")}
                      size="sm"
                      className="flex-1"
                    >
                      Keyword Search
                    </Button>
                    <Button
                      variant={searchMode === "date" ? "default" : "outline"}
                      onClick={() => setSearchMode("date")}
                      size="sm"
                      className="flex-1"
                    >
                      Date Search
                    </Button>
                  </div>

                  {searchMode === "keyword" ? (
                    <>
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
                    </>
                  ) : (
                    <>
                      <Label htmlFor="dateSearch" className="text-sm font-medium mb-2 block">
                        Search Date
                      </Label>
                      <Input
                        id="dateSearch"
                        placeholder="e.g., 01/15/2023 or January 15, 2023"
                        value={dateSearch}
                        onChange={(e) => setDateSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="mb-2"
                      />
                      
                      <Button 
                        onClick={handleSearch} 
                        className="w-full gap-2"
                        disabled={isSearching || !dateSearch.trim()}
                      >
                        <Search className="w-4 h-4" />
                        {isSearching ? "Searching..." : "Search Dates"}
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2">
                        Supports: MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, Month DD YYYY, and more
                      </p>
                    </>
                  )}
                </div>

                {keywordMatches.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Matches Found ({selectedPagesForExtraction.size}/{matchingPages.size})</h3>
                      <div className="flex items-center gap-2">
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
                    </div>
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {Array.from(new Set(keywordMatches.map(m => m.page)))
                        .sort((a, b) => a - b)
                        .map((page) => {
                          const pageMatches = keywordMatches.filter(m => m.page === page);
                          const isSelected = selectedPagesForExtraction.has(page);
                          return (
                            <div 
                              key={page} 
                              className={`text-xs p-2 bg-muted rounded flex items-start gap-2 ${
                                selectedPage === page ? 'ring-2 ring-primary' : ''
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => togglePageSelection(page)}
                                className="mt-0.5 w-4 h-4 cursor-pointer"
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div 
                                className="flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => handlePageClick(page)}
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
                  </div>
                )}
              </div>
            </Card>

            {/* PDF Viewer */}
            <Card className="shadow-medium overflow-hidden">
              <PDFViewer
                file={currentPdf}
                keywords={searchMode === "keyword" ? keywords : ""}
                dateSearch={searchMode === "date" ? dateSearch : ""}
                matchingPages={matchingPages}
                isSearching={isSearching}
                onKeywordMatchesDetected={handleKeywordMatchesDetected}
                selectedPage={selectedPage}
                onPageChange={setSelectedPage}
              />
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};