import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Eye, KeyRound, LogIn, LogOut, ShieldCheck } from "lucide-react";
import LoginDialog from "./login-dialog";
import AccountSettingsDialog from "./account-settings-dialog";

export default function AuthBar() {
  const { isAdmin, username, isLoading, logout } = useAuth();
  const { toast } = useToast();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      toast({ title: "로그아웃되었습니다.", description: "조회 모드로 전환되었습니다." });
    } catch (error) {
      toast({
        title: "로그아웃 실패",
        description: error instanceof Error ? error.message : "다시 시도해주세요.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return null;
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {isAdmin ? (
          <>
            <Badge variant="default" className="hidden sm:flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" />
              관리자{username ? ` · ${username}` : ""}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsAccountOpen(true)}
              data-testid="button-open-account-settings"
            >
              <KeyRound className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">계정 설정</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">로그아웃</span>
            </Button>
          </>
        ) : (
          <>
            <Badge variant="outline" className="hidden sm:flex items-center gap-1">
              <Eye className="h-3 w-3" />
              조회 모드
            </Badge>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setIsLoginOpen(true)}
              data-testid="button-open-login"
            >
              <LogIn className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">관리자 로그인</span>
              <span className="sm:hidden">로그인</span>
            </Button>
          </>
        )}
      </div>
      <LoginDialog open={isLoginOpen} onOpenChange={setIsLoginOpen} />
      {isAdmin && <AccountSettingsDialog open={isAccountOpen} onOpenChange={setIsAccountOpen} />}
    </>
  );
}
