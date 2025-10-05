import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const uploadPdfToStorage = async (
  file: Blob,
  fileName: string,
  workspaceId: string,
  userId: string
): Promise<string | null> => {
  try {
    const fileExt = fileName.split('.').pop();
    const filePath = `${userId}/${workspaceId}/${Date.now()}-${fileName}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('pdf-files')
      .upload(filePath, file, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      toast.error('Failed to upload PDF to storage');
      return null;
    }

    // Get file size
    const fileSize = file.size;

    // Save metadata to database
    const { data, error: dbError } = await supabase
      .from('workspace_files')
      .insert({
        workspace_id: workspaceId,
        file_name: fileName,
        file_path: filePath,
        file_size: fileSize,
        uploaded_by: userId
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      toast.error('Failed to save file metadata');
      return null;
    }

    toast.success(`${fileName} saved to workspace`);
    return filePath;
  } catch (error) {
    console.error('Error uploading PDF:', error);
    toast.error('Failed to upload PDF');
    return null;
  }
};

export const downloadPdfFromStorage = async (filePath: string): Promise<Blob | null> => {
  try {
    const { data, error } = await supabase.storage
      .from('pdf-files')
      .download(filePath);

    if (error) {
      console.error('Download error:', error);
      toast.error('Failed to download PDF');
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error downloading PDF:', error);
    toast.error('Failed to download PDF');
    return null;
  }
};

export const deletePdfFromStorage = async (filePath: string, fileId: string): Promise<boolean> => {
  try {
    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('pdf-files')
      .remove([filePath]);

    if (storageError) {
      console.error('Storage deletion error:', storageError);
      toast.error('Failed to delete PDF from storage');
      return false;
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from('workspace_files')
      .delete()
      .eq('id', fileId);

    if (dbError) {
      console.error('Database deletion error:', dbError);
      toast.error('Failed to delete file metadata');
      return false;
    }

    toast.success('File deleted successfully');
    return true;
  } catch (error) {
    console.error('Error deleting PDF:', error);
    toast.error('Failed to delete PDF');
    return false;
  }
};
