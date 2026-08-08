import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, ChevronDown, ChevronUp, CircleHelp, Gamepad2, Percent, Trophy, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type InhousePlayerStats, type InhouseStatsSummary } from "@shared/schema";
import LoadingSpinner from "./loading-spinner";

type WinRateSortDirection = "desc" | "asc" | null;

export default function InhouseStats() {
  const [expandedPlayerIds, setExpandedPlayerIds] = useState<Set<string>>(new Set());
  const [winRateSort, setWinRateSort] = useState<WinRateSortDirection>(null);
  const { data, isLoading, error } = useQuery<InhouseStatsSummary>({
    queryKey: ["/api/inhouse-stats"],
    queryFn: async () => {
      const response = await fetch("/api/inhouse-stats");
      if (!response.ok) throw new Error("내전 통계를 불러오지 못했습니다.");
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  const sortedPlayers = useMemo(() => {
    const players = data?.players ?? [];
    if (!winRateSort) return players;
    const sorted = [...players].sort((a, b) => {
      if (b.winRate !== a.winRate) {
        return winRateSort === "desc" ? b.winRate - a.winRate : a.winRate - b.winRate;
      }
      return b.games - a.games;
    });
    return sorted;
  }, [data?.players, winRateSort]);

  const toggleWinRateSort = () => {
    setWinRateSort((current) => {
      if (current === null) return "desc";
      if (current === "desc") return "asc";
      return null;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          내전 통계를 불러오는 중 오류가 발생했습니다.
        </CardContent>
      </Card>
    );
  }

  // Keep the page compatible with an older cached response created before
  // the TOP 3 field was added.
  const topPlayers = data.topPlayers ?? [];
  const togglePlayer = (playerId: string) => {
    setExpandedPlayerIds((current) => {
      const next = new Set(current);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  return (
    <section className="space-y-6" data-testid="inhouse-stats">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          내전 기록
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          밸런싱 기록에서 승패가 입력된 경기만 집계합니다. 아직 승패를 기록하지 않은 경기는 통계에서 제외됩니다.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard icon={<Users className="h-4 w-4" />} label="등록 플레이어" value={`${data.totalPlayers}명`} />
        <SummaryCard icon={<Gamepad2 className="h-4 w-4" />} label="기록된 경기" value={`${data.recordedMatches}경기`} />
        <SummaryCard icon={<Trophy className="h-4 w-4 text-blue-400" />} label="블루팀 승리" value={`${data.blueWins}회`} />
        <SummaryCard icon={<Trophy className="h-4 w-4 text-red-400" />} label="레드팀 승리" value={`${data.redWins}회`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-400" />
            승률 TOP 3
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            승패가 기록된 경기에서 승률이 높은 순서입니다. 승률이 같으면 경기 수와 승리 수가 많은 플레이어가 앞섭니다.
          </p>
        </CardHeader>
        <CardContent>
          {topPlayers.length === 0 ? (
            <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
              승률 TOP 3를 계산하려면 먼저 밸런싱 기록에 승패를 입력해주세요.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {topPlayers.map((player, index) => (
                <div
                  key={player.playerId}
                  className={`rounded-lg border p-4 ${
                    index === 0
                      ? "border-yellow-400/50 bg-yellow-400/10"
                      : index === 1
                        ? "border-slate-400/50 bg-slate-400/10"
                        : "border-orange-500/50 bg-orange-500/10"
                  }`}
                  data-testid={`inhouse-top-player-${index + 1}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={index === 0 ? "default" : "secondary"}>{index + 1}위</Badge>
                    <span className="text-2xl font-bold font-mono">{player.winRate.toFixed(1)}%</span>
                  </div>
                  <div className="mt-4 font-semibold truncate">
                    {player.discordName || player.summonerName}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{player.summonerName}</div>
                  <div className="mt-3 text-sm text-muted-foreground">
                    {player.games}경기 · <span className="text-blue-400">{player.wins}승</span>{" "}
                    <span className="text-red-400">{player.losses}패</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5" />
            플레이어별 승패 통계
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[2fr_1.2fr_repeat(4,0.8fr)] gap-3 px-4 py-3 text-xs text-muted-foreground border-b">
                <span>플레이어</span>
                <span>티어</span>
                <span className="text-center">경기</span>
                <span className="text-center">승</span>
                <span className="text-center">패</span>
                <button
                  type="button"
                  onClick={toggleWinRateSort}
                  className="flex items-center justify-center gap-1 text-center hover:text-foreground transition-colors"
                  aria-label="승률 기준 정렬"
                  data-testid="button-sort-winrate"
                >
                  승률
                  {winRateSort === "desc" ? (
                    <ArrowDown className="h-3 w-3" />
                  ) : winRateSort === "asc" ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3" />
                  )}
                </button>
              </div>
              <div className="divide-y">
                {sortedPlayers.map((player) => {
                  const isExpanded = expandedPlayerIds.has(player.playerId);
                  return (
                    <div key={player.playerId} data-testid={`inhouse-player-stat-${player.playerId}`}>
                      <div className="grid grid-cols-[2fr_1.2fr_repeat(4,0.8fr)] gap-3 items-center px-4 py-3">
                        <div className="min-w-0">
                          <Button
                            type="button"
                            variant="link"
                            className="h-auto max-w-full justify-start p-0 font-medium text-foreground"
                            onClick={() => togglePlayer(player.playerId)}
                            aria-expanded={isExpanded}
                            data-testid={`button-toggle-lane-stats-${player.playerId}`}
                          >
                            <span className="flex min-w-0 items-center gap-1">
                              <span className="truncate">{player.discordName || player.summonerName}</span>
                              {isExpanded ? (
                                <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              )}
                            </span>
                          </Button>
                          <div className="text-xs text-muted-foreground truncate">{player.summonerName}</div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {player.tier} {player.rank || ""}
                        </div>
                        <div className="text-center font-mono">{player.games}</div>
                        <div className="text-center font-mono text-blue-400">{player.wins}</div>
                        <div className="text-center font-mono text-red-400">{player.losses}</div>
                        <div className="text-center">
                          <Badge variant={player.games === 0 ? "outline" : player.winRate >= 50 ? "default" : "secondary"}>
                            {player.games === 0 ? "-" : `${player.winRate.toFixed(1)}%`}
                          </Badge>
                        </div>
                      </div>
                      {isExpanded && <LaneStatsPanel player={player} />}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {data.recordedMatches === 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              <CircleHelp className="h-4 w-4 shrink-0" />
              밸런싱 기록 탭에서 각 경기의 블루팀 또는 레드팀 승리를 입력하면 통계가 계산됩니다.
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function LaneStatsPanel({ player }: { player: InhousePlayerStats }) {
  const laneStats = player.laneStats ?? [];
  const teammateStats = player.teammateStats ?? [];
  return (
    <div className="mx-4 mb-3 rounded-lg border bg-secondary/30 p-3" data-testid={`lane-stats-${player.playerId}`}>
      <div className="mb-3 text-sm font-medium">라인별 승률</div>
      {laneStats.some((lane) => lane.games > 0) ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {laneStats.map((lane) => (
            <div key={lane.position} className="rounded-md border bg-card p-2 text-center">
              <div className="text-xs font-semibold">{lane.position}</div>
              <div className="mt-1 font-mono text-sm">
                {lane.games > 0 ? `${lane.winRate.toFixed(1)}%` : "-"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {lane.games}경기 · {lane.wins}승 {lane.losses}패
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          기록된 경기의 추천 라인별 통계가 아직 없습니다.
        </div>
      )}

      <div className="mt-5 border-t pt-4">
        <div className="mb-3 text-sm font-medium">같은 팀으로 출전한 플레이어별 승률</div>
        {teammateStats.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="min-w-[620px]">
              <div className="grid grid-cols-[2fr_repeat(4,0.8fr)] gap-3 px-3 py-2 text-xs text-muted-foreground">
                <span>팀원</span>
                <span className="text-center">경기</span>
                <span className="text-center">승</span>
                <span className="text-center">패</span>
                <span className="text-center">승률</span>
              </div>
              <div className="divide-y rounded-md border bg-card">
                {teammateStats.map((teammate) => (
                  <div
                    key={teammate.playerId}
                    className="grid grid-cols-[2fr_repeat(4,0.8fr)] gap-3 items-center px-3 py-2"
                    data-testid={`teammate-stat-${player.playerId}-${teammate.playerId}`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {teammate.discordName || teammate.summonerName}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">{teammate.summonerName}</div>
                    </div>
                    <div className="text-center font-mono text-sm">{teammate.games}</div>
                    <div className="text-center font-mono text-sm text-blue-400">{teammate.wins}</div>
                    <div className="text-center font-mono text-sm text-red-400">{teammate.losses}</div>
                    <div className="text-center">
                      <Badge variant={teammate.winRate >= 50 ? "default" : "secondary"}>
                        {teammate.winRate.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            같은 팀으로 함께 출전한 승패 기록이 아직 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          {icon}
          {label}
        </div>
        <div className="mt-2 text-xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}