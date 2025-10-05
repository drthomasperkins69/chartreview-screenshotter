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
    if (!keywords.trim()) {
      toast("Please enter keywords to search");
      return;
    }
    setIsSearching(true);
    toast("Searching for keywords...");
  }, [keywords]);

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
              <AISearchAssistant onKeywordSuggest={handleKeywordSuggest} />
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Search Controls */}
              <div className="lg:col-span-1">
              <Card className="p-4 shadow-medium space-y-4">
                <div>
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
                  
                  {suggestedKeywords && (
                    <Button 
                      onClick={useSuggestedKeywords}
                      variant="outline"
                      className="w-full gap-2 mb-2"
                      size="sm"
                    >
                      Use Keywords
                    </Button>
                  )}
                  
                  <Button 
                    onClick={handleSearch} 
                    className="w-full gap-2"
                    disabled={isSearching || !keywords.trim()}
                  >
                    <Search className="w-4 h-4" />
                    {isSearching ? "Searching..." : "Search PDF"}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Separate multiple keywords with commas
                  </p>
                </div>

                {keywordMatches.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Matches Found</h3>
                    <div className="space-y-1 max-h-96 overflow-y-auto">
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
              </Card>
            </div>

              {/* PDF Viewer */}
              <div className="lg:col-span-3">
              <Card className="shadow-medium overflow-hidden">
                <PDFViewer
                  file={pdfFile}
                  keywords={keywords}
                  matchingPages={matchingPages}
                  isSearching={isSearching}
                  onKeywordMatchesDetected={handleKeywordMatchesDetected}
                />
              </Card>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};