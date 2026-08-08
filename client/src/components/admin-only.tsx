import { type ReactNode, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import LoginDialog from "./login-dialog";

interface AdminOnlyProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

export default function AdminOnly({
  children,
  title = "관리자 전용 기능입니다",
  description = "플레이어 등록/수정과 팀 밸런싱은 관리자 로그인 후 이용할 수 있습니다. 조회 계정은 밸런싱 기록과 내전 기록을 볼 수 있습니다.",
}: AdminOnlyProps) {
  const { isAdmin, isLoading } = useAuth();
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  if (isLoading) {
    return null;
  }

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <>
      <Card className="border-dashed" data-testid="admin-only-locked">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">{title}</p>
            <p className="max-w-md text-sm text-muted-foreground">{description}</p>
          </div>
          <Button onClick={() => setIsLoginOpen(true)} data-testid="button-admin-only-login">
            관리자 로그인
          </Button>
        </CardContent>
      </Card>
      <LoginDialog open={isLoginOpen} onOpenChange={setIsLoginOpen} />
    </>
  );
}
