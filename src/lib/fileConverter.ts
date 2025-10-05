import html2pdf from 'html2pdf.js';
import mammoth from 'mammoth';
import { PDFDocument } from 'pdf-lib';

export async function convertToPdf(file: File): Promise<File> {
  const fileType = file.type;
  const fileName = file.name.toLowerCase();

  // If it's already a PDF, return as is
  if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
    return file;
  }

  // Convert HTML files
  if (fileType === 'text/html' || fileName.endsWith('.html') || fileName.endsWith('.htm')) {
    return await convertHtmlToPdf(file);
  }

  // Convert Word files
  if (
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileType === 'application/msword' ||
    fileName.endsWith('.docx') ||
    fileName.endsWith('.doc')
  ) {
    return await convertWordToPdf(file);
  }

  throw new Error(`Unsupported file type: ${fileType || 'unknown'}`);
}

async function convertHtmlToPdf(file: File): Promise<File> {
  try {
    const htmlContent = await file.text();
    
    // Create a temporary container
    const container = document.createElement('div');
    container.innerHTML = htmlContent;
    container.style.width = '210mm'; // A4 width
    container.style.padding = '20mm';
    document.body.appendChild(container);

    const opt = {
      margin: 10,
      filename: file.name.replace(/\.(html|htm)$/i, '.pdf'),
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
    };

    const pdfBlob = await html2pdf().set(opt).from(container).outputPdf('blob');
    
    // Clean up
    document.body.removeChild(container);

    return new File([pdfBlob], file.name.replace(/\.(html|htm)$/i, '.pdf'), {
      type: 'application/pdf'
    });
  } catch (error) {
    console.error('Error converting HTML to PDF:', error);
    throw new Error('Failed to convert HTML file to PDF');
  }
}

async function convertWordToPdf(file: File): Promise<File> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Extract HTML from Word document
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const htmlContent = result.value;

    // Create a temporary container with better styling
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.6; color: #000;">
        ${htmlContent}
      </div>
    `;
    container.style.width = '210mm'; // A4 width
    container.style.padding = '20mm';
    document.body.appendChild(container);

    const opt = {
      margin: 10,
      filename: file.name.replace(/\.(docx|doc)$/i, '.pdf'),
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
    };

    const pdfBlob = await html2pdf().set(opt).from(container).outputPdf('blob');
    
    // Clean up
    document.body.removeChild(container);

    return new File([pdfBlob], file.name.replace(/\.(docx|doc)$/i, '.pdf'), {
      type: 'application/pdf'
    });
  } catch (error) {
    console.error('Error converting Word to PDF:', error);
    throw new Error('Failed to convert Word document to PDF');
  }
}
