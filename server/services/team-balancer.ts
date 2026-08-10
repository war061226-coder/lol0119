import { type Player, type RecommendedPlayer, type TeamComposition, type BalanceAnalysis, type Position, type BalanceSettings } from "@shared/schema";

// Tier to MMR mapping
const TIER_MMR_MAP: Record<string, number> = {
  "IRON": 800,
  "BRONZE": 1000,
  "SILVER": 1200,
  "GOLD": 1400,
  "PLATINUM": 1600,
  "EMERALD": 1800,
  "DIAMOND": 2000,
  "MASTER": 2400,
  "GRANDMASTER": 2600,
  "CHALLENGER": 2800,
  "UNRANKED": 1200, // Default for unranked
};

const RANK_MODIFIERS: Record<string, number> = {
  "IV": -100,
  "III": -50,
  "II": 0,
  "I": 50,
};

export class TeamBalancer {
  private settings: BalanceSettings;

  constructor(settings?: BalanceSettings) {
    // Default settings if none provided
    this.settings = settings || {
      id: "default",
      name: "기본 설정",
      isDefault: true,
      mmrWeight: 0.7,
      positionWeight: 0.3,
      winRateWeight: 0,
      topWeight: 1.0,
      jgWeight: 1.1,
      midWeight: 1.2,
      adcWeight: 1.0,
      supWeight: 0.9,
      mmrTolerance: 20.0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private get POSITION_WEIGHTS() {
    return {
      "TOP": this.settings.topWeight,
      "JG": this.settings.jgWeight,
      "MID": this.settings.midWeight,
      "ADC": this.settings.adcWeight,
      "SUP": this.settings.supWeight,
    };
  }

  private getEffectiveMMR(player: Player): number {
    if (player.manualTier) {
      const baseMmr = TIER_MMR_MAP[player.manualTier] || 1200;
      const rankModifier = player.manualRank ? (RANK_MODIFIERS[player.manualRank] || 0) : 0;
      const lpModifier = Math.floor((player.leaguePoints || 0) / 4);
      return baseMmr + rankModifier + lpModifier;
    }
    return player.mmr;
  }

  private recordedWinRates = new Map<string, number>();

  private getEffectiveWinRate(player: Player): number {
    const recordedWinRate = this.recordedWinRates.get(player.id);
    return recordedWinRate === undefined ? 0.5 : recordedWinRate;
  }

  async balanceTeams(
    players: Player[],
    customSettings?: BalanceSettings,
    options?: {
      excludedTeamPlayerIds?: string[];
      enforceForcedSameTeam?: boolean;
      recordedWinRates?: Map<string, number>;
    },
  ): Promise<BalanceAnalysis> {
    // Use custom settings if provided
    if (customSettings) {
      this.settings = customSettings;
    }
    this.recordedWinRates = options?.recordedWinRates ?? new Map<string, number>();
    if (players.length !== 10) {
      throw new Error("정확히 10명의 플레이어가 필요합니다.");
    }

    // Try multiple combinations and pick the best one
    const bestBalance = this.findOptimalTeamComposition(
      players,
      options?.excludedTeamPlayerIds,
      options?.enforceForcedSameTeam ?? true,
    );
    
    if (!bestBalance) {
      throw new Error("팀 밸런스를 맞출 수 없습니다.");
    }

    return bestBalance;
  }

  private findOptimalTeamComposition(
    players: Player[],
    excludedTeamPlayerIds?: string[],
    enforceForcedSameTeam = true,
  ): BalanceAnalysis | null {
    let bestBalance: BalanceAnalysis | null = null;
    let bestScore = -1;
    let bestSinglePositionPenalty = Number.POSITIVE_INFINITY;

    // Generate multiple team combinations
    const combinations = this.generateTeamCombinations(players);
    const excludedTeamKey = this.getTeamPartitionKey(excludedTeamPlayerIds);
    
    for (const { blueTeam, redTeam } of combinations) {
      if (enforceForcedSameTeam && !this.respectsForcedSameTeamRules(players, blueTeam, redTeam)) {
        continue;
      }

      // A rebalance request must produce a genuinely different partition.
      // Treating a color swap as different would only rename the same teams.
      if (
        excludedTeamKey &&
        (
          this.getTeamPartitionKey(blueTeam.map((player) => player.id)) === excludedTeamKey ||
          this.getTeamPartitionKey(redTeam.map((player) => player.id)) === excludedTeamKey
        )
      ) {
        continue;
      }

      const analysis = this.analyzeTeamBalance(blueTeam, redTeam);
      const singlePositionPenalty = this.calculateSinglePositionPenalty(blueTeam, redTeam);
      
      // First satisfy the hard roster rule: players with only one possible
      // position must be split between teams whenever the roster allows it.
      // Only then use the balance score to choose among valid compositions.
      if (
        singlePositionPenalty < bestSinglePositionPenalty ||
        (singlePositionPenalty === bestSinglePositionPenalty && analysis.balanceScore > bestScore)
      ) {
        bestSinglePositionPenalty = singlePositionPenalty;
        bestScore = analysis.balanceScore;
        bestBalance = analysis;
      }
    }

    return bestBalance;
  }

  private respectsForcedSameTeamRules(
    selectedPlayers: Player[],
    blueTeam: Player[],
    redTeam: Player[],
  ): boolean {
    const forcedPair = selectedPlayers.filter((player) => {
      const discordName = player.discordName || "";
      const summonerName = player.summonerName || "";
      const isKimToto =
        discordName.includes("김토토") || summonerName.includes("김토토");
      const isJeongJeong =
        discordName.includes("정정쓰") ||
        summonerName.includes("졍졍쓰");
      return isKimToto || isJeongJeong;
    });

    // The rule only applies when both registered players are among the ten
    // selected players. If either one is absent, do not constrain the roster.
    if (forcedPair.length !== 2) return true;

    const blueIds = new Set(blueTeam.map((player) => player.id));
    const firstInBlue = blueIds.has(forcedPair[0].id);
    const secondInBlue = blueIds.has(forcedPair[1].id);
    return firstInBlue === secondInBlue;
  }

  private getTeamPartitionKey(playerIds?: string[]): string | null {
    if (!playerIds || playerIds.length !== 5) return null;
    return [...playerIds].sort().join("|");
  }

  private generateTeamCombinations(players: Player[]): Array<{ blueTeam: Player[], redTeam: Player[] }> {
    const combinations: Array<{ blueTeam: Player[], redTeam: Player[] }> = [];
    
    // Group players by position
    const playersByPosition = this.groupPlayersByPosition(players);
    
    // Try different strategies
    
    // Strategy 1: Position-first balancing
    const positionBalanced = this.createPositionBalancedTeams(playersByPosition);
    if (positionBalanced) {
      combinations.push(positionBalanced);
    }
    
    // Strategy 2: MMR-first balancing
    const mmrBalanced = this.createMMRBalancedTeams(players);
    if (mmrBalanced) {
      combinations.push(mmrBalanced);
    }
    
    // Strategy 3: Hybrid approach
    const hybridBalanced = this.createHybridBalancedTeams(players);
    if (hybridBalanced) {
      combinations.push(hybridBalanced);
    }

    // With ten players, all 5-vs-5 combinations are small enough to inspect.
    // This guarantees that the single-position split rule is not dependent
    // on one of the heuristic draft strategies finding the right arrangement.
    const allCombinations = this.generateAllFivePlayerCombinations(players);
    combinations.push(...allCombinations);

    return combinations;
  }

  private generateAllFivePlayerCombinations(players: Player[]): Array<{ blueTeam: Player[], redTeam: Player[] }> {
    const combinations: Array<{ blueTeam: Player[], redTeam: Player[] }> = [];
    const choose = (start: number, picked: Player[]) => {
      if (picked.length === 5) {
        const pickedIds = new Set(picked.map((player) => player.id));
        combinations.push({
          blueTeam: picked,
          redTeam: players.filter((player) => !pickedIds.has(player.id)),
        });
        return;
      }

      for (let index = start; index <= players.length - (5 - picked.length); index += 1) {
        choose(index + 1, [...picked, players[index]]);
      }
    };

    choose(0, []);
    return combinations;
  }

  private groupPlayersByPosition(players: Player[]): Record<Position, Player[]> {
    const groups: Record<Position, Player[]> = {
      "TOP": [],
      "JG": [],
      "MID": [],
      "ADC": [],
      "SUP": [],
    };

    players.forEach(player => {
      const preferredPositions = [
        player.mainPosition,
        player.mainPosition2,
        player.subPosition,
        player.subPosition2,
      ].filter(Boolean) as Position[];

      for (const position of preferredPositions) {
        if (groups[position] && !groups[position].some((candidate) => candidate.id === player.id)) {
          groups[position].push(player);
        }
      }
    });

    return groups;
  }

  private createPositionBalancedTeams(playersByPosition: Record<Position, Player[]>): { blueTeam: Player[], redTeam: Player[] } | null {
    const blueTeam: Player[] = [];
    const redTeam: Player[] = [];
    const assignedPlayerIds = new Set<string>();
    
    const positions: Position[] = ["TOP", "JG", "MID", "ADC", "SUP"];
    
    for (const position of positions) {
      // Filter out already assigned players and sort by MMR
      const availablePlayers = playersByPosition[position]
        .filter(p => !assignedPlayerIds.has(p.id))
        .sort((a, b) => this.getEffectiveMMR(b) - this.getEffectiveMMR(a));
      
      if (availablePlayers.length < 2) {
        // Not enough available players for this position
        return null;
      }
      
      // Alternate assignment to balance MMR
      const bluePlayer = availablePlayers[0];
      const redPlayer = availablePlayers[1];
      
      if (blueTeam.length <= redTeam.length) {
        blueTeam.push(bluePlayer);
        redTeam.push(redPlayer);
        assignedPlayerIds.add(bluePlayer.id);
        assignedPlayerIds.add(redPlayer.id);
      } else {
        redTeam.push(redPlayer);
        blueTeam.push(bluePlayer);
        assignedPlayerIds.add(bluePlayer.id);
        assignedPlayerIds.add(redPlayer.id);
      }
    }
    
    return { blueTeam, redTeam };
  }

  private createMMRBalancedTeams(players: Player[]): { blueTeam: Player[], redTeam: Player[] } | null {
    const sortedPlayers = [...players].sort((a, b) => this.getEffectiveMMR(b) - this.getEffectiveMMR(a));
    const blueTeam: Player[] = [];
    const redTeam: Player[] = [];
    
    // Snake draft: 1-2-2-1-2
    for (let i = 0; i < sortedPlayers.length; i++) {
      const blueTeamMmr = blueTeam.reduce((sum, p) => sum + this.getEffectiveMMR(p), 0);
      const redTeamMmr = redTeam.reduce((sum, p) => sum + this.getEffectiveMMR(p), 0);
      
      if (blueTeam.length === redTeam.length) {
        if (blueTeamMmr <= redTeamMmr) {
          blueTeam.push(sortedPlayers[i]);
        } else {
          redTeam.push(sortedPlayers[i]);
        }
      } else if (blueTeam.length < redTeam.length) {
        blueTeam.push(sortedPlayers[i]);
      } else {
        redTeam.push(sortedPlayers[i]);
      }
    }
    
    return { blueTeam, redTeam };
  }

  private createHybridBalancedTeams(players: Player[]): { blueTeam: Player[], redTeam: Player[] } | null {
    // Weighted MMR based on position importance
    const playersWithWeightedMmr = players.map(player => ({
      ...player,
      weightedMmr: this.getEffectiveMMR(player) * (this.POSITION_WEIGHTS[player.mainPosition as Position] || 1.0)
    }));
    
    const sortedPlayers = playersWithWeightedMmr.sort((a, b) => b.weightedMmr - a.weightedMmr);
    const blueTeam: Player[] = [];
    const redTeam: Player[] = [];
    
    for (const player of sortedPlayers) {
      const blueTeamScore = this.calculateTeamScore(blueTeam);
      const redTeamScore = this.calculateTeamScore(redTeam);
      
      if (blueTeam.length === redTeam.length) {
        if (blueTeamScore <= redTeamScore) {
          blueTeam.push(player);
        } else {
          redTeam.push(player);
        }
      } else if (blueTeam.length < redTeam.length) {
        blueTeam.push(player);
      } else {
        redTeam.push(player);
      }
    }
    
    return { blueTeam, redTeam };
  }

  private analyzeTeamBalance(blueTeam: Player[], redTeam: Player[]): BalanceAnalysis {
    const blueComposition = this.calculateTeamComposition(blueTeam);
    const redComposition = this.calculateTeamComposition(redTeam);
    
    // Compare the same position-weighted team power that is shown in each
    // team's summary. Comparing plain averages here made the analysis say
    // "0 difference" even when weighted team scores were different.
    const mmrDifference = Math.abs(blueComposition.teamScore - redComposition.teamScore);
    const winRateDifference = Math.abs(blueComposition.averageWinRate - redComposition.averageWinRate);
    
    const positionMatch = this.calculatePositionBalance(blueComposition.players, redComposition.players);
    
    // Calculate overall balance score (0-100) using configurable tolerances and weights
    const mmrScore = Math.max(0, 100 - (mmrDifference / this.settings.mmrTolerance) * 100); 
    const positionScore = positionMatch * 100;
    const winRateScore = Math.max(0, 100 - (winRateDifference * 2));
    const mmrWeight = this.settings.mmrWeight;
    const positionWeight = this.settings.positionWeight;
    const winRateWeight = this.settings.winRateWeight;
    
    const totalWeight = mmrWeight + positionWeight + winRateWeight;
    const balanceScore = totalWeight > 0
      ? (mmrScore * mmrWeight + positionScore * positionWeight + winRateScore * winRateWeight) / totalWeight
      : 0;
    
    return {
      blueTeam: blueComposition,
      redTeam: redComposition,
      balanceScore: Math.round(balanceScore),
      mmrDifference,
      winRateDifference,
      positionMatch,
    };
  }

  private calculateTeamComposition(team: Player[]): TeamComposition {
    const recommendedPlayers = this.assignRecommendedPositions(team);
    const totalMmr = recommendedPlayers.reduce((sum, player) => sum + this.getEffectiveMMR(player), 0);
    const totalWinRate = recommendedPlayers.reduce((sum, player) => sum + this.getEffectiveWinRate(player), 0);
    const averageMmr = totalMmr / recommendedPlayers.length;
    const averageWinRate = totalWinRate / recommendedPlayers.length;
    
    // Calculate team score based on weighted MMR
    const teamScore = recommendedPlayers.reduce((sum, player) => {
      const positionWeight = this.POSITION_WEIGHTS[(player.recommendedPosition || player.mainPosition) as Position] || 1.0;
      return sum + (this.getEffectiveMMR(player) * positionWeight);
    }, 0) / recommendedPlayers.length;
    
    return {
      players: recommendedPlayers,
      averageMmr: Math.round(averageMmr),
      averageWinRate: Math.round(averageWinRate * 10000) / 100,
      teamScore: Math.round(teamScore),
    };
  }

  /**
   * Assign one recommended lane to every player in a team. Every lane is
   * considered exactly once when possible, with primary lanes preferred over
   * secondary lanes. This makes the result actionable instead of only
   * displaying each player's preference list.
   */
  private assignRecommendedPositions(team: Player[]): RecommendedPlayer[] {
    const positions: Position[] = ["TOP", "JG", "MID", "ADC", "SUP"];
    let bestAssignment: Position[] | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    const search = (index: number, used: Set<Position>, assignment: Position[], score: number) => {
      if (index === team.length) {
        if (score > bestScore) {
          bestScore = score;
          bestAssignment = [...assignment];
        }
        return;
      }

      const player = team[index];
      for (const position of positions) {
        if (used.has(position)) continue;

        const primaryPositions = [player.mainPosition, player.mainPosition2].filter(Boolean) as Position[];
        const secondaryPositions = [player.subPosition, player.subPosition2].filter(Boolean) as Position[];
        const preferenceScore = primaryPositions.includes(position)
          ? (primaryPositions[0] === position ? 100 : 90)
          : secondaryPositions.includes(position)
            ? (secondaryPositions[0] === position ? 70 : 60)
            : 0;

        used.add(position);
        assignment.push(position);
        search(index + 1, used, assignment, score + preferenceScore);
        assignment.pop();
        used.delete(position);
      }
    };

    search(0, new Set<Position>(), [], 0);

    // A team normally has exactly five players. Keep a safe fallback for
    // callers that inspect this helper with a partial team.
    const chosenPositions = bestAssignment || team.map((player) => player.mainPosition as Position);
    return team.map((player, index) => ({
      ...player,
      // 실제 밸런싱 계산에 쓰인 유효 MMR(수동 티어 지정 시 티어 기반 계산값)을
      // 그대로 반영해서, 화면에 표시되는 MMR과 계산에 쓰인 MMR이 항상 같게 만듭니다.
      mmr: this.getEffectiveMMR(player),
      recommendedPosition: chosenPositions[index] || (player.mainPosition as Position),
    }));
  }

  private calculateTeamScore(team: Player[]): number {
    if (team.length === 0) return 0;
    
    return team.reduce((sum, player) => {
      const positionWeight = this.POSITION_WEIGHTS[player.mainPosition as Position] || 1.0;
      return sum + (this.getEffectiveMMR(player) * positionWeight);
    }, 0);
  }

  private calculatePositionBalance(blueTeam: RecommendedPlayer[], redTeam: RecommendedPlayer[]): number {
    const bluePositions = new Set(blueTeam.map(p => p.recommendedPosition || p.mainPosition));
    const redPositions = new Set(redTeam.map(p => p.recommendedPosition || p.mainPosition));
    
    const allPositions: Position[] = ["TOP", "JG", "MID", "ADC", "SUP"];
    let matchingPositions = 0;
    
    for (const position of allPositions) {
      if (bluePositions.has(position) && redPositions.has(position)) {
        matchingPositions++;
      }
    }
    
    return matchingPositions / allPositions.length;
  }

  private getPreferredPositions(player: Player): Position[] {
    return Array.from(new Set([
      player.mainPosition,
      player.mainPosition2,
      player.subPosition,
      player.subPosition2,
    ].filter(Boolean) as Position[]));
  }

  private calculateSinglePositionPenalty(blueTeam: Player[], redTeam: Player[]): number {
    const singlePositionPlayers = [...blueTeam, ...redTeam].filter(
      (player) => this.getPreferredPositions(player).length === 1,
    );
    const byPosition = new Map<Position, { blue: number; red: number; total: number }>();

    for (const player of singlePositionPlayers) {
      const position = this.getPreferredPositions(player)[0];
      const counts = byPosition.get(position) || { blue: 0, red: 0, total: 0 };
      counts.total += 1;
      if (blueTeam.some((candidate) => candidate.id === player.id)) counts.blue += 1;
      else counts.red += 1;
      byPosition.set(position, counts);
    }

    let penalty = 0;
    for (const { blue, red, total } of Array.from(byPosition.values())) {
      // For an odd number, a one-player difference is unavoidable.
      penalty += Math.max(0, Math.abs(blue - red) - (total % 2));
    }
    return penalty;
  }
}

// Helper function to create TeamBalancer with default settings
export const createDefaultTeamBalancer = () => new TeamBalancer();
