import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, FolderOpen } from "lucide-react";
import { toast } from "sonner";

interface Workspace {
  id: string;
  name: string;
  patient_id: string | null;
  notes: string | null;
}

interface WorkspaceSelectorProps {
  selectedWorkspaceId: string | null;
  onWorkspaceChange: (workspaceId: string | null) => void;
}

export const WorkspaceSelector = ({
  selectedWorkspaceId,
  onWorkspaceChange,
}: WorkspaceSelectorProps) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newPatientId, setNewPatientId] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const fetchWorkspaces = async () => {
    const { data, error } = await supabase
      .from("patient_workspaces")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load workspaces");
      console.error(error);
    } else {
      setWorkspaces(data || []);
    }
  };

  const createWorkspace = async () => {
    if (!newWorkspaceName.trim()) {
      toast.error("Please enter a workspace name");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("patient_workspaces")
      .insert({
        name: newWorkspaceName,
        patient_id: newPatientId || null,
        notes: newNotes || null,
        created_by: user?.id,
      })
      .select()
      .single();

    setLoading(false);

    if (error) {
      toast.error("Failed to create workspace");
      console.error(error);
    } else {
      toast.success("Workspace created successfully");
      setWorkspaces([data, ...workspaces]);
      onWorkspaceChange(data.id);
      setIsDialogOpen(false);
      setNewWorkspaceName("");
      setNewPatientId("");
      setNewNotes("");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <Select value={selectedWorkspaceId || ""} onValueChange={onWorkspaceChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a patient workspace">
              {selectedWorkspaceId
                ? workspaces.find((w) => w.id === selectedWorkspaceId)?.name
                : "Select a patient workspace"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4" />
                  <span>{workspace.name}</span>
                  {workspace.patient_id && (
                    <span className="text-xs text-muted-foreground">
                      (ID: {workspace.patient_id})
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="icon">
            <Plus className="w-4 h-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Patient Workspace</DialogTitle>
            <DialogDescription>
              Create a workspace to organize patient files and diagnoses
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workspace-name">Workspace Name *</Label>
              <Input
                id="workspace-name"
                placeholder="e.g., John Doe - Case 2024-001"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="patient-id">Patient ID (Optional)</Label>
              <Input
                id="patient-id"
                placeholder="e.g., P-12345"
                value={newPatientId}
                onChange={(e) => setNewPatientId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes about this case"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={3}
              />
            </div>
            <Button onClick={createWorkspace} disabled={loading} className="w-full">
              {loading ? "Creating..." : "Create Workspace"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
