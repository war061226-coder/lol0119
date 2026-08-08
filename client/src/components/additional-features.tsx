import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { type Player } from "@shared/schema";

interface AdditionalFeaturesProps {
  players: Player[];
}

export default function AdditionalFeatures({ players }: AdditionalFeaturesProps) {
  // Calculate tier distribution
  const tierDistribution = players.reduce((acc, player) => {
    acc[player.tier] = (acc[player.tier] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Calculate position distribution
  const positionDistribution = players.reduce((acc, player) => {
    acc[player.mainPosition] = (acc[player.mainPosition] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

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

  return (
    <section className="mb-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Statistics Panel */}
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <i className="fas fa-chart-pie mr-2 text-accent"></i>
              통계 및 분석
            </h3>
            
            <div className="space-y-4">
              <div className="bg-secondary/50 rounded p-4">
                <h4 className="text-sm font-medium mb-2">티어 분포</h4>
                <div className="space-y-2">
                  {Object.entries(tierDistribution).map(([tier, count]) => (
                    <div key={tier} className="flex items-center justify-between text-sm">
                      <span className={getTierClassName(tier)}>{tier}</span>
                      <span className="font-mono" data-testid={`text-tier-count-${tier}`}>
                        {count}명 ({Math.round((count / players.length) * 100)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="bg-secondary/50 rounded p-4">
                <h4 className="text-sm font-medium mb-2">포지션 분포</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(positionDistribution).map(([position, count]) => {
                    const positionIcon = getPositionIcon(position);
                    return (
                      <div key={position} className="flex items-center justify-between">
                        <span className="flex items-center">
                          <i className={`${positionIcon.icon} ${positionIcon.color} mr-1`}></i>
                          {position}
                        </span>
                        <span className="font-mono" data-testid={`text-position-count-${position}`}>
                          {count}명
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Settings Panel */}
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <i className="fas fa-cog mr-2 text-primary"></i>
              밸런싱 설정
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">밸런싱 우선순위</label>
                <Select defaultValue="mmr">
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mmr">MMR 기반 (기본)</SelectItem>
                    <SelectItem value="winrate">승률 기반</SelectItem>
                    <SelectItem value="recent">최근 성과 기반</SelectItem>
                    <SelectItem value="position">포지션 우선</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">허용 MMR 차이</label>
                <Slider
                  defaultValue={[50]}
                  max={200}
                  step={10}
                  className="w-full"
                  data-testid="slider-mmr-difference"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>0</span>
                  <span className="font-mono">50 MMR</span>
                  <span>200</span>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">포지션 강제 배치</label>
                <div className="flex items-center space-x-2">
                  <Checkbox id="enforcePositions" defaultChecked data-testid="checkbox-enforce-positions" />
                  <label htmlFor="enforcePositions" className="text-sm">
                    각 팀에 모든 포지션 배치
                  </label>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">듀오 고려</label>
                <div className="flex items-center space-x-2">
                  <Checkbox id="considerDuo" data-testid="checkbox-consider-duo" />
                  <label htmlFor="considerDuo" className="text-sm">
                    듀오 플레이어를 같은 팀에 배치
                  </label>
                </div>
              </div>

              <Button 
                className="w-full bg-secondary text-foreground px-4 py-2 rounded-lg hover:bg-muted transition-colors text-sm"
                data-testid="button-save-settings"
              >
                설정 저장
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
