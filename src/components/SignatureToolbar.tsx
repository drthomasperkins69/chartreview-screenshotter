import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PenTool, MousePointer, Plus, Trash2, Square, FileCheck } from "lucide-react";

interface Signature {
  id: string;
  dataURL: string;
  width: number;
  height: number;
}

interface AutoFillField {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  type: 'name' | 'date' | 'sign' | 'qualifications';
  filled: boolean;
  value?: string;
}

interface UserDetails {
  name: string;
  qualifications: string;
  date: string;
}

interface ToolbarProps {
  signatures: Signature[];
  selectedSignature: string | null;
  onSignatureSelect: (id: string | null) => void;
  mode: "view" | "sign" | "create" | "field";
  onModeChange: (mode: "view" | "sign" | "create" | "field") => void;
  onCreateSignature: () => void;
  autoFillFields: AutoFillField[];
  userDetails: UserDetails;
  onUserDetailsChange: (details: UserDetails) => void;
  onAutoFillAll: () => void;
}

export const Toolbar = ({
  signatures,
  selectedSignature,
  onSignatureSelect,
  mode,
  onModeChange,
  onCreateSignature,
  autoFillFields,
  userDetails,
  onUserDetailsChange,
  onAutoFillAll,
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
            variant={mode === "field" ? "default" : "secondary"}
            size="sm"
            onClick={() => onModeChange("field")}
            className="w-full justify-start gap-2"
          >
            <Square className="w-4 h-4" />
            Add Fields
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

        {mode === "field" && (
          <Card className="mt-3 p-3 bg-secondary-subtle border-secondary/20">
            <p className="text-xs text-secondary font-medium">
              📝 Click on the PDF to add signature fields
            </p>
          </Card>
        )}

        {mode === "sign" && selectedSignature && (
          <Card className="mt-3 p-3 bg-primary-subtle border-primary/20">
            <p className="text-xs text-primary font-medium">
              🎯 Click on the PDF where you want to place your signature
            </p>
          </Card>
        )}
      </div>

      {/* Auto-Fill Section */}
      {autoFillFields.length > 0 && (
        <div>
          <h3 className="font-semibold text-foreground mb-3">Auto-Fill Details</h3>
          <Card className="p-4 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">Name</Label>
              <Input
                id="name"
                value={userDetails.name}
                onChange={(e) => onUserDetailsChange({ ...userDetails, name: e.target.value })}
                placeholder="Enter your full name"
                className="text-sm"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="qualifications" className="text-sm font-medium">Qualifications</Label>
              <Input
                id="qualifications"
                value={userDetails.qualifications}
                onChange={(e) => onUserDetailsChange({ ...userDetails, qualifications: e.target.value })}
                placeholder="Enter qualifications"
                className="text-sm"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="date" className="text-sm font-medium">Date</Label>
              <Input
                id="date"
                value={userDetails.date}
                onChange={(e) => onUserDetailsChange({ ...userDetails, date: e.target.value })}
                placeholder="Enter date"
                className="text-sm"
              />
            </div>
            
            <Button 
              onClick={onAutoFillAll}
              size="sm"
              className="w-full gap-2"
              disabled={!userDetails.name.trim()}
            >
              <FileCheck className="w-4 h-4" />
              Fill All Fields
            </Button>
            
            <div className="text-xs text-muted-foreground">
              Found {autoFillFields.length} auto-fill field{autoFillFields.length !== 1 ? 's' : ''}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};