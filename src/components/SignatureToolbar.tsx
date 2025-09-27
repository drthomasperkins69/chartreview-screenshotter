import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PenTool, MousePointer, Plus, Trash2 } from "lucide-react";

interface Signature {
  id: string;
  dataURL: string;
  width: number;
  height: number;
}

interface ToolbarProps {
  signatures: Signature[];
  selectedSignature: string | null;
  onSignatureSelect: (id: string | null) => void;
  mode: "view" | "sign" | "create";
  onModeChange: (mode: "view" | "sign" | "create") => void;
  onCreateSignature: () => void;
}

export const Toolbar = ({
  signatures,
  selectedSignature,
  onSignatureSelect,
  mode,
  onModeChange,
  onCreateSignature,
}: ToolbarProps) => {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-foreground mb-3">Tools</h3>
        <div className="space-y-2">
          <Button
            variant={mode === "view" ? "default" : "secondary"}
            size="sm"
            onClick={() => onModeChange("view")}
            className="w-full justify-start gap-2"
          >
            <MousePointer className="w-4 h-4" />
            View Mode
          </Button>
          
          <Button
            variant={mode === "sign" ? "default" : "secondary"}
            size="sm"
            onClick={() => onModeChange("sign")}
            className="w-full justify-start gap-2"
            disabled={signatures.length === 0}
          >
            <PenTool className="w-4 h-4" />
            Sign Mode
          </Button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground">Signatures</h3>
          <Button size="sm" onClick={onCreateSignature} className="gap-1">
            <Plus className="w-3 h-3" />
            New
          </Button>
        </div>

        {signatures.length === 0 ? (
          <Card className="p-3 text-center">
            <p className="text-sm text-muted-foreground">No signatures yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create your first signature to start signing documents
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {signatures.map((signature) => (
              <Card
                key={signature.id}
                className={`p-2 cursor-pointer transition-colors ${
                  selectedSignature === signature.id
                    ? "ring-2 ring-primary bg-primary-subtle"
                    : "hover:bg-accent"
                }`}
                onClick={() => {
                  if (selectedSignature === signature.id) {
                    onSignatureSelect(null);
                  } else {
                    onSignatureSelect(signature.id);
                    onModeChange("sign");
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <img
                    src={signature.dataURL}
                    alt="Signature"
                    className="h-8 w-auto max-w-[120px] object-contain bg-white rounded border"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      // TODO: Implement signature deletion
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 h-auto"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                {selectedSignature === signature.id && (
                  <p className="text-xs text-primary mt-1">Selected</p>
                )}
              </Card>
            ))}
          </div>
        )}

        {mode === "sign" && selectedSignature && (
          <Card className="mt-3 p-3 bg-primary-subtle border-primary/20">
            <p className="text-xs text-primary font-medium">
              🎯 Click on the PDF where you want to place your signature
            </p>
          </Card>
        )}
      </div>
    </div>
  );
};