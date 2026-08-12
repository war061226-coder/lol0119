import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ArrowDown, ArrowUp } from "lucide-react";
import { type Player } from "@shared/schema";

const POSITION_SORT_ORDER: Record<string, number> = { TOP: 1, JG: 2, MID: 3, ADC: 4, SUP: 5 };
const getPositionSortValue = (position?: string | null) =>
  position ? (POSITION_SORT_ORDER[position] ?? 99) : 99;

interface PlayerDataSectionProps {
  players: Player[];
  onBalanceTeams: () => void;
  isBalancing: boolean;
  onUpdatePlayer?: (playerId: string, updatedData: Partial<Player>) => void;
  onRefreshPlayers?: () => void;
  isRefreshing?: boolean;
}

export default function PlayerDataSection({ 
  players, 
  onBalanceTeams, 
  isBalancing,
  onUpdatePlayer,
  onRefreshPlayers,
  isRefreshing = false
}: PlayerDataSectionProps) {
  const [sortBy, setSortBy] = useState<string>("tier");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [editingPlayer, setEditingPlayer] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Player>>({});

  const tierOptions = [
    { value: 'IRON', label: 'IRON' },
    { value: 'BRONZE', label: 'BRONZE' },
    { value: 'SILVER', label: 'SILVER' },
    { value: 'GOLD', label: 'GOLD' },
    { value: 'PLATINUM', label: 'PLATINUM' },
    { value: 'EMERALD', label: 'EMERALD' },
    { value: 'DIAMOND', label: 'DIAMOND' },
    { value: 'MASTER', label: 'MASTER' },
    { value: 'GRANDMASTER', label: 'GRANDMASTER' },
    { value: 'CHALLENGER', label: 'CHALLENGER' }
  ];

  const rankOptions = [
    { value: 'IV', label: 'IV' },
    { value: 'III', label: 'III' },
    { value: 'II', label: 'II' },
    { value: 'I', label: 'I' }
  ];

  const positionOptions = [
    { value: 'TOP', label: 'TOP' },
    { value: 'JG', label: 'JG' },
    { value: 'MID', label: 'MID' },
    { value: 'ADC', label: 'ADC' },
    { value: 'SUP', label: 'SUP' }
  ];

  const startEditing = (player: Player) => {
    setEditingPlayer(player.id);
    setEditData({
      tier: player.tier,
      rank: player.rank,
      leaguePoints: player.leaguePoints,
      wins: player.wins,
      losses: player.losses,
      level: player.level,
      mainPosition: player.mainPosition,
      mainPosition2: player.mainPosition2,
      subPosition: player.subPosition,
      subPosition2: player.subPosition2,
      manualTier: player.manualTier,
      manualRank: player.manualRank
    });
  };

  const saveEdits = () => {
    if (editingPlayer && onUpdatePlayer) {
      // Calculate new win rate if wins/losses changed
      const winRate = editData.wins && editData.losses 
        ? editData.wins / (editData.wins + editData.losses)
        : editData.wins === 0 && editData.losses === 0
        ? 0
        : undefined;
      
      onUpdatePlayer(editingPlayer, {
        ...editData,
        ...(winRate !== undefined && { winRate })
      });
    }
    setEditingPlayer(null);
    setEditData({});
  };

  const cancelEditing = () => {
    setEditingPlayer(null);
    setEditData({});
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
    if (winRate >= 0.65) return 'text-green-400';
    if (winRate >= 0.55) return 'text-yellow-400';
    return 'text-red-400';
  };

  // Helper function to convert tier/rank to numeric value for sorting
  const getTierValue = (player: Player): number => {
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
      'CHALLENGER': 1000
    };
    
    const rankValues: Record<string, number> = {
      'IV': 10,
      'III': 20,
      'II': 30,
      'I': 40
    };
    
    const tierValue = tierValues[player.tier] || 300; // Default to SILVER
    const rankValue = player.rank ? (rankValues[player.rank] || 20) : 25; // Default to middle rank or 25 for high tiers
    const lpValue = (player.leaguePoints || 0) * 0.01; // LP as decimal
    
    return tierValue + rankValue + lpValue;
  };

  const sortedPlayers = [...players].sort((a, b) => {
    let diff = 0;
    switch (sortBy) {
      case 'tier':
        // Sort by tier/rank/LP combination
        diff = getTierValue(b) - getTierValue(a);
        break;
      case 'mainPosition':
        diff = getPositionSortValue(a.mainPosition) - getPositionSortValue(b.mainPosition);
        break;
      case 'subPosition':
        diff = getPositionSortValue(a.subPosition) - getPositionSortValue(b.subPosition);
        break;
      case 'mmr': {
        // Sort by MMR with fallback to tier if MMR is invalid
        const mmrA = typeof a.mmr === 'number' && !isNaN(a.mmr) ? a.mmr : getTierValue(a) * 10;
        const mmrB = typeof b.mmr === 'number' && !isNaN(b.mmr) ? b.mmr : getTierValue(b) * 10;
        diff = mmrB - mmrA;
        break;
      }
      case 'name':
        diff = a.summonerName.localeCompare(b.summonerName);
        break;
      case 'winrate': {
        const winrateA = typeof a.winRate === 'number' && !isNaN(a.winRate) ? a.winRate : 0;
        const winrateB = typeof b.winRate === 'number' && !isNaN(b.winRate) ? b.winRate : 0;
        diff = winrateB - winrateA;
        break;
      }
      case 'level':
        diff = (b.level || 0) - (a.level || 0);
        break;
      default:
        diff = 0;
    }
    return sortDirection === 'desc' ? diff : -diff;
  });

  return (
    <section className="mb-8">
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center">
              <i className="fas fa-chart-bar mr-2 text-accent"></i>
              플레이어 정보
            </h2>
            <div className="flex items-center space-x-2">
              {onRefreshPlayers && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRefreshPlayers}
                  disabled={isRefreshing}
                  className="h-8 px-3"
                  data-testid="button-refresh-players"
                >
                  <i className={`fas fa-sync-alt mr-2 ${isRefreshing ? 'animate-spin' : ''}`}></i>
                  {isRefreshing ? "새로고침 중..." : "전적 새로고침"}
                </Button>
              )}
              <span className="text-sm text-muted-foreground">정렬:</span>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tier">티어순</SelectItem>
                  <SelectItem value="mainPosition">주라인순</SelectItem>
                  <SelectItem value="subPosition">부라인순</SelectItem>
                  <SelectItem value="mmr">MMR순</SelectItem>
                  <SelectItem value="winrate">승율순</SelectItem>
                  <SelectItem value="level">레벨순</SelectItem>
                  <SelectItem value="name">이름순</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() => setSortDirection((current) => (current === "desc" ? "asc" : "desc"))}
                aria-label="정렬 방향 전환"
                data-testid="button-toggle-sort-direction"
              >
                {sortDirection === "desc" ? (
                  <ArrowDown className="h-4 w-4" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {sortedPlayers.map((player) => {
              const positionIcon = getPositionIcon(player.mainPosition);
              const isEditing = editingPlayer === player.id;
              
              return (
                <div
                  key={player.id}
                  className={`bg-secondary rounded-lg p-4 border transition-colors ${
                    isEditing ? 'border-accent' : 'border-border hover:border-primary/50'
                  }`}
                  data-testid={`card-player-${player.id}`}
                >
                  <div className="flex items-start mb-3">
                    <div className="flex flex-col items-center mr-3">
                      <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                        <i className="fas fa-user text-muted-foreground"></i>
                      </div>
                      {isEditing ? (
                        <Input
                          type="number"
                          value={editData.level || ''}
                          onChange={(e) => setEditData(prev => ({ ...prev, level: parseInt(e.target.value) || 0 }))}
                          className="w-8 h-6 text-xs p-1 mt-1 text-center"
                          data-testid={`input-level-${player.id}`}
                        />
                      ) : (
                        <span 
                          className="text-xs font-semibold text-foreground mt-1" 
                          data-testid={`text-level-${player.id}`}
                        >
                          {player.level}
                        </span>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm mb-1 flex items-center gap-1.5" data-testid={`text-summoner-name-${player.id}`}>
                        {player.summonerName}
                        {(player.pityScore ?? 0) > 0 && (
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ${
                              (player.pityScore ?? 0) >= 50
                                ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                                : "bg-muted text-muted-foreground border-border"
                            }`}
                            title="주라인1 우선배정 가산점 (50점 이상이면 다음 밸런싱에서 주라인1로 우선배정)"
                            data-testid={`badge-pity-${player.id}`}
                          >
                            {(player.pityScore ?? 0) >= 50 ? "🎯 " : ""}가산점 {player.pityScore ?? 0}
                          </span>
                        )}
                      </h3>
                      {onUpdatePlayer && (
                        <div className="flex gap-1">
                          {!isEditing ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => startEditing(player)}
                              className="h-6 px-2 text-xs"
                              data-testid={`button-edit-${player.id}`}
                            >
                              <i className="fas fa-edit mr-1"></i>
                              편집
                            </Button>
                          ) : (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                onClick={saveEdits}
                                className="h-6 px-2 text-xs bg-green-600 hover:bg-green-700"
                                data-testid={`button-save-${player.id}`}
                              >
                                <i className="fas fa-check mr-1"></i>
                                저장
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={cancelEditing}
                                className="h-6 px-2 text-xs"
                                data-testid={`button-cancel-${player.id}`}
                              >
                                <i className="fas fa-times mr-1"></i>
                                취소
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {/* 랭크 */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">랭크</span>
                      {isEditing ? (
                        <div className="flex gap-1">
                          <Select 
                            value={editData.tier} 
                            onValueChange={(value) => setEditData(prev => ({ ...prev, tier: value }))}
                          >
                            <SelectTrigger className="w-16 h-6 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {tierOptions.map(tier => (
                                <SelectItem key={tier.value} value={tier.value}>{tier.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {editData.tier && !['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(editData.tier) && (
                            <Select 
                              value={editData.rank || ''} 
                              onValueChange={(value) => setEditData(prev => ({ ...prev, rank: value }))}
                            >
                              <SelectTrigger className="w-12 h-6 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {rankOptions.map(rank => (
                                  <SelectItem key={rank.value} value={rank.value}>{rank.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      ) : (
                        <span 
                          className={`text-xs font-mono ${getTierClassName(player.manualTier || player.tier)}`}
                          data-testid={`text-tier-${player.id}`}
                        >
                          {player.manualTier || player.tier} {player.manualRank || player.rank || ""}
                          {player.manualTier && (
                            <span className="ml-1 text-[10px] text-amber-400" title="수동 설정된 티어">
                              *
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    
                    {/* 수동 티어 설정 (언랭 플레이어용) */}
                    {player.tier === "UNRANKED" && !isEditing && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">수동 티어</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEditing(player)}
                          className="h-6 px-2 text-xs"
                          data-testid={`button-set-manual-tier-${player.id}`}
                        >
                          <i className="fas fa-cog mr-1"></i>
                          {player.manualTier ? '수정' : '설정'}
                        </Button>
                      </div>
                    )}
                    
                    {/* 수동 티어 편집 (편집 모드일 때) */}
                    {isEditing && player.tier === "UNRANKED" && (
                      <div className="border-t border-border pt-2 mt-2">
                        <div className="text-xs text-muted-foreground mb-2">
                          수동 티어 설정 (팀 밸런싱용)
                        </div>
                        <div className="flex gap-1">
                          <Select 
                            value={editData.manualTier || ''} 
                            onValueChange={(value) => setEditData(prev => ({ ...prev, manualTier: value }))}
                          >
                            <SelectTrigger className="w-20 h-6 text-xs">
                              <SelectValue placeholder="티어" />
                            </SelectTrigger>
                            <SelectContent>
                              {tierOptions.map(tier => (
                                <SelectItem key={tier.value} value={tier.value}>{tier.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {editData.manualTier && !['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(editData.manualTier) && (
                            <Select 
                              value={editData.manualRank || ''} 
                              onValueChange={(value) => setEditData(prev => ({ ...prev, manualRank: value }))}
                            >
                              <SelectTrigger className="w-12 h-6 text-xs">
                                <SelectValue placeholder="랭크" />
                              </SelectTrigger>
                              <SelectContent>
                                {rankOptions.map(rank => (
                                  <SelectItem key={rank.value} value={rank.value}>{rank.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* LP */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">LP</span>
                      {isEditing ? (
                        <Input
                          type="number"
                          value={editData.leaguePoints || ''}
                          onChange={(e) => setEditData(prev => ({ ...prev, leaguePoints: parseInt(e.target.value) || 0 }))}
                          className="w-16 h-6 text-xs p-1 text-right"
                          data-testid={`input-lp-${player.id}`}
                        />
                      ) : (
                        <span className="text-xs font-mono" data-testid={`text-lp-${player.id}`}>
                          {player.leaguePoints} LP
                        </span>
                      )}
                    </div>
                    
                    {/* 승/패 */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">승/패</span>
                      {isEditing ? (
                        <div className="flex gap-1 items-center">
                          <Input
                            type="number"
                            value={editData.wins || ''}
                            onChange={(e) => setEditData(prev => ({ ...prev, wins: parseInt(e.target.value) || 0 }))}
                            className="w-12 h-6 text-xs p-1 text-center"
                            data-testid={`input-wins-${player.id}`}
                          />
                          <span className="text-xs">/</span>
                          <Input
                            type="number"
                            value={editData.losses || ''}
                            onChange={(e) => setEditData(prev => ({ ...prev, losses: parseInt(e.target.value) || 0 }))}
                            className="w-12 h-6 text-xs p-1 text-center"
                            data-testid={`input-losses-${player.id}`}
                          />
                        </div>
                      ) : (
                        <span 
                          className={`text-xs font-mono ${getWinRateColor(player.winRate)}`}
                          data-testid={`text-winrate-${player.id}`}
                        >
                          {player.wins}승 {player.losses}패 ({Math.round(player.winRate * 100)}%)
                        </span>
                      )}
                    </div>
                    
                    {/* 주포지션 1 */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">주포지션 1</span>
                      {isEditing ? (
                        <Select 
                          value={editData.mainPosition} 
                          onValueChange={(value) => setEditData(prev => ({ ...prev, mainPosition: value }))}
                        >
                          <SelectTrigger className="w-16 h-6 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {positionOptions.map(pos => (
                              <SelectItem key={pos.value} value={pos.value}>{pos.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex items-center gap-1" data-testid={`text-position-${player.id}`}>
                          <span className="text-xs flex items-center">
                            <i className={`${positionIcon.icon} position-icon mr-1 ${positionIcon.color}`}></i>
                            <span className="font-semibold">{player.mainPosition || "N/A"}</span>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 주포지션 2 */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">주포지션 2</span>
                      {isEditing ? (
                        <Select
                          value={editData.mainPosition2 || 'NONE'}
                          onValueChange={(value) => setEditData(prev => ({ ...prev, mainPosition2: value === 'NONE' ? '' : value }))}
                        >
                          <SelectTrigger className="w-16 h-6 text-xs"><SelectValue placeholder="없음" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NONE">없음</SelectItem>
                            {positionOptions.map(pos => <SelectItem key={pos.value} value={pos.value}>{pos.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs font-medium">{player.mainPosition2 || "없음"}</span>
                      )}
                    </div>
                    
                    {/* 부포지션 1 */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">부포지션 1</span>
                      {isEditing ? (
                        <Select 
                          value={editData.subPosition || 'NONE'} 
                          onValueChange={(value) => setEditData(prev => ({ ...prev, subPosition: value === 'NONE' ? null : value }))}
                        >
                          <SelectTrigger className="w-16 h-6 text-xs">
                            <SelectValue placeholder="선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NONE">없음</SelectItem>
                            {positionOptions.map(pos => (
                              <SelectItem key={pos.value} value={pos.value}>{pos.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex items-center gap-1" data-testid={`text-subposition-${player.id}`}>
                          {player.subPosition ? (
                            <span className="text-xs flex items-center">
                              <i className={`${getPositionIcon(player.subPosition).icon} position-icon mr-1 ${getPositionIcon(player.subPosition).color}`}></i>
                              <span className="font-medium">{player.subPosition}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">없음</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 부포지션 2 */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">부포지션 2</span>
                      {isEditing ? (
                        <Select
                          value={editData.subPosition2 || 'NONE'}
                          onValueChange={(value) => setEditData(prev => ({ ...prev, subPosition2: value === 'NONE' ? null : value }))}
                        >
                          <SelectTrigger className="w-16 h-6 text-xs"><SelectValue placeholder="없음" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NONE">없음</SelectItem>
                            {positionOptions.map(pos => <SelectItem key={pos.value} value={pos.value}>{pos.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs font-medium">{player.subPosition2 || "없음"}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 pt-4 border-t border-border">
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={onBalanceTeams}
                disabled={isBalancing || players.length < 10}
                className="flex-1 bg-accent text-accent-foreground px-6 py-3 rounded-lg font-medium hover:bg-accent/90 transition-colors flex items-center justify-center"
                data-testid="button-balance-teams"
              >
                <i className="fas fa-random mr-2"></i>
                {isBalancing ? "밸런스 계산 중..." : "팀 밸런스 맞추기"}
              </Button>
              
              <Button
                variant="outline"
                className="px-6 py-3 border border-border text-foreground rounded-lg hover:bg-secondary transition-colors flex items-center justify-center"
                data-testid="button-advanced-options"
              >
                <i className="fas fa-sliders-h mr-2"></i>
                고급 옵션
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
