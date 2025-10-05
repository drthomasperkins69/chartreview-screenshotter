import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { toast } from "sonner";

interface Workspace {
  id: string;
  name: string;
  patient_id: string | null;
  notes: string | null;
  created_at: string;
}

interface WorkspaceFile {
  id: string;
  workspace_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  page_count: number | null;
  created_at: string;
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  selectedWorkspace: Workspace | null;
  workspaceFiles: WorkspaceFile[];
  allWorkspaceFiles: Record<string, WorkspaceFile[]>;
  selectWorkspace: (workspaceId: string) => void;
  createWorkspace: (name: string, patientId?: string, notes?: string) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  refreshFiles: () => Promise<void>;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [allWorkspaceFiles, setAllWorkspaceFiles] = useState<Record<string, WorkspaceFile[]>>({});
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const refreshWorkspaces = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("patient_workspaces")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching workspaces:", error);
      toast.error("Failed to load workspaces");
    } else {
      setWorkspaces(data || []);
      if (data && data.length > 0 && !selectedWorkspace) {
        setSelectedWorkspace(data[0]);
      }
      
      // Fetch files for all workspaces
      if (data && data.length > 0) {
        const filesPromises = data.map(workspace =>
          supabase
            .from("workspace_files")
            .select("*")
            .eq("workspace_id", workspace.id)
            .order("created_at", { ascending: false })
        );
        
        const filesResults = await Promise.all(filesPromises);
        const filesMap: Record<string, WorkspaceFile[]> = {};
        
        data.forEach((workspace, index) => {
          filesMap[workspace.id] = filesResults[index].data || [];
        });
        
        setAllWorkspaceFiles(filesMap);
      }
    }
    setLoading(false);
  };

  const refreshFiles = async () => {
    if (!selectedWorkspace) return;

    const { data, error } = await supabase
      .from("workspace_files")
      .select("*")
      .eq("workspace_id", selectedWorkspace.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching files:", error);
      toast.error("Failed to load files");
    } else {
      setWorkspaceFiles(data || []);
      // Also update the all files map
      setAllWorkspaceFiles(prev => ({
        ...prev,
        [selectedWorkspace.id]: data || []
      }));
    }
  };

  useEffect(() => {
    if (user) {
      refreshWorkspaces();
    }
  }, [user]);

  useEffect(() => {
    if (selectedWorkspace) {
      refreshFiles();
    }
  }, [selectedWorkspace]);

  const selectWorkspace = (workspaceId: string) => {
    const workspace = workspaces.find((w) => w.id === workspaceId);
    if (workspace) {
      setSelectedWorkspace(workspace);
    }
  };

  const createWorkspace = async (name: string, patientId?: string, notes?: string) => {
    if (!user) return;

    const { data, error } = await supabase
      .from("patient_workspaces")
      .insert({
        name,
        patient_id: patientId || null,
        notes: notes || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating workspace:", error);
      toast.error("Failed to create workspace");
      throw error;
    } else {
      toast.success("Workspace created");
      await refreshWorkspaces();
      setSelectedWorkspace(data);
    }
  };

  const deleteWorkspace = async (workspaceId: string) => {
    const { error } = await supabase
      .from("patient_workspaces")
      .delete()
      .eq("id", workspaceId);

    if (error) {
      console.error("Error deleting workspace:", error);
      toast.error("Failed to delete workspace");
      throw error;
    } else {
      toast.success("Workspace deleted");
      await refreshWorkspaces();
      if (selectedWorkspace?.id === workspaceId) {
        setSelectedWorkspace(workspaces[0] || null);
      }
    }
  };

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        selectedWorkspace,
        workspaceFiles,
        allWorkspaceFiles,
        selectWorkspace,
        createWorkspace,
        deleteWorkspace,
        refreshWorkspaces,
        refreshFiles,
        loading,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
};
