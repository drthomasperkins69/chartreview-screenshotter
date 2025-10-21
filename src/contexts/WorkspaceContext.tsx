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
  ocr_completed?: boolean;
}

interface WorkspaceDiagnosis {
  id: string;
  workspace_id: string;
  diagnosis_name: string;
  page_count: number;
  pages: Array<{ fileId: string; fileName: string; pageNum: number; key: string }>;
  created_at: string;
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  selectedWorkspace: Workspace | null;
  workspaceFiles: WorkspaceFile[];
  workspaceDiagnoses: WorkspaceDiagnosis[];
  allWorkspaceFiles: Record<string, WorkspaceFile[]>;
  allWorkspaceDiagnoses: Record<string, WorkspaceDiagnosis[]>;
  selectWorkspace: (workspaceId: string) => void;
  createWorkspace: (name: string, patientId?: string, notes?: string) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  refreshFiles: () => Promise<void>;
  refreshDiagnoses: () => Promise<void>;
  saveDiagnosis: (diagnosis: string, pages: Array<{ fileId: string; fileName: string; pageNum: number; key: string }>) => Promise<void>;
  deleteDiagnosis: (diagnosisId: string) => Promise<void>;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [workspaceDiagnoses, setWorkspaceDiagnoses] = useState<WorkspaceDiagnosis[]>([]);
  const [allWorkspaceFiles, setAllWorkspaceFiles] = useState<Record<string, WorkspaceFile[]>>({});
  const [allWorkspaceDiagnoses, setAllWorkspaceDiagnoses] = useState<Record<string, WorkspaceDiagnosis[]>>({});
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
      
      // Fetch files and diagnoses for all workspaces
      if (data && data.length > 0) {
        const filesPromises = data.map(workspace =>
          supabase
            .from("workspace_files")
            .select("*")
            .eq("workspace_id", workspace.id)
            .order("created_at", { ascending: false })
        );
        
        const diagnosesPromises = data.map(workspace =>
          supabase
            .from("workspace_diagnoses")
            .select("*")
            .eq("workspace_id", workspace.id)
            .order("created_at", { ascending: false })
        );
        
        const [filesResults, diagnosesResults] = await Promise.all([
          Promise.all(filesPromises),
          Promise.all(diagnosesPromises)
        ]);
        
        const filesMap: Record<string, WorkspaceFile[]> = {};
        const diagnosesMap: Record<string, WorkspaceDiagnosis[]> = {};
        
        // Process files for all workspaces
        for (let index = 0; index < data.length; index++) {
          const workspace = data[index];
          const files = filesResults[index].data || [];
          
          // OCR status is now directly on workspace_files
          filesMap[workspace.id] = files;
          diagnosesMap[workspace.id] = (diagnosesResults[index].data || []).map(d => ({
            ...d,
            pages: d.pages as any as Array<{ fileId: string; fileName: string; pageNum: number; key: string }>
          }));
        }
        
        setAllWorkspaceFiles(filesMap);
        setAllWorkspaceDiagnoses(diagnosesMap);
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
      // OCR status is now directly on workspace_files
      setWorkspaceFiles(data || []);
      // Also update the all files map
      setAllWorkspaceFiles(prev => ({
        ...prev,
        [selectedWorkspace.id]: data || []
      }));
    }
  };

  const refreshDiagnoses = async () => {
    if (!selectedWorkspace) return;

    const { data, error } = await supabase
      .from("workspace_diagnoses")
      .select("*")
      .eq("workspace_id", selectedWorkspace.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching diagnoses:", error);
      toast.error("Failed to load diagnoses");
    } else {
      const typedData = (data || []).map(d => ({
        ...d,
        pages: d.pages as any as Array<{ fileId: string; fileName: string; pageNum: number; key: string }>
      }));
      setWorkspaceDiagnoses(typedData);
      // Also update the all diagnoses map
      setAllWorkspaceDiagnoses(prev => ({
        ...prev,
        [selectedWorkspace.id]: typedData
      }));
    }
  };

  const saveDiagnosis = async (
    diagnosis: string,
    pages: Array<{ fileId: string; fileName: string; pageNum: number; key: string }>
  ) => {
    if (!selectedWorkspace || !user) return;

    // Check if diagnosis already exists for current user
    const { data: existing } = await supabase
      .from("workspace_diagnoses")
      .select("*")
      .eq("workspace_id", selectedWorkspace.id)
      .eq("diagnosis_name", diagnosis)
      .eq("created_by", user.id)
      .maybeSingle();

    if (existing) {
      // Merge existing pages with new pages (by unique key) to avoid overwriting
      const existingPages = (existing.pages as any[] | null) ?? [];
      const byKey = new Map<string, { fileId: string; fileName: string; pageNum: number; key: string }>();
      for (const p of existingPages) {
        if (p && typeof p.key === 'string') byKey.set(p.key, p);
      }
      for (const p of pages) {
        if (p && typeof p.key === 'string') byKey.set(p.key, p);
      }
      const mergedPages = Array.from(byKey.values());

      const { error } = await supabase
        .from("workspace_diagnoses")
        .update({
          pages: mergedPages,
          page_count: mergedPages.length,
        })
        .eq("id", existing.id);

      if (error) {
        console.error("Error updating diagnosis:", error);
        toast.error("Failed to update diagnosis");
        return;
      }
    } else {
      // Create new diagnosis
      const { error } = await supabase
        .from("workspace_diagnoses")
        .insert({
          workspace_id: selectedWorkspace.id,
          diagnosis_name: diagnosis,
          pages: pages,
          page_count: pages.length,
          created_by: user.id,
        });

      if (error) {
        console.error("Error saving diagnosis:", error);
        toast.error("Failed to save diagnosis");
        return;
      }
    }

    await refreshDiagnoses();
  };

  const deleteDiagnosis = async (diagnosisId: string) => {
    const { error } = await supabase
      .from("workspace_diagnoses")
      .delete()
      .eq("id", diagnosisId);

    if (error) {
      console.error("Error deleting diagnosis:", error);
      toast.error("Failed to delete diagnosis");
      return;
    }

    await refreshDiagnoses();
  };

  useEffect(() => {
    if (user) {
      refreshWorkspaces();
    }
  }, [user]);

  useEffect(() => {
    if (selectedWorkspace) {
      refreshFiles();
      refreshDiagnoses();
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
        workspaceDiagnoses,
        allWorkspaceFiles,
        allWorkspaceDiagnoses,
        selectWorkspace,
        createWorkspace,
        deleteWorkspace,
        refreshWorkspaces,
        refreshFiles,
        refreshDiagnoses,
        saveDiagnosis,
        deleteDiagnosis,
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
