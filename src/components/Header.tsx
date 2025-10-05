import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";
import dvaLogo from "@/assets/dva-logo.png";

export const Header = () => {
  const { user, signOut } = useAuth();

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
