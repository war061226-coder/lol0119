import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings, Key, Check, X, Loader2, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ApiSettings {
  useRiotApi: boolean;
  apiKeySet: boolean;
  dataSource: string;
}

export default function ApiSettings() {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<ApiSettings>({
    queryKey: ['/api/settings'],
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: { apiKey?: string; useRiotApi?: boolean }) => {
      const response = await apiRequest("POST", "/api/settings", data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
      if (data.message) {
        toast({
          title: "설정 저장됨",
          description: data.message,
        });
      }
      setApiKey("");
    },
    onError: (error) => {
      toast({
        title: "설정 저장 실패",
        description: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  const clearApiKeyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/settings/api-key");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
      toast({
        title: "API 키 삭제됨",
        description: "Riot API 키가 삭제되었습니다.",
      });
    },
    onError: (error) => {
      toast({
        title: "API 키 삭제 실패",
        description: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  const handleSaveApiKey = () => {
    if (!apiKey.trim()) {
      toast({
        title: "API 키 필요",
        description: "API 키를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }
    updateSettingsMutation.mutate({ apiKey: apiKey.trim() });
  };

  const handleToggleUseRiotApi = (checked: boolean) => {
    updateSettingsMutation.mutate({ useRiotApi: checked });
  };

  const handleClearApiKey = () => {
    clearApiKeyMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" data-testid="button-api-settings">
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API 설정
          </DialogTitle>
          <DialogDescription>
            Riot API 키를 설정하여 공식 API를 통해 플레이어 데이터를 조회합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>현재 데이터 소스</Label>
                  <p className="text-sm text-muted-foreground">
                    {settings?.dataSource === 'riot-api' ? 'Riot 공식 API' : 'OP.GG 스크래퍼'}
                  </p>
                </div>
                <Badge variant={settings?.dataSource === 'riot-api' ? 'default' : 'secondary'}>
                  {settings?.dataSource === 'riot-api' ? 'API' : 'Scraper'}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="use-riot-api">Riot API 사용</Label>
                  <p className="text-sm text-muted-foreground">
                    API 키가 설정된 경우 Riot API를 사용합니다
                  </p>
                </div>
                <Switch
                  id="use-riot-api"
                  checked={settings?.useRiotApi ?? false}
                  onCheckedChange={handleToggleUseRiotApi}
                  disabled={!settings?.apiKeySet || updateSettingsMutation.isPending}
                  data-testid="switch-use-riot-api"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Riot API 키</Label>
                  {settings?.apiKeySet ? (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      <Check className="h-3 w-3 mr-1" />
                      설정됨
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      <X className="h-3 w-3 mr-1" />
                      미설정
                    </Badge>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    data-testid="input-api-key"
                  />
                  <Button 
                    onClick={handleSaveApiKey}
                    disabled={updateSettingsMutation.isPending}
                    data-testid="button-save-api-key"
                  >
                    {updateSettingsMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "저장"
                    )}
                  </Button>
                </div>

                {settings?.apiKeySet && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={handleClearApiKey}
                    disabled={clearApiKeyMutation.isPending}
                    data-testid="button-clear-api-key"
                  >
                    {clearApiKeyMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    API 키 삭제
                  </Button>
                )}
              </div>

              <div className="rounded-lg bg-muted p-3 text-sm">
                <p className="font-medium mb-2">Riot API 키 발급 방법</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Riot Developer Portal 접속</li>
                  <li>로그인 후 Dashboard에서 API 키 생성</li>
                  <li>Development API Key는 24시간 유효합니다</li>
                </ol>
                <a
                  href="https://developer.riotgames.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-primary hover:underline"
                >
                  Riot Developer Portal
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
