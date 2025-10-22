import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Settings, FileText, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } from "docx";
import { saveAs } from "file-saver";

interface ChartReviewProps {
  onSendInstruction: (instruction: string, label: string) => void;
  aiResponse?: { label: string; content: string } | null;
  onResponseProcessed?: () => void;
  isProcessing?: boolean;
}

interface ChartSection {
  id: string;
  label: string;
  instruction: string;
  response?: string;
  isGenerating?: boolean;
}

const DEFAULT_SECTIONS: ChartSection[] = [
  { id: "intro", label: "Intro", instruction: "Generate a comprehensive introduction for this patient's chart review, including patient demographics and overview." },
  { id: "risk-factors", label: "Risk Factor Analysis", instruction: "Analyze and summarize all risk factors identified in the medical records." },
  { id: "imaging", label: "Imaging", instruction: "Summarize all imaging studies, findings, and their clinical significance." },
  { id: "surgeries", label: "Surgeries", instruction: "List and describe all surgical procedures, including dates and outcomes." },
  { id: "conditions", label: "Conditions", instruction: "Catalog all diagnosed medical conditions with relevant details." },
  { id: "condition-summary", label: "Condition Summary", instruction: "Provide a comprehensive summary of all conditions and their interrelationships." },
  { id: "timelines", label: "Timelines", instruction: "Create a chronological timeline of significant medical events." },
];

export const ChartReview = ({ onSendInstruction, aiResponse, onResponseProcessed, isProcessing }: ChartReviewProps) => {
  const [sections, setSections] = useState<ChartSection[]>(DEFAULT_SECTIONS);
  const [editingSection, setEditingSection] = useState<ChartSection | null>(null);
  const [tempInstruction, setTempInstruction] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // Handle AI response when it comes back
  useEffect(() => {
    if (aiResponse && activeSection) {
      const section = sections.find(s => s.id === activeSection);
      if (section?.label === aiResponse.label) {
        setSections(sections.map(s => 
          s.id === activeSection 
            ? { ...s, response: aiResponse.content, isGenerating: false }
            : s
        ));
        setActiveSection(null);
        onResponseProcessed?.();
        toast.success(`${aiResponse.label} generated successfully`);
      }
    }
  }, [aiResponse, activeSection]);

  const handleOpenEdit = (section: ChartSection) => {
    setEditingSection(section);
    setTempInstruction(section.instruction);
  };

  const handleSaveInstruction = () => {
    if (!editingSection) return;

    setSections(sections.map(s => 
      s.id === editingSection.id 
        ? { ...s, instruction: tempInstruction }
        : s
    ));
    
    toast.success(`Instruction updated for ${editingSection.label}`);
    setEditingSection(null);
  };

  const handleExecuteInstruction = (section: ChartSection) => {
    setSections(sections.map(s => 
      s.id === section.id 
        ? { ...s, isGenerating: true }
        : s
    ));
    setActiveSection(section.id);
    onSendInstruction(section.instruction, section.label);
    toast.info(`Generating ${section.label}...`);
  };

  const handleDownloadWord = async (section: ChartSection) => {
    if (!section.response) {
      toast.error("No content to download");
      return;
    }

    try {
      // Create a Word document
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: [
              new Paragraph({
                text: section.label,
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.CENTER,
                spacing: {
                  after: 400,
                },
              }),
              new Paragraph({
                text: "",
                spacing: { after: 200 },
              }),
              // Split content into paragraphs
              ...section.response.split('\n\n').map(para => 
                new Paragraph({
                  children: [
                    new TextRun({
                      text: para,
                      size: 24,
                    }),
                  ],
                  spacing: {
                    after: 200,
                  },
                })
              ),
            ],
          },
        ],
      });

      // Generate and download
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${section.label.replace(/\s+/g, '_')}.docx`);
      toast.success(`${section.label} downloaded`);
    } catch (error) {
      console.error("Error generating Word document:", error);
      toast.error("Failed to generate document");
    }
  };

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">Chart Review</h2>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {sections.map((section) => (
          <div key={section.id} className="flex items-center gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleExecuteInstruction(section)}
              disabled={section.isGenerating || isProcessing}
            >
              {section.isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {section.label}
                </>
              ) : (
                section.label
              )}
            </Button>
            
            {section.response && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDownloadWord(section)}
                title="Download Word document"
              >
                <Download className="w-4 h-4 text-green-600" />
              </Button>
            )}
            
            <Dialog open={editingSection?.id === section.id} onOpenChange={(open) => !open && setEditingSection(null)}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleOpenEdit(section)}
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Edit Instruction: {section.label}</DialogTitle>
                  <DialogDescription>
                    Customize the AI instruction for this chart review section
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 mt-4">
                  <Textarea
                    value={tempInstruction}
                    onChange={(e) => setTempInstruction(e.target.value)}
                    placeholder="Enter AI instruction..."
                    rows={8}
                    className="resize-y"
                  />
                  
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setEditingSection(null)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSaveInstruction}>
                      Save Instruction
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        ))}
      </div>
    </Card>
  );
};
