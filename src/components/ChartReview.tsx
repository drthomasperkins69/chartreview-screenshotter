import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Settings, FileText } from "lucide-react";
import { toast } from "sonner";

interface ChartReviewProps {
  onSendInstruction: (instruction: string, label: string) => void;
}

interface ChartSection {
  id: string;
  label: string;
  instruction: string;
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

export const ChartReview = ({ onSendInstruction }: ChartReviewProps) => {
  const [sections, setSections] = useState<ChartSection[]>(DEFAULT_SECTIONS);
  const [editingSection, setEditingSection] = useState<ChartSection | null>(null);
  const [tempInstruction, setTempInstruction] = useState("");

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
    onSendInstruction(section.instruction, section.label);
    toast.info(`Executing ${section.label}`);
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
            >
              {section.label}
            </Button>
            
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
