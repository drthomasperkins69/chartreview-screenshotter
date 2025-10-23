import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, FileText, Trash2, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ReferenceDocument {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  page_count: number | null;
  description: string | null;
  created_at: string;
  is_active: boolean;
}

export const ReferenceDocuments = () => {
  const [documents, setDocuments] = useState<ReferenceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from("reference_documents")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error("Error fetching reference documents:", error);
      toast.error("Failed to load reference documents");
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== "application/pdf") {
        toast.error("Only PDF files are supported");
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Please select a file");
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Upload to storage
      const filePath = `reference/${Date.now()}-${selectedFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("pdf-files")
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Create database record
      const { error: dbError } = await supabase
        .from("reference_documents")
        .insert({
          file_name: selectedFile.name,
          file_path: filePath,
          file_size: selectedFile.size,
          description: description || null,
          uploaded_by: user.id,
        });

      if (dbError) throw dbError;

      toast.success("Reference document uploaded successfully");
      setSelectedFile(null);
      setDescription("");
      fetchDocuments();

      // Note: Embeddings need to be generated separately by processing the PDF
      toast.info("Upload complete. Process the document to generate embeddings for search.");
    } catch (error: any) {
      console.error("Error uploading document:", error);
      toast.error(error.message || "Failed to upload document");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: ReferenceDocument) => {
    if (!confirm(`Delete ${doc.file_name}?`)) return;

    try {
      // Delete embeddings first
      await supabase
        .from("document_embeddings")
        .delete()
        .eq("file_id", doc.id);

      // Delete from storage
      await supabase.storage
        .from("pdf-files")
        .remove([doc.file_path]);

      // Delete database record
      const { error } = await supabase
        .from("reference_documents")
        .delete()
        .eq("id", doc.id);

      if (error) throw error;

      toast.success("Reference document deleted");
      fetchDocuments();
    } catch (error: any) {
      console.error("Error deleting document:", error);
      toast.error(error.message || "Failed to delete document");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Reference Document</CardTitle>
          <CardDescription>
            Reference documents are used globally across all workspaces to validate and improve diagnosis suggestions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="file">PDF File</Label>
            <Input
              id="file"
              type="file"
              accept="application/pdf"
              onChange={handleFileSelect}
              disabled={uploading}
            />
            {selectedFile && (
              <p className="text-sm text-muted-foreground mt-1">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>
          
          <div>
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Brief description of this reference document..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={uploading}
            />
          </div>

          <Button onClick={handleUpload} disabled={!selectedFile || uploading} className="w-full">
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload Reference Document
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reference Documents</CardTitle>
          <CardDescription>
            {documents.length} document{documents.length !== 1 ? "s" : ""} available
          </CardDescription>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No reference documents uploaded yet
            </p>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-start justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-start gap-3 flex-1">
                    <FileText className="w-5 h-5 mt-0.5 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{doc.file_name}</p>
                      {doc.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {doc.description}
                        </p>
                      )}
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        {doc.page_count && <span>{doc.page_count} pages</span>}
                        {doc.file_size && (
                          <span>{(doc.file_size / 1024 / 1024).toFixed(2)} MB</span>
                        )}
                        <span>
                          Uploaded {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(doc)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
