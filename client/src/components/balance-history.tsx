import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { History, Trophy, Users, TrendingUp, Trash2, ListChecks } from "lucide-react";
import LoadingSpinner from "./loading-spinner";
import { type BalanceResult, type RecommendedPlayer } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface BalanceHistoryProps {
  limit?: number;
}

function parseTeamDetail(team: any): { players: RecommendedPlayer[]; averageMmr: number; teamScore: number } | null {
  if (typeof team === 'string') {
    try {
      team = JSON.parse(team);
    } catch {
      return null;
    }
  }
  if (!team || !Array.isArray(team.players)) return null;
  return {
    players: team.players as RecommendedPlayer[],
    averageMmr: typeof team.averageMmr === 'number' ? team.averageMmr : 0,
    teamScore: typeof team.teamScore === 'number' ? team.teamScore : 0,
  };
}

export default function BalanceHistory({ limit = 10 }: BalanceHistoryProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [detailResult, setDetailResult] = useState<BalanceResult | null>(null);
  const { data: history, isLoading, error } = useQuery({
    queryKey: ['/api/balance-history', limit],
    queryFn: async () => {
      const response = await fetch(`/api/balance-history?limit=${limit}`);
      if (!response.ok) {
        throw new Error('Failed to fetch balance history');
      }
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/balance-history", { method: "DELETE" });
      if (!response.ok) throw new Error("기록 초기화에 실패했습니다.");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/balance-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inhouse-stats"] });
      toast({ title: "초기화 완료", description: "밸런싱 기록을 모두 삭제했습니다." });
    },
    onError: (mutationError: Error) => {
      toast({ title: "오류", description: mutationError.message, variant: "destructive" });
    },
  });

  const winnerMutation = useMutation({
    mutationFn: async ({ id, winner }: { id: string; winner: "BLUE" | "RED" | null }) => {
      const response = await fetch(`/api/balance-history/${id}/winner`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winner }),
      });
      if (!response.ok) throw new Error("승패 기록에 실패했습니다.");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/balance-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inhouse-stats"] });
      toast({ title: "저장 완료", description: "승패 기록을 저장했습니다." });
    },
    onError: (mutationError: Error) => {
      toast({ title: "오류", description: mutationError.message, variant: "destructive" });
    },
  });

  const deleteHistoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/balance-history/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("기록 삭제에 실패했습니다.");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/balance-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inhouse-stats"] });
      toast({ title: "삭제 완료", description: "선택한 밸런싱 기록을 삭제했습니다." });
    },
    onError: (mutationError: Error) => {
      toast({ title: "오류", description: mutationError.message, variant: "destructive" });
    },
  });

  const handleClearHistory = () => {
    if (historyResults.length === 0 || clearHistoryMutation.isPending) return;
    if (window.confirm("모든 밸런싱 기록을 삭제할까요? 삭제한 기록은 복구할 수 없습니다.")) {
      clearHistoryMutation.mutate();
    }
  };

  const handleDeleteHistory = (id: string) => {
    if (deleteHistoryMutation.isPending) return;
    if (window.confirm("이 밸런싱 기록을 삭제할까요? 삭제한 기록은 복구할 수 없습니다.")) {
      deleteHistoryMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center p-8">
          <div className="text-center">
            <p className="text-muted-foreground">기록을 불러오는 중 오류가 발생했습니다.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const historyResults = (history as BalanceResult[]) || [];

  const renderHistoryHeader = () => (
    <CardHeader className="flex flex-row items-center justify-between space-y-0">
      <CardTitle className="flex items-center gap-2">
        <History className="h-5 w-5" />
        밸런싱 기록
        <Badge variant="secondary">
          {historyResults.length}개
        </Badge>
      </CardTitle>
      {isAdmin && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleClearHistory}
          disabled={historyResults.length === 0 || clearHistoryMutation.isPending}
          className="text-destructive hover:text-destructive"
          data-testid="button-clear-balance-history"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          {clearHistoryMutation.isPending ? "초기화 중..." : "기록 초기화"}
        </Button>
      )}
    </CardHeader>
  );

  if (historyResults.length === 0) {
    return (
      <Card className="w-full">
        {renderHistoryHeader()}
        <CardContent className="flex items-center justify-center p-8">
          <div className="text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">아직 밸런싱 기록이 없습니다.</p>
            <p className="text-sm text-muted-foreground mt-2">
              팀 밸런싱을 실행하면 기록이 여기에 표시됩니다.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getBalanceScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getBalanceScoreBadgeVariant = (score: number): "default" | "secondary" | "destructive" => {
    if (score >= 80) return "default";
    if (score >= 60) return "secondary";
    return "destructive";
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTeamInfo = (team: any) => {
    if (typeof team === 'string') {
      try {
        team = JSON.parse(team);
      } catch {
        return "팀 정보 없음";
      }
    }
    
    if (!team || !team.players || !Array.isArray(team.players)) {
      return "팀 정보 없음";
    }

    const playerNames = team.players.map((p: any) => {
      if (typeof p === 'string') return p;
      return p.summonerName || p.name || "알 수 없음";
    });

    return playerNames.slice(0, 3).join(", ") + (playerNames.length > 3 ? ` 외 ${playerNames.length - 3}명` : "");
  };

  return (
    <Card className="w-full">
      {renderHistoryHeader()}
      <CardContent className="space-y-4">
        {historyResults.map((result, index) => (
          <div key={result.id} data-testid={`balance-history-item-${result.id}`}>
            <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
              <div className="flex-1 space-y-2">
                {/* 기록 헤더 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      밸런싱 #{historyResults.length - index}
                    </span>
                    <Badge variant={getBalanceScoreBadgeVariant(result.balanceScore)}>
                      {Math.round(result.balanceScore)}점
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {formatDate(result.createdAt)}
                    </span>
                    {isAdmin && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteHistory(result.id)}
                        disabled={deleteHistoryMutation.isPending}
                        className="text-destructive hover:text-destructive"
                        aria-label="이 밸런싱 기록 삭제"
                        data-testid={`button-delete-balance-history-${result.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* 팀 구성 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <span className="text-sm font-medium">블루팀</span>
                    </div>
                    <p className="text-xs text-muted-foreground pl-5">
                      {formatTeamInfo(result.blueTeam)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <span className="text-sm font-medium">레드팀</span>
                    </div>
                    <p className="text-xs text-muted-foreground pl-5">
                      {formatTeamInfo(result.redTeam)}
                    </p>
                  </div>
                </div>

                {/* 밸런스 지표 */}
                <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    <span>MMR 차이: {Math.round(result.mmrDifference)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>포지션: {Math.round(result.positionBalance * 100)}%</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
                  {isAdmin ? (
                    <>
                      <span className="text-sm font-medium mr-1">승패 기록</span>
                      <Button
                        type="button"
                        size="sm"
                        variant={result.winner === "BLUE" ? "default" : "outline"}
                        onClick={() => winnerMutation.mutate({ id: result.id, winner: "BLUE" })}
                        disabled={winnerMutation.isPending}
                        data-testid={`button-history-blue-win-${result.id}`}
                      >
                        블루팀 승리
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={result.winner === "RED" ? "default" : "outline"}
                        onClick={() => winnerMutation.mutate({ id: result.id, winner: "RED" })}
                        disabled={winnerMutation.isPending}
                        data-testid={`button-history-red-win-${result.id}`}
                      >
                        레드팀 승리
                      </Button>
                      {result.winner && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => winnerMutation.mutate({ id: result.id, winner: null })}
                          disabled={winnerMutation.isPending}
                          data-testid={`button-history-clear-winner-${result.id}`}
                        >
                          승패 지우기
                        </Button>
                      )}
                    </>
                  ) : null}
                  <Badge variant={result.winner ? "secondary" : "outline"}>
                    {result.winner === "BLUE"
                      ? "블루팀 승리 기록됨"
                      : result.winner === "RED"
                        ? "레드팀 승리 기록됨"
                        : "승패 미기록"}
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    onClick={() => setDetailResult(result)}
                    data-testid={`button-history-detail-${result.id}`}
                  >
                    <ListChecks className="h-4 w-4 mr-1" />
                    자세히 보기
                  </Button>
                </div>
              </div>
            </div>
            {index < historyResults.length - 1 && <Separator className="mt-4" />}
          </div>
        ))}
      </CardContent>

      <Dialog open={detailResult !== null} onOpenChange={(open) => !open && setDetailResult(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-muted-foreground" />
              경기 상세 정보
              {detailResult && (
                <span className="text-sm font-normal text-muted-foreground">
                  {formatDate(detailResult.createdAt)}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {detailResult && (() => {
            const blueDetail = parseTeamDetail(detailResult.blueTeam);
            const redDetail = parseTeamDetail(detailResult.redTeam);
            const POSITION_ORDER: Record<string, number> = { TOP: 0, JG: 1, MID: 2, ADC: 3, SUP: 4 };
            const sortByPosition = (players: RecommendedPlayer[]) =>
              [...players].sort((a, b) => {
                const posA = a.recommendedPosition || a.mainPosition;
                const posB = b.recommendedPosition || b.mainPosition;
                const orderA = POSITION_ORDER[posA] ?? 99;
                const orderB = POSITION_ORDER[posB] ?? 99;
                return orderA - orderB;
              });
            const renderPlayerRow = (player: RecommendedPlayer) => {
              const displayTier = player.manualTier || player.tier;
              const displayRank = player.manualRank || player.rank;
              const position = player.recommendedPosition || player.mainPosition;
              const pityScore = player.pityScore ?? 0;
              const gotPityPriority = pityScore >= 50 && position === player.mainPosition;
              return (
                <div
                  key={player.id}
                  className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm"
                  data-testid={`detail-player-${detailResult.id}-${player.id}`}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate flex items-center gap-1.5">
                      {player.summonerName}
                      {gotPityPriority && (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0"
                          title={`가산점 ${pityScore}점 누적으로 주라인1 우선배정됨`}
                        >
                          🎯 우선배정
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {displayTier} {displayRank || ""} · MMR {player.mmr}
                      {pityScore > 0 && (
                        <span className={pityScore >= 50 ? "text-amber-400 font-semibold" : ""}>
                          {" "}· 가산점 {pityScore}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0">{position}</Badge>
                </div>
              );
            };
            return (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">밸런스 점수</div>
                    <div className={`font-mono font-semibold ${getBalanceScoreColor(detailResult.balanceScore)}`}>
                      {Math.round(detailResult.balanceScore)}점
                    </div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">MMR 차이</div>
                    <div className="font-mono font-semibold">{Math.round(detailResult.mmrDifference)}</div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">포지션 매치</div>
                    <div className="font-mono font-semibold">{Math.round(detailResult.positionBalance * 100)}%</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-semibold text-blue-400">
                        <div className="h-3 w-3 rounded-full bg-blue-500"></div>
                        블루팀
                        {detailResult.winner === "BLUE" && (
                          <Badge className="text-[10px]">승리</Badge>
                        )}
                      </div>
                      {blueDetail && (
                        <span className="text-xs text-muted-foreground">평균 MMR {Math.round(blueDetail.averageMmr)}</span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {blueDetail ? sortByPosition(blueDetail.players).map(renderPlayerRow) : (
                        <div className="text-sm text-muted-foreground">팀 정보를 불러올 수 없습니다.</div>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-semibold text-red-400">
                        <div className="h-3 w-3 rounded-full bg-red-500"></div>
                        레드팀
                        {detailResult.winner === "RED" && (
                          <Badge className="text-[10px]">승리</Badge>
                        )}
                      </div>
                      {redDetail && (
                        <span className="text-xs text-muted-foreground">평균 MMR {Math.round(redDetail.averageMmr)}</span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {redDetail ? sortByPosition(redDetail.players).map(renderPlayerRow) : (
                        <div className="text-sm text-muted-foreground">팀 정보를 불러올 수 없습니다.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  );
}