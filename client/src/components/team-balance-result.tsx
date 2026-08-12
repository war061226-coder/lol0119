import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { type BalanceAnalysis, type ShareableBalanceResult, type Player, type RecommendedPlayer } from "@shared/schema";
import ShareBalance from "./share-balance";

interface TeamBalanceResultProps {
  balanceResult: ShareableBalanceResult;
  onRebalance: () => void;
  isRebalancing: boolean;
}

export default function TeamBalanceResult({ 
  balanceResult, 
  onRebalance, 
  isRebalancing 
}: TeamBalanceResultProps) {
  const [exportFormat, setExportFormat] = useState<string>("json");
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetDescription, setPresetDescription] = useState("");
  const [isCopyingImage, setIsCopyingImage] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 프리셋 저장 mutation
  const createPresetMutation = useMutation({
    mutationFn: async (presetData: { name: string; description?: string; playerNames: string[] }) => {
      const response = await apiRequest("POST", "/api/presets", presetData);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/presets'] });
      setIsPresetModalOpen(false);
      setPresetName("");
      setPresetDescription("");
      toast({
        title: "프리셋 저장 완료",
        description: data.message,
      });
    },
    onError: (error) => {
      toast({
        title: "프리셋 저장 실패",
        description: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  // 현재 팀의 모든 플레이어 이름 수집
  const getAllPlayerNames = () => {
    const allPlayers = [
      ...balanceResult.blueTeam.players,
      ...balanceResult.redTeam.players
    ];
    return allPlayers.map(player => player.summonerName);
  };

  // 프리셋 저장 함수
  const handleSavePreset = () => {
    if (!presetName.trim()) {
      toast({
        title: "프리셋 이름 필요",
        description: "프리셋 이름을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    const playerNames = getAllPlayerNames();
    createPresetMutation.mutate({
      name: presetName.trim(),
      description: presetDescription.trim() || undefined,
      playerNames,
    });
  };

  // 티어를 숫자로 변환하는 함수
  const tierToNumber = (tier: string, rank?: string | null) => {
    const tierValues: Record<string, number> = {
      'IRON': 100,
      'BRONZE': 200,
      'SILVER': 300,
      'GOLD': 400,
      'PLATINUM': 500,
      'EMERALD': 600,
      'DIAMOND': 700,
      'MASTER': 800,
      'GRANDMASTER': 900,
      'CHALLENGER': 1000,
    };
    
    const rankValues: Record<string, number> = {
      'IV': 10,
      'III': 20,
      'II': 30,
      'I': 40,
    };
    
    const tierBase = tierValues[tier] || 300; // 기본값 SILVER
    const rankBonus = (rank && rankValues[rank]) || 25; // 기본값 중간 랭크
    
    return tierBase + rankBonus;
  };

  // 숫자를 티어로 변환하는 함수 (tierToNumber의 역함수)
  const numberToTier = (value: number) => {
    // 티어 베이스 값들 (tierToNumber와 동일)
    const tierBases = [
      { tier: 'CHALLENGER', base: 1000, hasRanks: false },
      { tier: 'GRANDMASTER', base: 900, hasRanks: false },
      { tier: 'MASTER', base: 800, hasRanks: false },
      { tier: 'DIAMOND', base: 700, hasRanks: true },
      { tier: 'EMERALD', base: 600, hasRanks: true },
      { tier: 'PLATINUM', base: 500, hasRanks: true },
      { tier: 'GOLD', base: 400, hasRanks: true },
      { tier: 'SILVER', base: 300, hasRanks: true },
      { tier: 'BRONZE', base: 200, hasRanks: true },
      { tier: 'IRON', base: 100, hasRanks: true },
    ];

    // 해당하는 티어 찾기
    for (const tierInfo of tierBases) {
      if (value >= tierInfo.base) {
        if (!tierInfo.hasRanks) {
          return { tier: tierInfo.tier, rank: '' };
        }
        
        // 랭크 계산 (tierToNumber와 정확히 매치)
        const delta = value - tierInfo.base;
        if (delta >= 40) return { tier: tierInfo.tier, rank: 'I' };
        if (delta >= 30) return { tier: tierInfo.tier, rank: 'II' };
        if (delta >= 20) return { tier: tierInfo.tier, rank: 'III' };
        return { tier: tierInfo.tier, rank: 'IV' };
      }
    }
    
    // 기본값
    return { tier: 'IRON', rank: 'IV' };
  };

  // 팀의 평균 티어 계산
  const calculateAverageTier = (players: Player[]) => {
    if (players.length === 0) return { tier: 'SILVER', rank: 'IV' };
    
    const totalTierValue = players.reduce((sum, player) => {
      return sum + tierToNumber(player.tier, player.rank);
    }, 0);
    
    const averageValue = totalTierValue / players.length;
    return numberToTier(averageValue);
  };

  const blueTeamAverageTier = calculateAverageTier(balanceResult.blueTeam.players);
  const redTeamAverageTier = calculateAverageTier(balanceResult.redTeam.players);

  // 개발 중 검증: tierToNumber와 numberToTier가 올바르게 매치되는지 확인
  if (process.env.NODE_ENV === 'development') {
    // 몇 가지 테스트 케이스로 검증
    const testCases = [
      { tier: 'DIAMOND', rank: 'I' }, // 700 + 40 = 740
      { tier: 'DIAMOND', rank: 'IV' }, // 700 + 10 = 710
      { tier: 'SILVER', rank: 'II' }, // 300 + 30 = 330
      { tier: 'MASTER', rank: null }, // 800 + 25 = 825
    ];
    
    testCases.forEach(({ tier, rank }) => {
      const value = tierToNumber(tier, rank);
      const result = numberToTier(value);
      const expected = rank || '';
      if (result.tier !== tier || result.rank !== expected) {
        console.warn(`티어 변환 검증 실패: ${tier} ${rank} -> ${value} -> ${result.tier} ${result.rank}`);
      }
    });
  }

  // 내보내기 함수들
  const downloadFile = (content: string, filename: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportAsJSON = () => {
    const exportData = {
      timestamp: new Date().toISOString(),
      balanceScore: balanceResult.balanceScore,
      blueTeam: {
        players: balanceResult.blueTeam.players,
        averageMmr: balanceResult.blueTeam.averageMmr,
        averageWinRate: balanceResult.blueTeam.averageWinRate,
        averageTier: blueTeamAverageTier,
        teamScore: balanceResult.blueTeam.teamScore
      },
      redTeam: {
        players: balanceResult.redTeam.players,
        averageMmr: balanceResult.redTeam.averageMmr,
        averageWinRate: balanceResult.redTeam.averageWinRate,
        averageTier: redTeamAverageTier,
        teamScore: balanceResult.redTeam.teamScore
      },
      analysis: {
        mmrDifference: balanceResult.mmrDifference,
        winRateDifference: balanceResult.winRateDifference,
        positionMatch: balanceResult.positionMatch
      }
    };

    const content = JSON.stringify(exportData, null, 2);
    const filename = `team-balance-${new Date().toISOString().slice(0, 10)}.json`;
    downloadFile(content, filename, 'application/json');
    
    toast({
      title: "내보내기 완료",
      description: "팀 구성이 JSON 파일로 저장되었습니다.",
    });
  };

  const exportAsCSV = () => {
    const headers = ['팀', '소환사명', '티어', '랭크', 'LP', '승수', '패수', '승률', '레벨', '포지션', 'MMR'];
    const rows = [headers];

    // 블루팀 데이터 추가
    balanceResult.blueTeam.players.forEach(player => {
      rows.push([
        '블루팀',
        player.summonerName,
        player.tier,
        player.rank || '',
        player.leaguePoints.toString(),
        player.wins.toString(),
        player.losses.toString(),
        Math.round(player.winRate * 100) + '%',
        player.level.toString(),
        player.mainPosition,
        player.mmr.toString()
      ]);
    });

    // 레드팀 데이터 추가
    balanceResult.redTeam.players.forEach(player => {
      rows.push([
        '레드팀',
        player.summonerName,
        player.tier,
        player.rank || '',
        player.leaguePoints.toString(),
        player.wins.toString(),
        player.losses.toString(),
        Math.round(player.winRate * 100) + '%',
        player.level.toString(),
        player.mainPosition,
        player.mmr.toString()
      ]);
    });

    const content = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const filename = `team-balance-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadFile('\ufeff' + content, filename, 'text/csv;charset=utf-8'); // BOM for Excel compatibility
    
    toast({
      title: "내보내기 완료",
      description: "팀 구성이 CSV 파일로 저장되었습니다.",
    });
  };

  const exportAsImage = async () => {
    try {
      // html2canvas 라이브러리가 필요함 - 동적 import 시도
      const html2canvas = await import('html2canvas').then(m => m.default).catch(() => null);
      
      if (!html2canvas) {
        // html2canvas가 없으면 Canvas API를 사용한 기본 이미지 생성
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context not available');

        canvas.width = 800;
        canvas.height = 600;
        ctx.fillStyle = '#1f2937'; // 배경색
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = '24px Arial';
        ctx.fillText('LoL 팀 밸런스 결과', 50, 50);
        
        ctx.font = '18px Arial';
        ctx.fillStyle = '#60a5fa'; // 블루팀 색상
        ctx.fillText('블루팀', 50, 100);
        
        // 블루팀 플레이어 표시
        balanceResult.blueTeam.players.forEach((player, i) => {
          ctx.fillStyle = '#ffffff';
          ctx.font = '14px Arial';
          ctx.fillText(`${player.summonerName} (${player.tier} ${player.rank || ''})`, 50, 130 + i * 25);
        });

        ctx.fillStyle = '#f87171'; // 레드팀 색상
        ctx.font = '18px Arial';
        ctx.fillText('레드팀', 450, 100);
        
        // 레드팀 플레이어 표시
        balanceResult.redTeam.players.forEach((player, i) => {
          ctx.fillStyle = '#ffffff';
          ctx.font = '14px Arial';
          ctx.fillText(`${player.summonerName} (${player.tier} ${player.rank || ''})`, 450, 130 + i * 25);
        });

        // 밸런스 점수 표시
        ctx.fillStyle = '#10b981';
        ctx.font = '20px Arial';
        ctx.fillText(`밸런스 점수: ${balanceResult.balanceScore}/100`, 300, 400);

        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `team-balance-${new Date().toISOString().slice(0, 10)}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }
        });
      } else {
        // html2canvas가 있으면 실제 DOM 요소 캡처
        const element = document.querySelector('[data-testid="team-balance-result"]') as HTMLElement;
        if (element) {
          const canvas = await html2canvas(element);
          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `team-balance-${new Date().toISOString().slice(0, 10)}.png`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
            }
          });
        }
      }

      toast({
        title: "내보내기 완료",
        description: "팀 구성이 이미지로 저장되었습니다.",
      });
    } catch (error) {
      toast({
        title: "내보내기 실패",
        description: "이미지 생성 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleExport = () => {
    switch (exportFormat) {
      case 'json':
        exportAsJSON();
        break;
      case 'csv':
        exportAsCSV();
        break;
      case 'image':
        exportAsImage();
        break;
      default:
        exportAsJSON();
    }
  };

  // 팀 구성 결과 패널을 이미지로 캡처해서 클립보드에 복사
  const handleCopyResultImage = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard || typeof window.ClipboardItem === "undefined") {
      toast({
        title: "복사 실패",
        description: "현재 환경에서는 클립보드로 이미지를 복사할 수 없습니다.",
        variant: "destructive",
      });
      return;
    }

    setIsCopyingImage(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const element = document.querySelector('[data-testid="team-balance-result"]') as HTMLElement | null;
      if (!element) {
        throw new Error("캡처할 팀 구성 결과 화면을 찾을 수 없습니다.");
      }

      const canvas = await html2canvas(element, {
        backgroundColor: "#0b0d0f",
        useCORS: true,
        scale: Math.min(2, window.devicePixelRatio || 1),
      });

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) {
        throw new Error("이미지를 생성하지 못했습니다.");
      }

      await navigator.clipboard.write([
        new window.ClipboardItem({ "image/png": blob }),
      ]);

      toast({
        title: "복사 완료",
        description: "팀 구성 결과를 이미지로 클립보드에 복사했습니다. 원하는 곳에 붙여넣기(Ctrl+V) 해주세요.",
      });
    } catch (error) {
      toast({
        title: "복사 실패",
        description: error instanceof Error ? error.message : "이미지를 클립보드에 복사하는 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsCopyingImage(false);
    }
  };

  const getBalanceScoreClass = (score: number) => {
    if (score >= 90) return 'balance-excellent';
    if (score >= 80) return 'balance-good';
    if (score >= 70) return 'balance-fair';
    return 'balance-poor';
  };

  const getTierClassName = (tier: string) => {
    const tierMap: Record<string, string> = {
      'IRON': 'tier-iron',
      'BRONZE': 'tier-bronze',
      'SILVER': 'tier-silver',
      'GOLD': 'tier-gold',
      'PLATINUM': 'tier-platinum',
      'EMERALD': 'tier-emerald',
      'DIAMOND': 'tier-diamond',
      'MASTER': 'tier-master',
      'GRANDMASTER': 'tier-grandmaster',
      'CHALLENGER': 'tier-challenger',
    };
    return tierMap[tier] || 'text-foreground';
  };

  const getPositionIcon = (position: string) => {
    const iconMap: Record<string, { icon: string, color: string }> = {
      'TOP': { icon: 'fas fa-sword', color: 'text-red-400' },
      'JG': { icon: 'fas fa-tree', color: 'text-green-400' },
      'MID': { icon: 'fas fa-magic', color: 'text-blue-400' },
      'ADC': { icon: 'fas fa-bow-arrow', color: 'text-yellow-400' },
      'SUP': { icon: 'fas fa-shield', color: 'text-cyan-400' },
    };
    return iconMap[position] || { icon: 'fas fa-user', color: 'text-muted-foreground' };
  };

  const getWinRateColor = (winRate: number) => {
    if (winRate >= 65) return 'text-green-400';
    if (winRate >= 55) return 'text-yellow-400';
    return 'text-red-400';
  };

  const positionOrder: Record<string, number> = {
    TOP: 0,
    JG: 1,
    MID: 2,
    ADC: 3,
    SUP: 4,
  };

  const sortByRecommendedPosition = (players: RecommendedPlayer[]) =>
    [...players].sort((a, b) => {
      const aPosition = a.recommendedPosition || a.mainPosition;
      const bPosition = b.recommendedPosition || b.mainPosition;
      return (positionOrder[aPosition] ?? 99) - (positionOrder[bPosition] ?? 99);
    });

  const blueTeamPlayers = sortByRecommendedPosition(balanceResult.blueTeam.players);
  const redTeamPlayers = sortByRecommendedPosition(balanceResult.redTeam.players);

  const getAnalysisLabel = (score: number) => {
    if (score >= 90) return { text: "매우 좋음", className: "text-green-400" };
    if (score >= 75) return { text: "좋음", className: "text-green-400" };
    if (score >= 55) return { text: "보통", className: "text-yellow-400" };
    return { text: "차이 큼", className: "text-red-400" };
  };

  const balanceScoreLabel = getAnalysisLabel(balanceResult.balanceScore);
  const positionScore = Math.round(balanceResult.positionMatch * 100);
  const positionLabel = positionScore === 100
    ? "모든 라인 일치"
    : positionScore >= 60
      ? "일부 라인 일치"
      : "라인 불일치";
  const maxAverageMmr = Math.max(balanceResult.blueTeam.averageMmr, balanceResult.redTeam.averageMmr);
  const mmrDifferencePercent = maxAverageMmr > 0
    ? (balanceResult.mmrDifference / maxAverageMmr) * 100
    : 0;

  const renderTeamPlayer = (player: RecommendedPlayer) => {
    const recommendedPosition = player.recommendedPosition || player.mainPosition;
    const positionIcon = getPositionIcon(recommendedPosition);
    const displayTier = player.manualTier || player.tier;
    const displayRank = player.manualRank || player.rank;
    const pityScore = player.pityScore ?? 0;
    const gotPityPriority = pityScore >= 35 && recommendedPosition === player.mainPosition;
    
    return (
      <div 
        key={player.id} 
        className="bg-opacity-30 rounded-lg p-3 flex items-center"
        data-testid={`team-player-${player.id}`}
      >
        <div className="w-8 h-8 bg-muted rounded mr-3 flex items-center justify-center">
          <i className={`${positionIcon.icon} ${positionIcon.color} text-sm`}></i>
        </div>
        <div className="flex-1">
          <div className="font-medium text-sm flex items-center gap-1.5" data-testid={`text-player-name-${player.id}`}>
            {player.summonerName}
            {gotPityPriority && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40"
                title={`가산점 ${pityScore}점 누적으로 주라인1 우선배정됨`}
                data-testid={`badge-pity-priority-${player.id}`}
              >
                🎯 천장 우선배정
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground flex items-center space-x-2">
            <span className={getTierClassName(displayTier)} data-testid={`text-player-tier-${player.id}`}>
              {displayTier} {displayRank || ""}
              {player.manualTier && (
                <span className="ml-1 text-[10px] text-amber-400" title="수동 설정된 티어">
                  *
                </span>
              )}
            </span>
            <span>•</span>
            <span data-testid={`text-player-position-${player.id}`}>
              추천 라인: <strong className="text-foreground">{recommendedPosition || "N/A"}</strong>
            </span>
            {pityScore > 0 && (
              <>
                <span>•</span>
                <span
                  className={pityScore >= 35 ? "text-amber-400 font-semibold" : "text-muted-foreground"}
                  data-testid={`text-player-pity-${player.id}`}
                  title="주라인1 우선배정 가산점 (35점 이상이면 다음 밸런싱에서 우선배정)"
                >
                  가산점 {pityScore}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="mb-8">
      <Card className="bg-card border-border" data-testid="team-balance-result" data-balance-result>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold flex items-center">
              <i className="fas fa-users-cog mr-2 text-primary"></i>
              팀 구성 결과
            </h2>
            
            <div className="flex items-center space-x-4">
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">밸런스 점수</div>
                <div 
                  className={`${getBalanceScoreClass(balanceResult.balanceScore)} text-white px-3 py-1 rounded-full text-sm font-mono font-semibold`}
                  data-testid="text-balance-score"
                >
                  {balanceResult.balanceScore}/100
                </div>
              </div>
              <Button
                variant="secondary"
                onClick={onRebalance}
                disabled={isRebalancing}
                className="bg-secondary text-foreground px-4 py-2 rounded-lg hover:bg-muted transition-colors flex items-center text-sm"
                data-testid="button-rebalance"
              >
                <i className="fas fa-sync-alt mr-2"></i>
                {isRebalancing ? "재구성 중..." : "재구성"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Blue Team */}
            <div className="bg-blue-900/20 rounded-lg p-4 border-2 border-blue-500/30" data-testid="blue-team">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-blue-400 flex items-center">
                  <i className="fas fa-shield mr-2"></i>
                  블루팀
                </h3>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">평균 티어</div>
                  <div className={`text-sm font-mono ${getTierClassName(blueTeamAverageTier.tier)}`} data-testid="text-blue-average-tier">
                    {blueTeamAverageTier.tier} {blueTeamAverageTier.rank}
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                  {blueTeamPlayers.map(renderTeamPlayer)}
              </div>

              <div className="mt-4 pt-3 border-t border-blue-500/20">
                <div className="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                  <div className="text-sm font-semibold text-blue-300 mb-2">추천 라인</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs text-muted-foreground">
                    {blueTeamPlayers.map((player) => (
                      <div key={`blue-recommendation-${player.id}`}>
                        {player.summonerName}: <strong className="text-foreground">{player.recommendedPosition || player.mainPosition}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xs text-muted-foreground">평균 MMR</div>
                    <div className="font-mono text-sm" data-testid="text-blue-average-mmr">
                      {balanceResult.blueTeam.averageMmr}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">팀 점수</div>
                    <div className="font-mono text-sm text-blue-400" data-testid="text-blue-team-score">
                      {balanceResult.blueTeam.teamScore}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Red Team */}
            <div className="bg-red-900/20 rounded-lg p-4 border-2 border-red-500/30" data-testid="red-team">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-red-400 flex items-center">
                  <i className="fas fa-fire mr-2"></i>
                  레드팀
                </h3>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">평균 티어</div>
                  <div className={`text-sm font-mono ${getTierClassName(redTeamAverageTier.tier)}`} data-testid="text-red-average-tier">
                    {redTeamAverageTier.tier} {redTeamAverageTier.rank}
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                {redTeamPlayers.map(renderTeamPlayer)}
              </div>

              <div className="mt-4 pt-3 border-t border-red-500/20">
                <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                  <div className="text-sm font-semibold text-red-300 mb-2">추천 라인</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs text-muted-foreground">
                    {redTeamPlayers.map((player) => (
                      <div key={`red-recommendation-${player.id}`}>
                        {player.summonerName}: <strong className="text-foreground">{player.recommendedPosition || player.mainPosition}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xs text-muted-foreground">평균 MMR</div>
                    <div className="font-mono text-sm" data-testid="text-red-average-mmr">
                      {balanceResult.redTeam.averageMmr}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">팀 점수</div>
                    <div className="font-mono text-sm text-red-400" data-testid="text-red-team-score">
                      {balanceResult.redTeam.teamScore}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Balance Analysis */}
          <div className="mt-6 pt-4 border-t border-border">
            <h3 className="text-sm font-medium mb-3 flex items-center">
              <i className="fas fa-chart-line mr-2 text-accent"></i>
              밸런스 분석
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="bg-secondary/50 rounded p-3">
                <div className="text-muted-foreground mb-1">팀 전투력 차이</div>
                <div className={`font-mono ${balanceResult.mmrDifference === 0 ? "text-green-400" : balanceResult.mmrDifference <= 20 ? "text-yellow-400" : "text-red-400"}`} data-testid="text-mmr-difference">
                  {balanceResult.mmrDifference} (<span className="text-xs">
                    {mmrDifferencePercent.toFixed(1)}%
                  </span>) · {balanceResult.mmrDifference === 0 ? "동일" : balanceResult.mmrDifference <= 20 ? "근접" : "차이 큼"}
                </div>
              </div>
              <div className="bg-secondary/50 rounded p-3">
                <div className="text-muted-foreground mb-1">포지션 매치</div>
                <div className={`font-mono ${positionScore === 100 ? "text-green-400" : positionScore >= 60 ? "text-yellow-400" : "text-red-400"}`} data-testid="text-position-match">
                  {positionScore}% ({positionLabel})
                </div>
              </div>
              <div className="bg-secondary/50 rounded p-3">
                <div className="text-muted-foreground mb-1">종합 평가</div>
                <div className={`font-mono ${balanceScoreLabel.className}`} data-testid="text-balance-analysis">
                  {balanceScoreLabel.text} · {balanceResult.balanceScore}/100
                </div>
              </div>
            </div>
          </div>

          {/* Additional Actions */}
          <div className="mt-6 pt-4 border-t border-border">
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Select value={exportFormat} onValueChange={setExportFormat}>
                  <SelectTrigger className="w-24 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="image">이미지</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="default"
                  onClick={handleExport}
                  className="bg-accent text-accent-foreground px-4 py-2 rounded-lg hover:bg-accent/90 transition-colors flex items-center text-sm"
                  data-testid="button-export-teams"
                >
                  <i className="fas fa-download mr-2"></i>
                  내보내기
                </Button>
              </div>
              <Button
                variant="secondary"
                onClick={handleCopyResultImage}
                disabled={isCopyingImage}
                className="bg-secondary text-foreground px-4 py-2 rounded-lg hover:bg-muted transition-colors flex items-center text-sm"
                data-testid="button-copy-result-image"
              >
                <i className="fas fa-camera mr-2"></i>
                {isCopyingImage ? "캡처 중..." : "결과 이미지 복사"}
              </Button>
              <Dialog open={isPresetModalOpen} onOpenChange={setIsPresetModalOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="secondary"
                    className="bg-secondary text-foreground px-4 py-2 rounded-lg hover:bg-muted transition-colors flex items-center text-sm"
                    data-testid="button-save-preset"
                  >
                    <i className="fas fa-save mr-2"></i>
                    프리셋 저장
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>프리셋 저장</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="preset-name">프리셋 이름 *</Label>
                      <Input
                        id="preset-name"
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        placeholder="프리셋 이름을 입력하세요"
                        data-testid="input-preset-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="preset-description">설명 (선택)</Label>
                      <Textarea
                        id="preset-description"
                        value={presetDescription}
                        onChange={(e) => setPresetDescription(e.target.value)}
                        placeholder="프리셋에 대한 설명을 입력하세요"
                        rows={3}
                        data-testid="textarea-preset-description"
                      />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <p>저장될 플레이어 ({getAllPlayerNames().length}명):</p>
                      <div className="max-h-20 overflow-y-auto bg-muted p-2 rounded text-xs mt-1">
                        {getAllPlayerNames().map((name, index) => (
                          <span key={index} className="inline-block mr-2 mb-1">
                            {name}
                            {index < getAllPlayerNames().length - 1 && ","}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => setIsPresetModalOpen(false)}
                        data-testid="button-cancel-preset"
                      >
                        취소
                      </Button>
                      <Button
                        onClick={handleSavePreset}
                        disabled={createPresetMutation.isPending}
                        data-testid="button-confirm-save-preset"
                      >
                        {createPresetMutation.isPending ? "저장 중..." : "저장"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Button
                variant="secondary"
                className="bg-secondary text-foreground px-4 py-2 rounded-lg hover:bg-muted transition-colors flex items-center text-sm"
                data-testid="button-show-history"
              >
                <i className="fas fa-history mr-2"></i>
                기록 보기
              </Button>
              <ShareBalance 
                balanceResult={balanceResult}
                balanceResultId={balanceResult.id}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
