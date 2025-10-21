import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarProvider } from "@/components/ui/sidebar";
import { WorkspaceSidebar } from "@/components/workspace/WorkspaceSidebar";
import { WorkspaceContent } from "@/components/workspace/WorkspaceContent";
import { Header } from "@/components/Header";
import { Loader2 } from "lucide-react";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [selectedFileData, setSelectedFileData] = useState<{ id: string; path: string; name: string } | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  const handleFileSelect = (fileId: string, filePath: string, fileName: string) => {
    setSelectedFileData({ id: fileId, path: filePath, name: fileName });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <SidebarProvider>
        <div className="flex-1 flex w-full">
          <WorkspaceSidebar onFileSelect={handleFileSelect} />
          <WorkspaceContent selectedFileFromSidebar={selectedFileData} />
        </div>
      </SidebarProvider>
    </div>
  );
};

export default Index;
