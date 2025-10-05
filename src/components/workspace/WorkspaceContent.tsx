import { useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/FileUpload";
import { PDFSignature } from "@/components/PDFSignature";
import { Upload, FileText, Calendar } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export const WorkspaceContent = () => {
  const { selectedWorkspace, workspaceFiles } = useWorkspace();
  const [showPdfTools, setShowPdfTools] = useState(false);

  if (!selectedWorkspace) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="p-8 max-w-md text-center">
          <h2 className="text-xl font-semibold mb-2">No Workspace Selected</h2>
          <p className="text-muted-foreground mb-4">
            Create or select a workspace to get started with patient file management
          </p>
        </Card>
      </div>
    );
  }

  if (showPdfTools) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="border-b p-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{selectedWorkspace.name}</h2>
            <p className="text-sm text-muted-foreground">PDF Analysis Tools</p>
          </div>
          <Button variant="outline" onClick={() => setShowPdfTools(false)}>
            Back to Files
          </Button>
        </div>
        <PDFSignature />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{selectedWorkspace.name}</h1>
            {selectedWorkspace.patient_id && (
              <p className="text-sm text-muted-foreground mt-1">
                Patient ID: {selectedWorkspace.patient_id}
              </p>
            )}
            {selectedWorkspace.notes && (
              <p className="text-sm text-muted-foreground mt-2">{selectedWorkspace.notes}</p>
            )}
          </div>
          <Button onClick={() => setShowPdfTools(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Open PDF Tools
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-6">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold mb-3">Workspace Files</h2>
            {workspaceFiles.length === 0 ? (
              <Card className="p-8 text-center">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-4">No files uploaded yet</p>
                <Button onClick={() => setShowPdfTools(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload First File
                </Button>
              </Card>
            ) : (
              <div className="grid gap-3">
                {workspaceFiles.map((file) => (
                  <Card key={file.id} className="p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-primary" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate">{file.file_name}</h3>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                          {file.page_count && <span>{file.page_count} pages</span>}
                          {file.file_size && (
                            <span>{(file.file_size / 1024 / 1024).toFixed(2)} MB</span>
                          )}
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(file.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};
