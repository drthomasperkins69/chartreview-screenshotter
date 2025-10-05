import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, FileText, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useDIA } from "@/contexts/DIAContext";
import { DIASettings } from "./DIASettings";

const FUNCTIONS_BASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  "https://hpclzzykgxolszduecqa.supabase.co";

interface PDFContent {
  fileName: string;
  fileIndex: number;
  pages: Array<{ pageNum: number; text: string }>;
}

interface DiagnosticAssessmentProps {
  pdfContent: PDFContent[];
  selectedPages: Set<string>; // Format: "fileIndex-pageNum"
}

export const DiagnosticAssessment = ({ pdfContent, selectedPages }: DiagnosticAssessmentProps) => {
  const { diaInstructions } = useDIA();
  const [localInstructions, setLocalInstructions] = useState(diaInstructions);
  const [selectedModel, setSelectedModel] = useState<"gemini" | "claude">("gemini");
  const [isGenerating, setIsGenerating] = useState(false);
  const [assessment, setAssessment] = useState<string>("");

  // Update local instructions when global instructions change
  useEffect(() => {
    setLocalInstructions(diaInstructions);
  }, [diaInstructions]);

  const handleGenerate = async () => {
    if (!localInstructions.trim()) {
      toast.error("Please enter DIA instructions");
      return;
    }

    if (selectedPages.size === 0) {
      toast.error("Please select at least one page to assess");
      return;
    }

    setIsGenerating(true);
    setAssessment("");

    try {
      // Extract content for selected pages
      const selectedContent = Array.from(selectedPages).map(key => {
        const [fileIndexStr, pageNumStr] = key.split('-');
        const fileIndex = parseInt(fileIndexStr);
        const pageNum = parseInt(pageNumStr);
        
        const pdfDoc = pdfContent.find(p => p.fileIndex === fileIndex);
        const page = pdfDoc?.pages.find(p => p.pageNum === pageNum);
        
        return {
          fileName: pdfDoc?.fileName || `Document ${fileIndex + 1}`,
          fileIndex,
          pageNum,
          text: page?.text || ""
        };
      });

      const resp = await fetch(`${FUNCTIONS_BASE}/functions/v1/generate-diagnostic-assessment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructions: localInstructions,
          selectedContent,
          model: selectedModel
        }),
      });

      if (!resp.ok) {
        if (resp.status === 429) throw new Error("Rate limits exceeded, please try again later.");
        if (resp.status === 402) throw new Error("AI credits exhausted. Please add credits.");
        const errorText = await resp.text();
        throw new Error(`Assessment generation error: ${errorText}`);
      }

      const data = await resp.json();
      setAssessment(data.assessment);
      toast.success("Diagnostic assessment generated successfully!");
    } catch (error) {
      console.error("Error generating assessment:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate assessment");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(assessment);
    toast.success("Assessment copied to clipboard!");
  };

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">DIA Instructions</Label>
          <DIASettings />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Label htmlFor="model-select" className="text-sm font-medium mb-2 block">
              AI Model
            </Label>
            <Select value={selectedModel} onValueChange={(value: "gemini" | "claude") => setSelectedModel(value)}>
              <SelectTrigger id="model-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Google Gemini (Free)
                  </div>
                </SelectItem>
                <SelectItem value="claude">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Claude (Paid)
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="dia-instructions" className="text-sm font-medium mb-2 block">
            DIA
          </Label>
          <Textarea
            id="dia-instructions"
            placeholder="Paste your diagnostic assessment instructions here..."
            value={localInstructions}
            onChange={(e) => setLocalInstructions(e.target.value)}
            className="min-h-[150px] font-mono text-sm"
          />
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{selectedPages.size} page{selectedPages.size !== 1 ? 's' : ''} selected</span>
        </div>

        <Button 
          onClick={handleGenerate} 
          disabled={isGenerating || !localInstructions.trim() || selectedPages.size === 0}
          className="w-full gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating Assessment...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate Diagnostic Assessment
            </>
          )}
        </Button>
      </div>

      {assessment && (
        <Card className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b p-3 flex items-center justify-between">
            <h3 className="font-semibold text-sm">Assessment Results</h3>
            <Button size="sm" variant="outline" onClick={handleCopy}>
              Copy
            </Button>
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <pre className="whitespace-pre-wrap text-sm">{assessment}</pre>
            </div>
          </ScrollArea>
        </Card>
      )}

      {!assessment && !isGenerating && (
        <Card className="flex-1 flex items-center justify-center text-center p-6 border-dashed">
          <div className="space-y-2">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Enter DIA instructions and click Generate to create your diagnostic assessment
            </p>
          </div>
        </Card>
      )}
    </div>
  );
};
