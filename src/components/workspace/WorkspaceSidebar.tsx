import { useState } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderOpen, Plus, LogOut, User, Trash2 } from "lucide-react";
import dvaLogo from "@/assets/dva-logo.png";

export const WorkspaceSidebar = () => {
  const { workspaces, selectedWorkspace, selectWorkspace, createWorkspace, deleteWorkspace } =
    useWorkspace();
  const { user, signOut } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPatientId, setNewPatientId] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [creating, setCreating] = useState(false);

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
                {workspaces.map((workspace) => (
                  <SidebarMenuItem key={workspace.id}>
                    <SidebarMenuButton
                      isActive={selectedWorkspace?.id === workspace.id}
                      onClick={() => selectWorkspace(workspace.id)}
                      className="group"
                    >
                      <FolderOpen className="h-4 w-4" />
                      <div className="flex-1 flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{workspace.name}</div>
                          {workspace.patient_id && (
                            <div className="text-xs text-muted-foreground">
                              ID: {workspace.patient_id}
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100"
                          onClick={(e) => handleDelete(e, workspace.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
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
