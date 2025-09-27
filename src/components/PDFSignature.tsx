import { useState, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileUpload } from "./FileUpload";
import { PDFViewer } from "./PDFViewer";
import { SignatureCanvas } from "./SignatureCanvas";
import { Toolbar } from "./SignatureToolbar";
import { FileText, PenTool, Download, Upload } from "lucide-react";

interface Signature {
  id: string;
  dataURL: string;
  width: number;
  height: number;
}

interface PlacedSignature {
  id: string;
  signatureId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

interface SignatureField {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  filled: boolean;
  signatureId?: string;
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

export const PDFSignature = () => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [placedSignatures, setPlacedSignatures] = useState<PlacedSignature[]>([]);
  const [signatureFields, setSignatureFields] = useState<SignatureField[]>([]);
  const [autoFillFields, setAutoFillFields] = useState<AutoFillField[]>([]);
  const [userDetails, setUserDetails] = useState<UserDetails>({
    name: '',
    qualifications: '',
    date: new Date().toLocaleDateString()
  });
  const [selectedSignature, setSelectedSignature] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "sign" | "create" | "field">("view");
  const [showSignatureCanvas, setShowSignatureCanvas] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File) => {
    if (file.type !== "application/pdf") {
      toast("Please select a PDF file");
      return;
    }
    setPdfFile(file);
    setMode("view");
    toast("PDF loaded successfully!");
  }, []);

  const handleSignatureCreate = useCallback((dataURL: string) => {
    const signature: Signature = {
      id: Date.now().toString(),
      dataURL,
      width: 200,
      height: 80,
    };
    setSignatures(prev => [...prev, signature]);
    setShowSignatureCanvas(false);
    toast("Signature created!");
  }, []);

  const handleSignaturePlace = useCallback((x: number, y: number, page: number) => {
    if (mode === "field") {
      const signatureField: SignatureField = {
        id: Date.now().toString(),
        x,
        y,
        width: 200,
        height: 80,
        page,
        filled: false,
      };
      setSignatureFields(prev => [...prev, signatureField]);
      toast("Signature field added!");
      return;
    }
    
    if (!selectedSignature) return;
    
    const placedSignature: PlacedSignature = {
      id: Date.now().toString(),
      signatureId: selectedSignature,
      x,
      y,
      width: 200,
      height: 80,
      page,
    };
    setPlacedSignatures(prev => [...prev, placedSignature]);
    toast("Signature placed!");
  }, [selectedSignature, mode]);

  const handleFieldFill = useCallback((fieldId: string, signatureId: string) => {
    setSignatureFields(prev => 
      prev.map(field => 
        field.id === fieldId 
          ? { ...field, filled: true, signatureId }
          : field
      )
    );
    toast("Signature field filled!");
  }, []);

  const handleAutoFillDetected = useCallback((fields: AutoFillField[]) => {
    setAutoFillFields(fields);
    toast(`Found ${fields.length} auto-fill fields!`);
  }, []);

  const handleAutoFillAll = useCallback(() => {
    setAutoFillFields(prev => 
      prev.map(field => ({
        ...field,
        filled: true,
        value: field.type === 'name' ? userDetails.name :
               field.type === 'date' ? userDetails.date :
               field.type === 'qualifications' ? userDetails.qualifications :
               field.type === 'sign' ? 'SIGNATURE' : ''
      }))
    );
    toast("All fields auto-filled!");
  }, [userDetails]);

  const handleDownload = useCallback(async () => {
    if (!pdfFile || placedSignatures.length === 0) {
      toast("No signatures to save");
      return;
    }
    
    // Here we would implement the actual PDF modification using pdf-lib
    toast("Downloading signed PDF...");
  }, [pdfFile, placedSignatures]);

  const handleRemovePdf = useCallback(() => {
    setPdfFile(null);
    setPlacedSignatures([]);
    setSignatureFields([]);
    setSelectedSignature(null);
    setMode("view");
    toast("PDF removed");
  }, []);

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
                <h1 className="text-xl font-semibold text-foreground">PDF Signature</h1>
                <p className="text-sm text-muted-foreground">Professional document signing</p>
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
                    variant="secondary" 
                    onClick={() => setShowSignatureCanvas(true)}
                    className="gap-2"
                  >
                    <PenTool className="w-4 h-4" />
                    Create Signature
                  </Button>
                  <Button 
                    onClick={handleDownload}
                    disabled={placedSignatures.length === 0}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download
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
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar */}
            <div className="lg:col-span-1">
              <Card className="p-4 shadow-medium">
                <Toolbar
                  signatures={signatures}
                  selectedSignature={selectedSignature}
                  onSignatureSelect={setSelectedSignature}
                  mode={mode}
                  onModeChange={setMode}
                  onCreateSignature={() => setShowSignatureCanvas(true)}
                  autoFillFields={autoFillFields}
                  userDetails={userDetails}
                  onUserDetailsChange={setUserDetails}
                  onAutoFillAll={handleAutoFillAll}
                />
              </Card>
            </div>

            {/* PDF Viewer */}
            <div className="lg:col-span-3">
              <Card className="shadow-medium overflow-hidden">
                <PDFViewer
                  file={pdfFile}
                  placedSignatures={placedSignatures}
                  signatureFields={signatureFields}
                  autoFillFields={autoFillFields}
                  signatures={signatures}
                  mode={mode}
                  selectedSignature={selectedSignature}
                  userDetails={userDetails}
                  onSignaturePlace={handleSignaturePlace}
                  onFieldFill={handleFieldFill}
                  onAutoFillDetected={handleAutoFillDetected}
                />
              </Card>
            </div>
          </div>
        )}
      </main>

      {/* Signature Canvas Modal */}
      {showSignatureCanvas && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md p-6 shadow-large">
            <SignatureCanvas
              onSave={handleSignatureCreate}
              onCancel={() => setShowSignatureCanvas(false)}
            />
          </Card>
        </div>
      )}
    </div>
  );
};