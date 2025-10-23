import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LogOut, User, BookOpen } from "lucide-react";
import dvaLogo from "@/assets/dva-logo.png";
import { ReferenceDocuments } from "@/components/ReferenceDocuments";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Header = () => {
  const { user, signOut } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const checkAdminRole = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      
      setIsAdmin(!!data);
    };
    
    checkAdminRole();
  }, [user]);

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={dvaLogo} alt="DVA Logo" className="h-10" />
          <div>
            <h1 className="text-lg font-bold">Medical Diagnosis System</h1>
            <p className="text-xs text-muted-foreground">Patient Workspace Management</p>
          </div>
        </div>
        
        {user && (
          <div className="flex items-center gap-4">
            {isAdmin && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <BookOpen className="w-4 h-4 mr-2" />
                    Reference Docs
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Global Reference Documents</DialogTitle>
                  </DialogHeader>
                  <ReferenceDocuments />
                </DialogContent>
              </Dialog>
            )}
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4" />
              <span>{user.email}</span>
            </div>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        )}
      </div>
    </header>
  );
};
