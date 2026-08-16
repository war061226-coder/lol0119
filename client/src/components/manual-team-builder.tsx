import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Shuffle, Users2 } from "lucide-react";
import { type Player, type Position, type ShareableBalanceResult } from "@shared/schema";

const POSITIONS: { value: Position; label: string }[] = [
  { value: "TOP", label: "탑" },
  { value: "JG", label: "정글" },
  { value: "MID", label: "미드" },
  { value: "ADC", label: "원딜" },
  { value: "SUP", label: "서폿" },
];

type Team = "BLUE" | "RED";

interface Assignment {
  team: Team;
  position: Position;
}

type AssignmentMap = Record<string, Assignment>;

const EMPTY_PLAYERS: Player[] = [];

/** 선호 포지션(주1→주2→부1→부2)을 우선 고려해 임시로 팀/라인을 나눠주는 초기 제안값. */
function suggestAssignments(players: Player[]): AssignmentMap {
  const sorted = [...players].sort((a, b) => b.mmr - a.mmr);
  const blue: Player[] = [];
  const red: Player[] = [];
  sorted.forEach((player, index) => (index % 2 === 0 ? blue : red).push(player));

  const assignTeamPositions = (team: Player[]): Record<string, Position> => {
    const used = new Set<Position>();
    const result: Record<string, Position> = {};
    const allPositions: Position[] = ["TOP", "JG", "MID", "ADC", "SUP"];

    for (const player of team) {
      const preferred = [player.mainPosition, player.mainPosition2, player.subPosition, player.subPosition2].filter(
        Boolean,
      ) as Position[];
      const pick = preferred.find((position) => !used.has(position));
      const fallback = allPositions.find((position) => !used.has(position));
      const finalPosition = (pick || fallback || "TOP") as Position;
      used.add(finalPosition);
      result[player.id] = finalPosition;
    }
    return result;
  };

  const bluePositions = assignTeamPositions(blue);
  const redPositions = assignTeamPositions(red);

  const assignments: AssignmentMap = {};
  blue.forEach((player) => (assignments[player.id] = { team: "BLUE", position: bluePositions[player.id] }));
  red.forEach((player) => (assignments[player.id] = { team: "RED", position: redPositions[player.id] }));
  return assignments;
}

interface ManualTeamBuilderProps {
  selectedPlayerIds: string[];
  balanceSettingsId?: string;
  onResult: (result: ShareableBalanceResult) => void;
}

export default function ManualTeamBuilder({ selectedPlayerIds, balanceSettingsId, onResult }: ManualTeamBuilderProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [assignments, setAssignments] = useState<AssignmentMap>({});

  const { data: playersData } = useQuery<Player[]>({ queryKey: ["/api/players"] });
  const allPlayers = playersData ?? EMPTY_PLAYERS;

  const selectedPlayers = useMemo(
    () => selectedPlayerIds.map((id) => allPlayers.find((player) => player.id === id)).filter(Boolean) as Player[],
    [selectedPlayerIds, allPlayers],
  );

  const resetAssignments = () => {
    if (selectedPlayers.length === 10) {
      setAssignments(suggestAssignments(selectedPlayers));
    }
  };

  // 다이얼로그를 열 때마다(또는 선택된 10명이 바뀌었을 때) 제안값으로 초기화합니다.
  useEffect(() => {
    if (isOpen) resetAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedPlayerIds.join(",")]);

  const setTeam = (playerId: string, team: Team) => {
    setAssignments((current) => ({
      ...current,
      [playerId]: { team, position: current[playerId]?.position || "TOP" },
    }));
  };

  const setPosition = (playerId: string, position: Position) => {
    setAssignments((current) => ({
      ...current,
      [playerId]: { team: current[playerId]?.team || "BLUE", position },
    }));
  };

  const blueTeamPlayers = selectedPlayers.filter((player) => assignments[player.id]?.team === "BLUE");
  const redTeamPlayers = selectedPlayers.filter((player) => assignments[player.id]?.team === "RED");

  const bluePositions = blueTeamPlayers.map((player) => assignments[player.id]?.position);
  const redPositions = redTeamPlayers.map((player) => assignments[player.id]?.position);
  const blueDuplicatePositions = new Set(bluePositions).size !== bluePositions.length;
  const redDuplicatePositions = new Set(redPositions).size !== redPositions.length;

  const isTeamCountValid = blueTeamPlayers.length === 5 && redTeamPlayers.length === 5;
  const isPositionValid = !blueDuplicatePositions && !redDuplicatePositions;
  const isValid = isTeamCountValid && isPositionValid;

  const manualBalanceMutation = useMutation({
    mutationFn: async () => {
      const toEntries = (players: Player[]) =>
        players.map((player) => ({ playerId: player.id, position: assignments[player.id].position }));

      const requestData: Record<string, unknown> = {
        blueTeam: toEntries(blueTeamPlayers),
        redTeam: toEntries(redTeamPlayers),
      };
      if (balanceSettingsId) requestData.balanceSettingsId = balanceSettingsId;

      const response = await apiRequest("POST", "/api/teams/manual-balance", requestData);
      return response.json();
    },
    onSuccess: (data: ShareableBalanceResult) => {
      onResult(data);
      setIsOpen(false);
      toast({
        title: "수동 팀 구성 완료",
        description: `밸런스 점수: ${data.balanceScore}/100`,
      });
    },
    onError: (error) => {
      toast({
        title: "수동 팀 구성 실패",
        description: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  const renderPlayerRow = (player: Player) => {
    const assignment = assignments[player.id];
    return (
      <div
        key={player.id}
        className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2"
        data-testid={`manual-team-row-${player.id}`}
      >
        <div className="min-w-[140px] flex-1">
          <div className="text-sm font-medium truncate">{player.discordName || player.summonerName}</div>
          <div className="text-xs text-muted-foreground truncate">{player.summonerName}</div>
        </div>
        <Select value={assignment?.team} onValueChange={(value) => setTeam(player.id, value as Team)}>
          <SelectTrigger className="w-24 h-8 text-xs" data-testid={`select-team-${player.id}`}>
            <SelectValue placeholder="팀" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="BLUE">블루팀</SelectItem>
            <SelectItem value="RED">레드팀</SelectItem>
          </SelectContent>
        </Select>
        <Select value={assignment?.position} onValueChange={(value) => setPosition(player.id, value as Position)}>
          <SelectTrigger className="w-20 h-8 text-xs" data-testid={`select-position-${player.id}`}>
            <SelectValue placeholder="라인" />
          </SelectTrigger>
          <SelectContent>
            {POSITIONS.map((position) => (
              <SelectItem key={position.value} value={position.value}>
                {position.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={selectedPlayerIds.length !== 10}
          className="flex items-center gap-2"
          data-testid="button-open-manual-team-builder"
        >
          <Users2 className="h-4 w-4" />
          수동으로 팀 배정
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users2 className="h-5 w-5" />
            수동 팀 배정
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            각 선수의 팀과 라인을 직접 지정하세요. MMR·팀 점수·밸런스 점수는 자동 배정과 동일한 방식(라인
            선호도 배율·라인 가중치 포함)으로 계산됩니다.
          </p>
        </DialogHeader>

        {selectedPlayers.length !== 10 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            먼저 플레이어 10명을 선택해주세요.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={resetAssignments} className="text-xs">
                <Shuffle className="h-3.5 w-3.5 mr-1" /> 제안값으로 초기화
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Badge className="bg-blue-500 hover:bg-blue-500">블루팀</Badge>
                  <span className={`text-xs ${blueTeamPlayers.length === 5 ? "text-muted-foreground" : "text-red-400"}`}>
                    {blueTeamPlayers.length}/5명
                  </span>
                  {blueDuplicatePositions && <span className="text-xs text-red-400">라인 중복</span>}
                </div>
                <div className="space-y-2">{blueTeamPlayers.map(renderPlayerRow)}</div>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Badge className="bg-red-500 hover:bg-red-500">레드팀</Badge>
                  <span className={`text-xs ${redTeamPlayers.length === 5 ? "text-muted-foreground" : "text-red-400"}`}>
                    {redTeamPlayers.length}/5명
                  </span>
                  {redDuplicatePositions && <span className="text-xs text-red-400">라인 중복</span>}
                </div>
                <div className="space-y-2">{redTeamPlayers.map(renderPlayerRow)}</div>
              </div>
            </div>

            {!isValid && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-400">
                {!isTeamCountValid && <p>블루팀과 레드팀에 각각 정확히 5명씩 배정해주세요.</p>}
                {isTeamCountValid && !isPositionValid && <p>같은 팀 안에서 라인이 겹치지 않도록 배정해주세요.</p>}
              </div>
            )}

            <Button
              className="w-full"
              disabled={!isValid || manualBalanceMutation.isPending}
              onClick={() => manualBalanceMutation.mutate()}
              data-testid="button-submit-manual-team"
            >
              {manualBalanceMutation.isPending ? "계산 중..." : "이 배정으로 팀 구성 계산하기"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
