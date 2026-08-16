import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type ShareableBalanceResult } from "@shared/schema";
import ManualPlayerDbSection from "../components/manual-player-db-section";
import ManualTeamBuilder from "../components/manual-team-builder";
import TeamBalanceResult from "../components/team-balance-result";
import BalanceHistory from "../components/balance-history";
import InhouseStats from "../components/inhouse-stats";
import BalanceSettingsPanel from "../components/balance-settings-panel";
import LoadingSpinner from "../components/loading-spinner";
import AdminOnly from "../components/admin-only";
import AuthBar from "../components/auth-bar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, History, BarChart3 } from "lucide-react";

export default function Home() {
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [balanceResult, setBalanceResult] = useState<ShareableBalanceResult | null>(null);
  const [selectedBalanceSettingsId, setSelectedBalanceSettingsId] = useState<string | undefined>();
  const [enforceForcedSameTeam, setEnforceForcedSameTeam] = useState(true);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Balance teams mutation
  const balanceTeamsMutation = useMutation({
    mutationFn: async ({
      playerIds,
      excludedTeamPlayerIds,
      enforceForcedSameTeam,
    }: {
      playerIds: string[];
      excludedTeamPlayerIds?: string[];
      enforceForcedSameTeam: boolean;
    }) => {
      const requestData: any = { playerIds, enforceForcedSameTeam };
      if (selectedBalanceSettingsId) {
        requestData.balanceSettingsId = selectedBalanceSettingsId;
      }
      if (excludedTeamPlayerIds?.length === 5) {
        requestData.excludedTeamPlayerIds = excludedTeamPlayerIds;
      }
      
      const response = await apiRequest("POST", "/api/teams/balance", requestData);
      return response.json();
    },
    onSuccess: (data: ShareableBalanceResult) => {
      setBalanceResult(data);
      // Invalidate balance history cache to show the new result
      queryClient.invalidateQueries({ queryKey: ['/api/balance-history'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inhouse-stats'] });
      toast({
        title: "팀 밸런스 완료",
        description: `밸런스 점수: ${data.balanceScore}/100`,
      });
    },
    onError: (error) => {
      toast({
        title: "팀 밸런스 실패",
        description: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  const handleBalanceTeams = (isRebalance = false) => {
    if (selectedPlayerIds.length !== 10) {
      toast({
        title: "플레이어 10명을 선택해주세요",
        description: `현재 ${selectedPlayerIds.length}명 선택됨. 팀 밸런스는 정확히 10명이 필요합니다.`,
        variant: "destructive",
      });
      return;
    }

    const excludedTeamPlayerIds = isRebalance && balanceResult
      ? balanceResult.blueTeam.players.map((player) => player.id)
      : undefined;

    balanceTeamsMutation.mutate({
      playerIds: selectedPlayerIds,
      excludedTeamPlayerIds,
      enforceForcedSameTeam,
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <i className="fas fa-balance-scale text-primary text-2xl"></i>
              <h1 className="text-2xl font-bold">LoL 커스텀 게임 밸런서</h1>
            </div>
            <div className="flex items-center space-x-2">
              <AuthBar />
              <button className="text-muted-foreground hover:text-foreground transition-colors p-2">
                <i className="fas fa-question-circle text-lg"></i>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <Tabs defaultValue="balance" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="balance" className="flex items-center gap-2" data-testid="tab-balance">
              <Users className="h-4 w-4" />
              팀 밸런싱
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2" data-testid="tab-history">
              <History className="h-4 w-4" />
              밸런싱 기록
            </TabsTrigger>
            <TabsTrigger value="inhouse-stats" className="flex items-center gap-2" data-testid="tab-inhouse-stats">
              <BarChart3 className="h-4 w-4" />
              내전 기록
            </TabsTrigger>
          </TabsList>

          <TabsContent value="balance" className="space-y-8">
            <AdminOnly>
              <ManualPlayerDbSection
                selectedIds={selectedPlayerIds}
                onSelectedIdsChange={(ids) => {
                  setSelectedPlayerIds(ids);
                  setBalanceResult(null);
                }}
                onBalanceTeams={handleBalanceTeams}
                isBalancing={balanceTeamsMutation.isPending}
              />

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <BalanceSettingsPanel
                  selectedSettingsId={selectedBalanceSettingsId}
                  onSettingsChange={setSelectedBalanceSettingsId}
                />
                <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                  <Switch
                    id="enforce-forced-same-team"
                    checked={enforceForcedSameTeam}
                    onCheckedChange={setEnforceForcedSameTeam}
                    data-testid="switch-enforce-forced-same-team"
                  />
                  <Label htmlFor="enforce-forced-same-team" className="cursor-pointer text-sm">
                    김토토·정정쓰 같은 팀
                  </Label>
                </div>
                <button
                  type="button"
                  onClick={() => handleBalanceTeams()}
                  disabled={balanceTeamsMutation.isPending || selectedPlayerIds.length !== 10}
                  className="rounded-lg bg-accent px-6 py-3 font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="button-balance-manual-players"
                >
                  {balanceTeamsMutation.isPending ? "밸런스 계산 중..." : `선택한 ${selectedPlayerIds.length}/10명으로 팀 짜기`}
                </button>
                <ManualTeamBuilder
                  selectedPlayerIds={selectedPlayerIds}
                  balanceSettingsId={selectedBalanceSettingsId}
                  onResult={(data) => {
                    setBalanceResult(data);
                    queryClient.invalidateQueries({ queryKey: ["/api/balance-history"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/inhouse-stats"] });
                  }}
                />
              </div>

              {/* Team Balance Loading */}
              {balanceTeamsMutation.isPending && (
                <LoadingSpinner message="팀 밸런스를 계산하는 중..." />
              )}

              {/* Team Balance Result */}
              {balanceResult && (
                <TeamBalanceResult
                  balanceResult={balanceResult}
                  onRebalance={() => handleBalanceTeams(true)}
                  isRebalancing={balanceTeamsMutation.isPending}
                />
              )}
            </AdminOnly>
          </TabsContent>

          <TabsContent value="history" className="space-y-8">
            <BalanceHistory limit={40} />
          </TabsContent>

          <TabsContent value="inhouse-stats" className="space-y-8">
            <InhouseStats />
          </TabsContent>
        </Tabs>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-card/30 mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-sm text-muted-foreground">
            <p className="mb-2">LoL 커스텀 게임 밸런서 v1.0</p>
            <p>수동 플레이어 DB 기반 팀 밸런싱 도구</p>
            <div className="flex justify-center space-x-4 mt-4">
              <button className="hover:text-foreground transition-colors">
                <i className="fab fa-github"></i>
              </button>
              <button className="hover:text-foreground transition-colors">
                <i className="fas fa-question-circle"></i>
              </button>
              <button className="hover:text-foreground transition-colors">
                <i className="fas fa-envelope"></i>
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
