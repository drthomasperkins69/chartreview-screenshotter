import { useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Upload, FileText } from "lucide-react";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
}

export const FileUpload = ({ onFileSelect }: FileUploadProps) => {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      const pdfFile = files.find(file => file.type === "application/pdf");
      if (pdfFile) {
        onFileSelect(pdfFile);
      }
    },
    [onFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  return (
    <Card className="w-full max-w-2xl p-12 border-2 border-dashed border-border hover:border-primary/50 transition-colors shadow-medium">
      <div
        className="flex flex-col items-center justify-center text-center cursor-pointer"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary-subtle mb-4">
          <Upload className="w-8 h-8 text-primary" />
        </div>
        
        <h3 className="text-xl font-semibold text-foreground mb-2">
          Upload your PDF document
        </h3>
        
        <p className="text-muted-foreground mb-6 max-w-md">
          Drag and drop your PDF file here, or click to browse and select a file from your computer.
        </p>
        
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <FileText className="w-4 h-4" />
          Supports PDF files of any size
        </div>
        
        <input
          id="file-input"
          type="file"
          accept=".pdf"
          onChange={handleFileInputChange}
          className="hidden"
        />
      </div>
    </Card>
  );
};