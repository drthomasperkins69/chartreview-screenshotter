import { useState, useRef } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderOpen, Plus, LogOut, User, Trash2, FileText, ChevronRight, ChevronDown, Upload, Sparkles, CheckCircle2, X } from "lucide-react";
import dvaLogo from "@/assets/dva-logo.png";
import { uploadPdfToStorage, deletePdfFromStorage } from "@/utils/supabaseStorage";
import { toast } from "sonner";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import mammoth from "mammoth";
import DOMPurify from "dompurify";

interface WorkspaceSidebarProps {
  onFileSelect?: (fileId: string, filePath: string, fileName: string) => void;
}

export const WorkspaceSidebar = ({ onFileSelect }: WorkspaceSidebarProps) => {
  const { workspaces, selectedWorkspace, allWorkspaceFiles, selectWorkspace, createWorkspace, deleteWorkspace, refreshFiles } =
    useWorkspace();
  const { user, signOut } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPatientId, setNewPatientId] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set([selectedWorkspace?.id || ""]));
  const [uploadingForWorkspace, setUploadingForWorkspace] = useState<string | null>(null);
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const handleCreateWorkspace = async () => {
    if (!newName.trim()) return;

    setCreating(true);
    try {
      await createWorkspace(newName, newPatientId, newNotes);
      setIsCreateDialogOpen(false);
      setNewName("");
      setNewPatientId("");
      setNewNotes("");
    } catch (error) {
      console.error(error);
    }
    setCreating(false);
  };

  const handleDelete = async (e: React.MouseEvent, workspaceId: string) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this workspace?")) {
      await deleteWorkspace(workspaceId);
    }
  };

  const toggleWorkspace = (workspaceId: string) => {
    const newExpanded = new Set(expandedWorkspaces);
    if (newExpanded.has(workspaceId)) {
      newExpanded.delete(workspaceId);
    } else {
      newExpanded.add(workspaceId);
    }
    setExpandedWorkspaces(newExpanded);
  };

  const handleWorkspaceClick = (workspaceId: string) => {
    selectWorkspace(workspaceId);
    setExpandedWorkspaces(new Set([workspaceId]));
  };

  const convertHtmlToPdf = async (file: File): Promise<File> => {
    const html = await file.text();
    
    // Sanitize HTML to prevent XSS attacks
    const cleanHtml = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'div', 'span', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'img'],
      ALLOWED_ATTR: ['style', 'src', 'alt', 'width', 'height'],
      ALLOW_DATA_ATTR: false
    });
    
    const container = document.createElement('div');
    container.innerHTML = cleanHtml;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.width = '800px';
    document.body.appendChild(container);
    
    try {
      const canvas = await html2canvas(container, { scale: 2, useCORS: true, logging: false });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width, canvas.height] });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
      const pdfBlob = pdf.output('blob');
      return new File([pdfBlob], file.name.replace(/\.(html?|htm)$/i, '.pdf'), { type: 'application/pdf' });
    } finally {
      document.body.removeChild(container);
    }
  };

  const convertDocxToPdf = async (file: File): Promise<File> => {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const html = result.value;
    
    // Sanitize HTML to prevent XSS attacks
    const cleanHtml = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'div', 'span', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'img'],
      ALLOWED_ATTR: ['style', 'src', 'alt', 'width', 'height'],
      ALLOW_DATA_ATTR: false
    });
    
    const container = document.createElement('div');
    container.innerHTML = cleanHtml;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.width = '800px';
    container.style.padding = '40px';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.fontSize = '14px';
    container.style.lineHeight = '1.6';
    document.body.appendChild(container);
    
    try {
      const canvas = await html2canvas(container, { scale: 2, useCORS: true, logging: false });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4' });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const imgWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
      const pdfBlob = pdf.output('blob');
      return new File([pdfBlob], file.name.replace(/\.docx?$/i, '.pdf'), { type: 'application/pdf' });
    } finally {
      document.body.removeChild(container);
    }
  };

  const handleFileUpload = async (workspaceId: string, files: FileList | null) => {
    if (!files || files.length === 0 || !user) return;

    setUploadingForWorkspace(workspaceId);
    const filesArray = Array.from(files);
    
    try {
      toast.info(`Processing ${filesArray.length} file(s)...`);
      const processedFiles: File[] = [];

      for (const file of filesArray) {
        try {
          let processedFile = file;
          
          // Convert HTML to PDF
          if (file.type === 'text/html' || file.name.match(/\.(html?|htm)$/i)) {
            toast.info(`Converting ${file.name} to PDF...`);
            processedFile = await convertHtmlToPdf(file);
          }
          // Convert Word to PDF
          else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.match(/\.docx?$/i)) {
            toast.info(`Converting ${file.name} to PDF...`);
            processedFile = await convertDocxToPdf(file);
          }
          // Validate PDF
          else if (file.type !== 'application/pdf') {
            toast.error(`Unsupported file type: ${file.name}`);
            continue;
          }
          
          processedFiles.push(processedFile);
        } catch (error) {
          console.error(`Error processing ${file.name}:`, error);
          toast.error(`Failed to process ${file.name}`);
        }
      }

      if (processedFiles.length === 0) {
        toast.error('No valid files to upload');
        return;
      }

      // Upload all processed files
      toast.info('Uploading to workspace...');
      for (const file of processedFiles) {
        await uploadPdfToStorage(file, file.name, workspaceId, user.id);
      }
      
      toast.success(`${processedFiles.length} file(s) uploaded successfully`);
      await refreshFiles();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload files');
    } finally {
      setUploadingForWorkspace(null);
    }
  };

  const triggerFileUpload = (workspaceId: string) => {
    fileInputRefs.current[workspaceId]?.click();
  };

  const handleDeleteFile = async (e: React.MouseEvent, fileId: string, filePath: string, fileName: string) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${fileName}"?`)) return;

    try {
      const success = await deletePdfFromStorage(filePath, fileId);
      
      if (success) {
        toast.success('File deleted successfully');
        await refreshFiles();
      } else {
        toast.error('Failed to delete file');
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete file');
    }
  };

  return (
    <Sidebar className="border-r">
      <SidebarHeader className="border-b p-4">
        <div className="flex items-center gap-3">
          <img src={dvaLogo} alt="DVA" className="h-8" />
          <div>
            <h2 className="font-semibold text-sm">Medical Diagnosis</h2>
            <p className="text-xs text-muted-foreground">Patient Workspaces</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center justify-between px-2 py-2">
            <SidebarGroupLabel>Workspaces</SidebarGroupLabel>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Plus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Workspace</DialogTitle>
                  <DialogDescription>
                    Create a workspace to organize patient files
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Workspace Name *</label>
                    <Input
                      placeholder="e.g., John Doe - Case 2024"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Patient ID (Optional)</label>
                    <Input
                      placeholder="e.g., P-12345"
                      value={newPatientId}
                      onChange={(e) => setNewPatientId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Notes (Optional)</label>
                    <Textarea
                      placeholder="Case notes..."
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <Button onClick={handleCreateWorkspace} disabled={creating} className="w-full">
                    {creating ? "Creating..." : "Create Workspace"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <SidebarGroupContent>
            <ScrollArea className="h-[calc(100vh-300px)]">
              <SidebarMenu>
                {workspaces.map((workspace) => {
                  const isExpanded = expandedWorkspaces.has(workspace.id);
                  const isSelected = selectedWorkspace?.id === workspace.id;
                  const filesForWorkspace = allWorkspaceFiles[workspace.id] || [];
                  
                  return (
                    <Collapsible key={workspace.id} open={isExpanded} onOpenChange={() => toggleWorkspace(workspace.id)}>
                      <SidebarMenuItem>
                        <div className={`flex items-center w-full group ${isSelected ? 'bg-accent/50 rounded-md' : ''}`}>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 mr-1">
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </CollapsibleTrigger>
                          <SidebarMenuButton
                            isActive={isSelected}
                            onClick={() => handleWorkspaceClick(workspace.id)}
                            className="flex-1"
                          >
                            <FolderOpen className="h-4 w-4" />
                            <div className="flex-1 flex items-center justify-between min-w-0">
                              <div className="flex-1 min-w-0">
                                <div className={`text-sm truncate ${isSelected ? 'font-semibold' : 'font-medium'}`}>
                                  {workspace.name}
                                </div>
                                {workspace.patient_id && (
                                  <div className="text-xs text-muted-foreground">
                                    ID: {workspace.patient_id}
                                  </div>
                                )}
                              </div>
                            </div>
                          </SidebarMenuButton>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={(e) => handleDelete(e, workspace.id)}
                            title="Delete workspace"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <CollapsibleContent>
                          <div className="ml-8 mt-1 space-y-3">
                            {/* Files Section */}
                            <div>
                              <div className="text-xs font-semibold text-muted-foreground mb-2 px-2">
                                Files
                              </div>
                              
                              {/* Hidden file input */}
                              <input
                                ref={(el) => (fileInputRefs.current[workspace.id] = el)}
                                type="file"
                                accept=".pdf,.html,.htm,.docx,.doc"
                                multiple
                                onChange={(e) => handleFileUpload(workspace.id, e.target.files)}
                                className="hidden"
                              />
                              
                              {/* Upload button */}
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full justify-start text-xs h-8 mb-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  triggerFileUpload(workspace.id);
                                }}
                                disabled={uploadingForWorkspace === workspace.id}
                              >
                                <Upload className="h-3 w-3 mr-2" />
                                {uploadingForWorkspace === workspace.id ? 'Uploading...' : 'Upload Files'}
                              </Button>

                              {filesForWorkspace.length === 0 ? (
                                <div className="text-xs text-muted-foreground py-2 px-2">
                                  No files yet
                                </div>
                              ) : (
                                <div className="space-y-1">
                                   {filesForWorkspace.map((file) => (
                                    <div key={file.id} className="flex items-center gap-1 group">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="flex-1 justify-start text-xs h-8"
                                        onClick={() => onFileSelect?.(file.id, file.file_path, file.file_name)}
                                      >
                                        <FileText className="h-3 w-3 mr-2" />
                                        <span className="truncate flex-1 text-left">{file.file_name}</span>
                                        {file.ocr_completed && (
                                          <CheckCircle2 className="h-3 w-3 ml-1 text-green-500 flex-shrink-0" />
                                        )}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 opacity-0 group-hover:opacity-100 flex-shrink-0"
                                        onClick={(e) => handleDeleteFile(e, file.id, file.file_path, file.file_name)}
                                      >
                                        <X className="h-3 w-3 text-destructive" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                })}
              </SidebarMenu>
            </ScrollArea>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span className="truncate">{user?.email}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} className="h-8 w-8">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};
