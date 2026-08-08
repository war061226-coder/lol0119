import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Trophy, Users, Calendar, TrendingUp, ArrowLeft, Shield, TreePine, Crosshair, Zap, Heart, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/loading-spinner";
import { type BalanceResult } from "@shared/schema";
import { Link } from "wouter";

export default function SharedBalance() {
  const { id } = useParams<{ id: string }>();
  
  const { data: balanceResult, isLoading, error } = useQuery({
    queryKey: [`/api/balance-results/${id}`],
    queryFn: async () => {
      const response = await fetch(`/api/balance-results/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch balance result');
      }
      return response.json();
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[60vh]">
            <LoadingSpinner message="밸런싱 결과를 불러오는 중..." />
          </div>
        </div>
      </div>
    );
  }

  if (error || !balanceResult) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <Trophy className="h-16 w-16 text-muted-foreground mb-4" />
            <h1 className="text-2xl font-bold mb-2">밸런싱 결과를 찾을 수 없습니다</h1>
            <p className="text-muted-foreground mb-6">
              요청한 밸런싱 결과가 존재하지 않거나 삭제되었을 수 있습니다.
            </p>
            <Link href="/">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                홈으로 돌아가기
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const result = balanceResult as BalanceResult;
  
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
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTeamPlayers = (team: any) => {
    if (typeof team === 'string') {
      try {
        team = JSON.parse(team);
      } catch {
        return [];
      }
    }
    
    if (!team || !team.players || !Array.isArray(team.players)) {
      return [];
    }

    return team.players.map((p: any) => {
      if (typeof p === 'string') return { summonerName: p };
      return {
        summonerName: p.summonerName || p.name || "알 수 없음",
        tier: p.tier || "",
        rank: p.rank || "",
        mainPosition: p.mainPosition || "",
        mmr: p.mmr || 0
      };
    });
  };

  const blueTeamPlayers = formatTeamPlayers(result.blueTeam);
  const redTeamPlayers = formatTeamPlayers(result.redTeam);

  const getPositionIcon = (position: string) => {
    const iconMap: Record<string, { component: any; color: string }> = {
      'TOP': { component: Shield, color: 'text-blue-500' },
      'JG': { component: TreePine, color: 'text-green-500' },
      'MID': { component: Crosshair, color: 'text-purple-500' },
      'ADC': { component: Zap, color: 'text-red-500' },
      'SUP': { component: Heart, color: 'text-yellow-500' }
    };
    return iconMap[position] || { component: HelpCircle, color: 'text-gray-500' };
  };

  const getTierClassName = (tier: string) => {
    const tierColors: Record<string, string> = {
      'IRON': 'text-gray-600 dark:text-gray-400',
      'BRONZE': 'text-amber-700 dark:text-amber-500',
      'SILVER': 'text-gray-500 dark:text-gray-400',
      'GOLD': 'text-yellow-600 dark:text-yellow-400',
      'PLATINUM': 'text-teal-600 dark:text-teal-400',
      'EMERALD': 'text-emerald-600 dark:text-emerald-400',
      'DIAMOND': 'text-blue-600 dark:text-blue-400',
      'MASTER': 'text-purple-600 dark:text-purple-400',
      'GRANDMASTER': 'text-red-600 dark:text-red-400',
      'CHALLENGER': 'text-orange-600 dark:text-orange-400'
    };
    return tierColors[tier] || 'text-gray-600 dark:text-gray-400';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  홈으로
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold">공유된 밸런싱 결과</h1>
                <p className="text-muted-foreground">
                  <Calendar className="h-4 w-4 inline mr-1" />
                  {formatDate(result.createdAt)}
                </p>
              </div>
            </div>
            <Badge variant={getBalanceScoreBadgeVariant(result.balanceScore)} className="text-lg px-4 py-2">
              <Trophy className="h-4 w-4 mr-2" />
              {Math.round(result.balanceScore)}점
            </Badge>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Balance Statistics */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              밸런스 통계
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">MMR 차이</p>
                <p className="text-2xl font-bold">{Math.round(result.mmrDifference)}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">승률 차이</p>
                <p className="text-2xl font-bold">{result.winRateDifference.toFixed(1)}%</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">포지션 매칭</p>
                <p className="text-2xl font-bold">{Math.round(result.positionBalance * 100)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Teams */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Blue Team */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                블루팀 (5명)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {blueTeamPlayers.map((player: any, index: number) => {
                const positionIcon = getPositionIcon(player.mainPosition);
                return (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-3">
                      <positionIcon.component className={`h-4 w-4 ${positionIcon.color}`} />
                      <div>
                        <p className="font-medium">{player.summonerName}</p>
                        <p className={`text-sm ${getTierClassName(player.tier)}`}>
                          {player.tier} {player.rank || ""} • MMR {player.mmr}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {player.mainPosition}
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Red Team */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                레드팀 (5명)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {redTeamPlayers.map((player: any, index: number) => {
                const positionIcon = getPositionIcon(player.mainPosition);
                return (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-3">
                      <positionIcon.component className={`h-4 w-4 ${positionIcon.color}`} />
                      <div>
                        <p className="font-medium">{player.summonerName}</p>
                        <p className={`text-sm ${getTierClassName(player.tier)}`}>
                          {player.tier} {player.rank || ""} • MMR {player.mmr}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {player.mainPosition}
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 pt-8 border-t border-border">
          <p className="text-muted-foreground text-sm">
            LoL 커스텀 게임 밸런서로 생성된 결과입니다
          </p>
          <Link href="/">
            <Button variant="outline" className="mt-4">
              <Users className="h-4 w-4 mr-2" />
              나도 팀 밸런싱 해보기
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}