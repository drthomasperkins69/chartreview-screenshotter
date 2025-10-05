import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Settings, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useDIA } from "@/contexts/DIAContext";

export const DIASettings = () => {
  const { diaInstructions, setDiaInstructions, resetToDefault } = useDIA();
  const [localInstructions, setLocalInstructions] = useState(diaInstructions);
  const [isOpen, setIsOpen] = useState(false);

  const handleSave = () => {
    setDiaInstructions(localInstructions);
    toast.success("DIA instructions updated");
    setIsOpen(false);
  };

  const handleReset = () => {
    resetToDefault();
    setLocalInstructions(diaInstructions);
    toast.success("DIA instructions reset to default");
  };

  const handleOpen = () => {
    setLocalInstructions(diaInstructions);
    setIsOpen(true);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" onClick={handleOpen}>
          <Settings className="w-4 h-4" />
          DIA Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>DIA Instructions Settings</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto space-y-4">
          <div>
            <Label htmlFor="dia-settings" className="text-sm font-medium mb-2 block">
              Edit Default DIA Instructions
            </Label>
            <Textarea
              id="dia-settings"
              value={localInstructions}
              onChange={(e) => setLocalInstructions(e.target.value)}
              className="min-h-[400px] font-mono text-sm"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleReset} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Reset to Default
          </Button>
          <Button onClick={handleSave}>
            Save Instructions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
