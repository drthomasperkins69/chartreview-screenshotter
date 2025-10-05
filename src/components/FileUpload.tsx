import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Upload, FileText } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import mammoth from "mammoth";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
}

export const FileUpload = ({ onFileSelect }: FileUploadProps) => {
  const [isConverting, setIsConverting] = useState(false);

  const convertHtmlToPdf = async (file: File): Promise<File> => {
    const html = await file.text();
    
    // Create a temporary container
    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.width = '800px';
    document.body.appendChild(container);
    
    try {
      // Convert HTML to canvas
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false
      });
      
      // Create PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
      
      // Convert to blob and create File
      const pdfBlob = pdf.output('blob');
      const pdfFile = new File([pdfBlob], file.name.replace(/\.(html?|htm)$/i, '.pdf'), {
        type: 'application/pdf'
      });
      
      return pdfFile;
    } finally {
      document.body.removeChild(container);
    }
  };

  const convertDocxToPdf = async (file: File): Promise<File> => {
    const arrayBuffer = await file.arrayBuffer();
    
    // Convert DOCX to HTML using mammoth
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const html = result.value;
    
    // Create a temporary container with the HTML
    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.width = '800px';
    container.style.padding = '40px';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.fontSize = '14px';
    container.style.lineHeight = '1.6';
    document.body.appendChild(container);
    
    try {
      // Convert HTML to canvas
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false
      });
      
      // Create PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: 'a4'
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const imgWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
      
      // Convert to blob and create File
      const pdfBlob = pdf.output('blob');
      const pdfFile = new File([pdfBlob], file.name.replace(/\.docx?$/i, '.pdf'), {
        type: 'application/pdf'
      });
      
      return pdfFile;
    } finally {
      document.body.removeChild(container);
    }
  };

  const processFile = async (file: File) => {
    if (isConverting) return;
    
    setIsConverting(true);
    try {
      let processedFile = file;
      
      // Check file type and convert if necessary
      if (file.type === 'text/html' || file.name.match(/\.(html?|htm)$/i)) {
        toast.info("Converting HTML to PDF...");
        processedFile = await convertHtmlToPdf(file);
        toast.success("HTML converted to PDF successfully!");
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.match(/\.docx?$/i)) {
        toast.info("Converting Word document to PDF...");
        processedFile = await convertDocxToPdf(file);
        toast.success("Word document converted to PDF successfully!");
      } else if (file.type !== 'application/pdf') {
        toast.error("Unsupported file type. Please upload PDF, HTML, or Word documents.");
        setIsConverting(false);
        return;
      }
      
      onFileSelect(processedFile);
    } catch (error) {
      console.error("Error processing file:", error);
      toast.error("Failed to convert file. Please try again.");
    } finally {
      setIsConverting(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const file = files[0];
    if (file && !isConverting) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && !isConverting) {
      processFile(file);
    }
  };

  return (
    <Card className="w-full max-w-2xl p-12 border-2 border-dashed border-border hover:border-primary/50 transition-colors shadow-medium">
      <div
        className="flex flex-col items-center justify-center text-center cursor-pointer"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => !isConverting && document.getElementById('file-input')?.click()}
      >
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary-subtle mb-4">
          <Upload className="w-8 h-8 text-primary" />
        </div>
        
        <h3 className="text-xl font-semibold text-foreground mb-2">
          {isConverting ? "Converting document..." : "Upload your document"}
        </h3>
        
        <p className="text-muted-foreground mb-6 max-w-md">
          {isConverting 
            ? "Please wait while we convert your document to PDF..." 
            : "Drag and drop your file here, or click to browse. HTML and Word documents will be automatically converted to PDF."}
        </p>
        
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <FileText className="w-4 h-4" />
          {isConverting ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Converting...
            </div>
          ) : (
            "Supports PDF, HTML, and Word documents"
          )}
        </div>
        
        <input
          id="file-input"
          type="file"
          accept=".pdf,.html,.htm,.docx,.doc"
          onChange={handleFileInputChange}
          className="hidden"
          disabled={isConverting}
        />
      </div>
    </Card>
  );
};
