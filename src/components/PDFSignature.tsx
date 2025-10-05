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
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [keywords, setKeywords] = useState<string>("");
  const [dateSearch, setDateSearch] = useState<string>("");
  const [searchMode, setSearchMode] = useState<"keyword" | "date">("keyword");
  const [suggestedKeywords, setSuggestedKeywords] = useState<string>("");
  const [matchingPages, setMatchingPages] = useState<Set<number>>(new Set());
  const [keywordMatches, setKeywordMatches] = useState<KeywordMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File) => {
    if (file.type !== "application/pdf") {
      toast("Please select a PDF file");
      return;
    }
    setPdfFile(file);
    setMatchingPages(new Set());
    setKeywordMatches([]);
    toast("PDF loaded successfully!");
  }, []);

  const handleKeywordMatchesDetected = useCallback((matches: KeywordMatch[]) => {
    setKeywordMatches(matches);
    const pages = new Set(matches.map(m => m.page));
    setMatchingPages(pages);
    
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
    if (!pdfFile || matchingPages.size === 0) {
      toast("No matching pages to extract");
      return;
    }
    
    try {
      toast("Creating PDF with matching pages...");
      
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const newPdfDoc = await PDFDocument.create();
      
      const sortedPages = Array.from(matchingPages).sort((a, b) => a - b);
      
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
  }, [pdfFile, matchingPages]);

  const handleRemovePdf = useCallback(() => {
    setPdfFile(null);
    setMatchingPages(new Set());
    setKeywordMatches([]);
    setKeywords("");
    setDateSearch("");
    setSuggestedKeywords("");
    toast("PDF removed");
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
              {!pdfFile ? (
                <Button onClick={triggerFileUpload} className="gap-2">
                  <Upload className="w-4 h-4" />
                  Upload PDF
                </Button>
              ) : (
                <>
                  <Button 
                    variant="outline" 
                    onClick={handleRemovePdf}
                    className="gap-2"
                  >
                    Remove PDF
                  </Button>
                  <Button 
                    onClick={handleDownload}
                    disabled={matchingPages.size === 0}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download Extracted Pages
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {!pdfFile ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <FileUpload onFileSelect={handleFileSelect} />
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
              className="hidden"
            />
          </div>
        ) : (
          <div className="space-y-6">
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
                    <h3 className="text-sm font-semibold">Matches Found</h3>
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {Array.from(new Set(keywordMatches.map(m => m.page)))
                        .sort((a, b) => a - b)
                        .map((page) => {
                          const pageMatches = keywordMatches.filter(m => m.page === page);
                          return (
                            <div key={page} className="text-xs p-2 bg-muted rounded">
                              <div className="font-medium">Page {page}</div>
                              {pageMatches.map((match, idx) => (
                                <div key={idx} className="text-muted-foreground">
                                  "{match.keyword}" ({match.count}x)
                                </div>
                              ))}
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
                file={pdfFile}
                keywords={searchMode === "keyword" ? keywords : ""}
                dateSearch={searchMode === "date" ? dateSearch : ""}
                matchingPages={matchingPages}
                isSearching={isSearching}
                onKeywordMatchesDetected={handleKeywordMatchesDetected}
              />
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};