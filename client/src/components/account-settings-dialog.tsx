import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { KeyRound } from "lucide-react";

interface AccountSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AccountSettingsDialog({ open, onOpenChange }: AccountSettingsDialogProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const { toast } = useToast();

  const reset = () => {
    setCurrentPassword("");
    setNewUsername("");
    setNewPassword("");
  };

  const changeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/change-credentials", {
        currentPassword,
        newUsername: newUsername.trim() ? newUsername.trim() : undefined,
        newPassword: newPassword ? newPassword : undefined,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: "계정 정보 변경 완료", description: data.message });
      reset();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "변경 실패",
        description: error instanceof Error ? error.message : "계정 정보를 변경하지 못했습니다.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!currentPassword) {
      toast({ title: "현재 비밀번호를 입력해주세요.", variant: "destructive" });
      return;
    }
    if (!newUsername.trim() && !newPassword) {
      toast({ title: "변경할 아이디 또는 비밀번호를 입력해주세요.", variant: "destructive" });
      return;
    }
    changeMutation.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            관리자 계정 설정
          </DialogTitle>
          <DialogDescription>
            아이디 또는 비밀번호를 변경합니다. 둘 다 입력할 필요는 없고, 바꾸고 싶은 항목만 입력하세요.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">현재 비밀번호</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              data-testid="input-current-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-username">새 아이디 (선택)</Label>
            <Input
              id="new-username"
              value={newUsername}
              onChange={(event) => setNewUsername(event.target.value)}
              autoComplete="off"
              data-testid="input-new-username"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">새 비밀번호 (선택, 4자 이상)</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              data-testid="input-new-password"
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={changeMutation.isPending}
            data-testid="button-change-credentials-submit"
          >
            {changeMutation.isPending ? "저장 중..." : "저장"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
