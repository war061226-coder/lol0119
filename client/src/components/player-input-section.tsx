import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { type Preset, type QuickPlayer } from "@shared/schema";
import { BookOpen, Zap } from "lucide-react";

interface PlayerInputSectionProps {
  summonerNames: string[];
  onSummonerNamesChange: (names: string[]) => void;
  onFetchPlayers: () => void;
  onClearInputs: () => void;
  onPresetLoad?: (preset: Preset) => void;
  quickPlayers?: QuickPlayer[];
  onQuickFill: (summonerName: string) => void;
  isLoading: boolean;
}

export default function PlayerInputSection({
  summonerNames,
  onSummonerNamesChange,
  onFetchPlayers,
  onClearInputs,
  onPresetLoad,
  quickPlayers = [],
  onQuickFill,
  isLoading
}: PlayerInputSectionProps) {
  // Fetch presets
  const { data: presets = [] } = useQuery<Preset[]>({
    queryKey: ['/api/presets'],
  });
  const handleNameChange = (index: number, value: string) => {
    const newNames = [...summonerNames];
    newNames[index] = value;
    onSummonerNamesChange(newNames);
  };

  const validateRiotId = (riotId: string): boolean => {
    // Riot ID format: GameName#TagLine
    // GameName: 3-16 characters (no # allowed), TagLine: 1-5 characters (supports Korean, English, numbers)
    const riotIdRegex = /^[^#]{3,16}#[\w\u3131-\u3163\u1100-\u11FF\uAC00-\uD7A3\uA960-\uA97F\uD7B0-\uD7FF]{1,5}$/;
    return riotIdRegex.test(riotId);
  };

  const getInputClassName = (name: string) => {
    if (name.trim() === "") return "w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-ring focus:border-transparent text-foreground placeholder-muted-foreground";
    
    const isValid = validateRiotId(name);
    return `w-full px-3 py-2 bg-input border rounded-md focus:ring-2 focus:ring-ring focus:border-transparent text-foreground placeholder-muted-foreground ${
      isValid 
        ? "border-green-500 focus:border-green-500" 
        : "border-red-500 focus:border-red-500"
    }`;
  };

  const handlePresetSelect = (presetId: string) => {
    const selectedPreset = presets.find(p => p.id === presetId);
    if (selectedPreset && onPresetLoad) {
      onPresetLoad(selectedPreset);
    }
  };

  return (
    <section className="mb-8">
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <i className="fas fa-users mr-2 text-primary"></i>
            플레이어 라이엇 ID 입력
          </h2>
          
          {presets.length > 0 && (
            <div className="mb-4 p-4 bg-muted/30 rounded-lg border border-border">
              <Label className="text-sm font-medium mb-2 flex items-center">
                <BookOpen className="w-4 h-4 mr-2 text-primary" />
                저장된 프리셋 불러오기
              </Label>
              <Select onValueChange={handlePresetSelect}>
                <SelectTrigger className="w-full mt-2" data-testid="select-preset">
                  <SelectValue placeholder="프리셋을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id} data-testid={`preset-option-${preset.id}`}>
                      {preset.name} {preset.description && `- ${preset.description}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="mb-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
            <Label className="text-sm font-medium mb-2 flex items-center">
              <Zap className="w-4 h-4 mr-2 text-primary" />
              닉네임 입력 바로가기
            </Label>
            <p className="text-xs text-muted-foreground mb-3">
              행을 클릭하면 라이엇 ID가 다음 빈칸에 자동으로 입력됩니다.
            </p>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">디코 닉네임</th>
                    <th className="px-3 py-2 font-medium">닉네임#태그</th>
                    <th className="px-3 py-2 font-medium">주포지션 1</th>
                    <th className="px-3 py-2 font-medium">주포지션 2</th>
                    <th className="px-3 py-2 font-medium">부포지션 1</th>
                    <th className="px-3 py-2 font-medium">부포지션 2</th>
                  </tr>
                </thead>
                <tbody>
                  {quickPlayers.map((quickPlayer) => (
                    <tr
                      key={quickPlayer.summonerName}
                      role="button"
                      tabIndex={isLoading ? -1 : 0}
                      onClick={() => onQuickFill(quickPlayer.summonerName)}
                      onKeyDown={(event) => {
                        if (!isLoading && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          onQuickFill(quickPlayer.summonerName);
                        }
                      }}
                      className={`border-b border-border/60 last:border-b-0 transition-colors ${
                        isLoading
                          ? "cursor-not-allowed opacity-50"
                          : "cursor-pointer hover:bg-primary/10 focus-visible:bg-primary/10 focus-visible:outline-none"
                      }`}
                      title="클릭해서 다음 빈칸에 입력"
                      data-testid={`button-quick-fill-${quickPlayer.summonerName}`}
                    >
                      <td className="px-3 py-2 font-medium text-foreground">{quickPlayer.discordName}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">{quickPlayer.summonerName}</td>
                      <td className="px-3 py-2">{quickPlayer.mainPositions[0] || "없음"}</td>
                      <td className="px-3 py-2">{quickPlayer.mainPositions[1] || "없음"}</td>
                      <td className="px-3 py-2">{quickPlayer.subPositions[0] || "없음"}</td>
                      <td className="px-3 py-2">{quickPlayer.subPositions[1] || "없음"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="mb-4 p-3 bg-muted/50 rounded-lg text-sm">
            <p className="text-muted-foreground">
              <i className="fas fa-info-circle mr-2 text-accent"></i>
              라이엇 ID 형식: <span className="font-mono text-foreground">닉네임#태그</span> (예: 대머리#1226)
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            {summonerNames.map((name, index) => (
              <div key={index} className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Player {index + 1}
                </Label>
                <Input
                  type="text"
                  placeholder="닉네임#태그"
                  value={name}
                  onChange={(e) => handleNameChange(index, e.target.value)}
                  className={getInputClassName(name)}
                  data-testid={`input-summoner-${index}`}
                />
                {name.trim() !== "" && !validateRiotId(name) && (
                  <p className="text-xs text-red-400 mt-1">
                    올바른 형식: 닉네임#태그 (예: 대머리#1226)
                  </p>
                )}
              </div>
            ))}
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={onFetchPlayers}
              disabled={isLoading || summonerNames.filter(name => name.trim() !== "").some(name => !validateRiotId(name))}
              className="flex-1 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center justify-center disabled:opacity-50"
              data-testid="button-fetch-players"
            >
              <i className="fas fa-search mr-2"></i>
              {isLoading ? "불러오는 중..." : "전적 불러오기"}
            </Button>
            
            <Button
              variant="outline"
              onClick={onClearInputs}
              disabled={isLoading}
              className="px-6 py-3 border border-border text-foreground rounded-lg hover:bg-secondary transition-colors flex items-center justify-center"
              data-testid="button-clear-inputs"
            >
              <i className="fas fa-trash mr-2"></i>
              초기화
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
