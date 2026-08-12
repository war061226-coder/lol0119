import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Player, type Position } from "@shared/schema";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Database, Pencil, Plus, Save, Trash2, UserPlus, X } from "lucide-react";

const tiers = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
const ranks = ["IV", "III", "II", "I"];
const positions: { value: Position; label: string }[] = [
  { value: "TOP", label: "탑" },
  { value: "JG", label: "정글" },
  { value: "MID", label: "미드" },
  { value: "ADC", label: "원딜" },
  { value: "SUP", label: "서폿" },
];

const TIER_ORDER: Record<string, number> = {
  IRON: 1,
  BRONZE: 2,
  SILVER: 3,
  GOLD: 4,
  PLATINUM: 5,
  EMERALD: 6,
  DIAMOND: 7,
  MASTER: 8,
  GRANDMASTER: 9,
  CHALLENGER: 10,
};
const RANK_ORDER: Record<string, number> = { IV: 1, III: 2, II: 3, I: 4 };
const POSITION_ORDER: Record<string, number> = { TOP: 1, JG: 2, MID: 3, ADC: 4, SUP: 5 };

function getTierSortValue(tier: string, rank: string | null) {
  const tierValue = TIER_ORDER[tier] ?? 0;
  const rankValue = rank ? (RANK_ORDER[rank] ?? 0) : 2.5;
  return tierValue * 10 + rankValue;
}

function getPositionSortValue(position?: string | null) {
  return position ? (POSITION_ORDER[position] ?? 99) : 99;
}

type SortColumn = "tier" | "mainPosition" | "subPosition";
type SortDirection = "desc" | "asc";

type ManualForm = {
  discordName: string;
  summonerName: string;
  tier: string;
  rank: string;
  mainPosition: Position;
  mainPosition2: Position | "";
  subPosition: Position | "";
  subPosition2: Position | "";
};

const emptyForm: ManualForm = {
  discordName: "",
  summonerName: "",
  tier: "GOLD",
  rank: "II",
  mainPosition: "TOP",
  mainPosition2: "",
  subPosition: "",
  subPosition2: "",
};

const EMPTY_PLAYERS: Player[] = [];

function formFromPlayer(player: Player): ManualForm {
  return {
    discordName: player.discordName || "",
    summonerName: player.summonerName,
    tier: player.tier,
    rank: player.rank || "II",
    mainPosition: player.mainPosition as Position,
    mainPosition2: (player.mainPosition2 || "") as Position | "",
    subPosition: (player.subPosition || "") as Position | "",
    subPosition2: (player.subPosition2 || "") as Position | "",
  };
}

function positionLabel(value?: string | null) {
  return positions.find((position) => position.value === value)?.label || "없음";
}

interface ManualPlayerDbSectionProps {
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  onBalanceTeams: () => void;
  isBalancing: boolean;
}

export default function ManualPlayerDbSection({
  selectedIds,
  onSelectedIdsChange,
  onBalanceTeams,
  isBalancing,
}: ManualPlayerDbSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ManualForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const formPanelRef = useRef<HTMLDivElement>(null);

  const { data: playersData, isLoading } = useQuery<Player[]>({ queryKey: ["/api/players"] });
  const players = playersData ?? EMPTY_PLAYERS;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedPlayers = useMemo(() => {
    if (!sortColumn) return players;
    const sorted = [...players].sort((a, b) => {
      let diff = 0;
      switch (sortColumn) {
        case "tier":
          diff = getTierSortValue(a.tier, a.rank) - getTierSortValue(b.tier, b.rank);
          break;
        case "mainPosition":
          diff = getPositionSortValue(a.mainPosition) - getPositionSortValue(b.mainPosition);
          break;
        case "subPosition":
          diff = getPositionSortValue(a.subPosition) - getPositionSortValue(b.subPosition);
          break;
      }
      return sortDirection === "desc" ? -diff : diff;
    });
    return sorted;
  }, [players, sortColumn, sortDirection]);

  const toggleSort = (column: SortColumn) => {
    if (sortColumn !== column) {
      setSortColumn(column);
      setSortDirection("desc");
      return;
    }
    setSortDirection((current) => (current === "desc" ? "asc" : "desc"));
  };

  const renderSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3.5 w-3.5" />;
    return sortDirection === "desc" ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />;
  };

  useEffect(() => {
    const validIds = selectedIds.filter((id) => players.some((player) => player.id === id));
    if (validIds.length !== selectedIds.length) {
      onSelectedIdsChange(validIds);
    }
  }, [players]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        rank: form.rank || null,
        mainPosition2: form.mainPosition2,
        subPosition: form.subPosition || null,
        subPosition2: form.subPosition2 || null,
      };
      const response = await apiRequest(editingId ? "PATCH" : "POST", editingId ? `/api/players/${editingId}/manual` : "/api/players/manual", payload);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setForm(emptyForm);
      setEditingId(null);
      toast({ title: editingId ? "플레이어 수정 완료" : "플레이어 등록 완료", description: data.message });
    },
    onError: (error) => toast({ title: "저장 실패", description: error instanceof Error ? error.message : "플레이어 정보를 저장하지 못했습니다.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/players/${id}`);
      return response.json();
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      onSelectedIdsChange(selectedIds.filter((selectedId) => selectedId !== id));
      if (editingId === id) {
        setEditingId(null);
        setForm(emptyForm);
      }
      toast({ title: "플레이어 삭제 완료" });
    },
    onError: (error) => toast({ title: "삭제 실패", description: error instanceof Error ? error.message : "플레이어를 삭제하지 못했습니다.", variant: "destructive" }),
  });

  const updateField = <K extends keyof ManualForm>(key: K, value: ManualForm[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const toggleSelected = (id: string) => {
    if (selectedSet.has(id)) {
      onSelectedIdsChange(selectedIds.filter((selectedId) => selectedId !== id));
    } else if (selectedIds.length < 10) {
      onSelectedIdsChange([...selectedIds, id]);
    } else {
      toast({ title: "최대 10명까지 선택할 수 있습니다.", variant: "destructive" });
    }
  };

  const startEdit = (player: Player) => {
    setEditingId(player.id);
    setForm(formFromPlayer(player));
    formPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const startNewPlayer = () => {
    setEditingId(null);
    setForm(emptyForm);
    requestAnimationFrame(() => {
      formPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const selectFirstTen = () => {
    if (players.length < 10) {
      toast({ title: "플레이어가 부족합니다.", description: `현재 ${players.length}명만 등록되어 있어 10명을 선택할 수 없습니다.`, variant: "destructive" });
      return;
    }
    onSelectedIdsChange(sortedPlayers.slice(0, 10).map((player) => player.id));
  };

  return (
    <Card className="bg-card border-border" data-testid="manual-player-db">
      <CardContent className="p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            수동 플레이어 DB
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            외부 전적 조회 없이 직접 입력한 정보만 사용합니다. 등록된 플레이어 중 10명을 선택해 밸런스를 계산하세요.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,0.75fr)_minmax(0,1.75fr)] gap-6 items-start">
          <div ref={formPanelRef} className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium flex items-center gap-2">
                {editingId ? <Pencil className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                {editingId ? "플레이어 정보 수정" : "새 플레이어 바로 추가"}
              </h3>
              {editingId && (
                <Button type="button" variant="ghost" size="sm" onClick={startNewPlayer}>
                  <X className="h-4 w-4 mr-1" /> 취소
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
              <div><Label>디코 닉네임</Label><Input value={form.discordName} onChange={(event) => updateField("discordName", event.target.value)} placeholder="예: 말라리" /></div>
              <div><Label>닉네임#태그</Label><Input value={form.summonerName} onChange={(event) => updateField("summonerName", event.target.value)} placeholder="예: 단결된 의지#1226" /></div>
              <div><Label>티어</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.tier} onChange={(event) => updateField("tier", event.target.value)}>{tiers.map((tier) => <option key={tier}>{tier}</option>)}</select></div>
              <div><Label>랭크</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.rank} onChange={(event) => updateField("rank", event.target.value)}>{ranks.map((rank) => <option key={rank}>{rank}</option>)}</select></div>
              {[
                ["mainPosition", "주포지션 1"],
                ["mainPosition2", "주포지션 2"],
                ["subPosition", "부포지션 1"],
                ["subPosition2", "부포지션 2"],
              ].map(([key, label]) => (
                <div key={key}><Label>{label}</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form[key as keyof ManualForm] || ""} onChange={(event) => updateField(key as keyof ManualForm, event.target.value as never)}><option value="">없음</option>{positions.map((position) => <option key={position.value} value={position.value}>{position.label} ({position.value})</option>)}</select></div>
              ))}
            </div>
            <Button className="mt-4 w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="h-4 w-4 mr-2" /> {saveMutation.isPending ? "저장 중..." : editingId ? "수정 저장" : "DB에 바로 추가"}
            </Button>
          </div>

          <div className="rounded-lg border border-border bg-card/60 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-medium flex items-center gap-2"><Database className="h-4 w-4 text-primary" /> DB 리스트</h3>
                <p className="text-xs text-muted-foreground mt-1">수정할 행의 수정 버튼을 누르거나, 체크해서 밸런스에 포함하세요.</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-primary font-medium whitespace-nowrap">{selectedIds.length}/10명 선택</span>
                <Button type="button" variant="outline" size="sm" onClick={selectFirstTen} disabled={players.length < 10}>
                  앞에서 10명 선택
                </Button>
                <Button type="button" size="sm" onClick={onBalanceTeams} disabled={selectedIds.length !== 10 || isBalancing} data-testid="button-balance-db-list">
                  {isBalancing ? "계산 중..." : "선택한 10명으로 팀 짜기"}
                </Button>
                <Button type="button" size="sm" onClick={startNewPlayer}>
                  <Plus className="h-4 w-4 mr-1" /> 바로 추가
                </Button>
              </div>
            </div>
            {isLoading ? <p className="text-sm text-muted-foreground">DB 리스트를 불러오는 중...</p> : players.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                <p>등록된 플레이어가 없습니다.</p>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={startNewPlayer}><Plus className="h-4 w-4 mr-1" /> 첫 플레이어 추가</Button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">선택</th>
                      <th className="px-3 py-2">번호</th>
                      <th className="px-3 py-2">디코 닉네임</th>
                      <th className="px-3 py-2">닉네임#태그</th>
                      <th className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggleSort("tier")}
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                          data-testid="button-sort-tier"
                        >
                          티어 {renderSortIcon("tier")}
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggleSort("mainPosition")}
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                          data-testid="button-sort-main-position"
                        >
                          주포지션 {renderSortIcon("mainPosition")}
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggleSort("subPosition")}
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                          data-testid="button-sort-sub-position"
                        >
                          부포지션 {renderSortIcon("subPosition")}
                        </button>
                      </th>
                      <th className="px-3 py-2" title="주라인1 우선배정 가산점 (50점 이상 시 다음 밸런싱에서 우선배정)">가산점</th>
                      <th className="px-3 py-2">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPlayers.map((player, index) => (
                      <tr key={player.id} className={`border-t border-border/60 ${selectedSet.has(player.id) ? "bg-primary/10" : ""}`}>
                        <td className="px-3 py-2"><Button type="button" variant={selectedSet.has(player.id) ? "default" : "outline"} size="sm" className="h-7 px-2" onClick={() => toggleSelected(player.id)}><Check className={`h-4 w-4 mr-1 ${selectedSet.has(player.id) ? "" : "opacity-30"}`} />{selectedSet.has(player.id) ? "선택됨" : "선택"}</Button></td>
                        <td className="px-3 py-2 text-center text-muted-foreground font-mono text-xs">{index + 1}</td>
                        <td className="px-3 py-2 font-medium">{player.discordName || "-"}</td>
                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{player.summonerName}</td>
                        <td className="px-3 py-2">{player.tier} {player.rank || ""}</td>
                        <td className="px-3 py-2">{positionLabel(player.mainPosition)} / {positionLabel(player.mainPosition2)}</td>
                        <td className="px-3 py-2">{positionLabel(player.subPosition)} / {positionLabel(player.subPosition2)}</td>
                        <td className="px-3 py-2">
                          {(player.pityScore ?? 0) > 0 ? (
                            <span
                              className={`text-xs font-mono px-1.5 py-0.5 rounded-full border ${
                                (player.pityScore ?? 0) >= 50
                                  ? "bg-amber-500/20 text-amber-400 border-amber-500/40 font-semibold"
                                  : "bg-muted text-muted-foreground border-border"
                              }`}
                              title="주라인1 우선배정 가산점 (50점 이상 시 다음 밸런싱에서 우선배정)"
                              data-testid={`text-pity-${player.id}`}
                            >
                              {(player.pityScore ?? 0) >= 50 ? "🎯 " : ""}{player.pityScore}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground font-mono">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={() => startEdit(player)}><Pencil className="h-3.5 w-3.5 mr-1" /> 수정</Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(player.id)} disabled={deleteMutation.isPending} title="삭제"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}