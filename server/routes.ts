import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { opggService, apiSettings } from "./services/opgg-api";
import { createDefaultTeamBalancer, TeamBalancer } from "./services/team-balancer";
import { insertPlayerSchema, insertPresetSchema, insertBalanceSettingsSchema, riotIdSchema, QUICK_PLAYER_ROSTER } from "@shared/schema";
import { z } from "zod";
import { changeAdminCredentials, getAdminUsername, requireAdmin, verifyAdminCredentials } from "./auth";

export async function registerRoutes(app: Express): Promise<Server> {

  // ── 인증 ─────────────────────────────────────────────
  // 로그인/로그아웃/내 정보 조회는 누구나 접근 가능해야 하므로
  // 아래 쓰기 요청 보호 미들웨어보다 먼저 등록합니다.
  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
      return res.status(400).json({ message: "아이디와 비밀번호를 입력해주세요." });
    }

    if (!verifyAdminCredentials(username, password)) {
      return res.status(401).json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." });
    }

    req.session.role = "admin";
    req.session.username = username;
    res.json({ role: "admin" as const, username });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("lolbalancer.sid");
      res.json({ message: "로그아웃되었습니다." });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.session?.role === "admin") {
      res.json({ role: "admin" as const, username: req.session.username || getAdminUsername() });
    } else {
      res.json({ role: "viewer" as const });
    }
  });

  app.post("/api/auth/change-credentials", requireAdmin, (req, res) => {
    const { currentPassword, newUsername, newPassword } = req.body ?? {};
    if (typeof currentPassword !== "string" || !currentPassword) {
      return res.status(400).json({ message: "현재 비밀번호를 입력해주세요." });
    }

    const result = changeAdminCredentials(
      currentPassword,
      typeof newUsername === "string" ? newUsername : undefined,
      typeof newPassword === "string" ? newPassword : undefined,
    );

    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }

    if (typeof newUsername === "string" && newUsername.trim()) {
      req.session.username = newUsername.trim();
    }

    res.json({ message: result.message, username: req.session.username || getAdminUsername() });
  });

  // ── 쓰기 요청 보호 ────────────────────────────────────
  // GET/HEAD(조회)과 /api/auth/* 는 누구나 접근 가능하고,
  // 그 외 모든 /api POST/PATCH/PUT/DELETE는 관리자 로그인이 필요합니다.
  app.use("/api", (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      return next();
    }
    if (req.path.startsWith("/auth/")) {
      return next();
    }
    return requireAdmin(req, res, next);
  });

  // API Settings endpoints
  app.get("/api/settings", (req, res) => {
    res.json({
      useRiotApi: apiSettings.useRiotApi,
      apiKeySet: !!apiSettings.riotApiKey,
      dataSource: apiSettings.useRiotApi && apiSettings.riotApiKey ? 'riot-api' : 'opgg-scraper'
    });
  });

  app.post("/api/settings", (req, res) => {
    const { apiKey, useRiotApi } = req.body;
    
    if (apiKey !== undefined) {
      apiSettings.riotApiKey = apiKey;
      // Auto-enable Riot API when key is set
      if (apiKey) {
        apiSettings.useRiotApi = true;
      }
    }
    
    if (useRiotApi !== undefined) {
      apiSettings.useRiotApi = useRiotApi;
    }
    
    res.json({ 
      message: apiKey ? "API 키가 저장되었습니다." : "설정이 업데이트되었습니다.",
      useRiotApi: apiSettings.useRiotApi,
      apiKeySet: !!apiSettings.riotApiKey,
      dataSource: apiSettings.useRiotApi && apiSettings.riotApiKey ? 'riot-api' : 'opgg-scraper'
    });
  });

  app.delete("/api/settings/api-key", (req, res) => {
    apiSettings.riotApiKey = "";
    apiSettings.useRiotApi = false;
    res.json({ message: "API 키가 삭제되었습니다." });
  });
  
  // Fetch player data from OP.GG API
  app.post("/api/players/fetch", async (req, res) => {
    try {
      const { summonerNames, forceRefresh } = req.body;
      
      if (!Array.isArray(summonerNames) || summonerNames.length === 0) {
        return res.status(400).json({ message: "라이엇 ID 목록이 필요합니다." });
      }

      if (summonerNames.length > 10) {
        return res.status(400).json({ message: "최대 10명까지만 조회할 수 있습니다." });
      }

      // Validate Riot ID format using shared schema
      const validationResults = summonerNames.map((id: string) => {
        if (id.trim() === "") return { valid: true, id: id.trim() };
        const result = riotIdSchema.safeParse(id.trim());
        return { valid: result.success, id: id.trim(), error: result.error?.issues[0]?.message };
      });

      const invalidIds = validationResults.filter(result => !result.valid && result.id !== "");
      if (invalidIds.length > 0) {
        return res.status(400).json({ 
          message: `잘못된 라이엇 ID 형식입니다: ${invalidIds.map(r => r.id).join(", ")}. 올바른 형식: 닉네임#태그` 
        });
      }

      // OP.GG must be refreshed before we request the actual player data.
      // Always bypass our local cache afterward so the refreshed profile is
      // reflected in the response, including on the first lookup.
      const refreshWarnings = await opggService.refreshOpggProfiles(summonerNames);
      const playerDataResults = await opggService.fetchMultiplePlayersData(summonerNames, true);
      const players = [];
      const errors = [];

      for (const result of playerDataResults) {
        if (result.error) {
          errors.push(result.error);
          continue;
        }

        const playerData = result.data;
        if (!playerData) {
          errors.push(`'${result.riotId}' 데이터를 가져올 수 없습니다.`);
          continue;
        }

        try {
          // Check if player already exists
          let existingPlayer = await storage.getPlayerBySummonerName(playerData.summonerName);
          
          const winRate = playerData.wins + playerData.losses > 0 
            ? playerData.wins / (playerData.wins + playerData.losses) 
            : 0;

          const mmr = opggService.calculateMMR(playerData.tier, playerData.rank || "", playerData.leaguePoints);

          const quickPlayer = QUICK_PLAYER_ROSTER.find(
            (quick) => quick.summonerName.toLowerCase() === playerData.summonerName.toLowerCase()
          );
          const fetchedPositions = playerData.mostPlayedPositions;
          const mainPositions = quickPlayer?.mainPositions ?? fetchedPositions.slice(0, 2);
          const subPositions = quickPlayer?.subPositions ?? fetchedPositions.slice(2, 4);

          const playerInfo = {
            discordName: "",
            summonerName: playerData.summonerName,
            tier: playerData.tier,
            rank: playerData.rank, // Don't force "V" for high tiers (Master/GM/Challenger have rank=null)
            leaguePoints: playerData.leaguePoints,
            wins: playerData.wins,
            losses: playerData.losses,
            winRate,
            level: playerData.level,
            mainPosition: mainPositions[0] || "",
            mainPosition2: mainPositions[1] || "",
            subPosition: subPositions[0] || null,
            subPosition2: subPositions[1] || null,
            positions: Array.from(new Set([...mainPositions, ...subPositions])),
            mmr,
          };

          if (existingPlayer) {
            // Update existing player
            const updatedPlayer = await storage.updatePlayer(existingPlayer.id, playerInfo);
            if (updatedPlayer) {
              players.push(updatedPlayer);
            }
          } else {
            // Create new player
            const newPlayer = await storage.createPlayer(playerInfo);
            players.push(newPlayer);
          }
        } catch (error) {
          console.error(`Error processing player ${result.riotId}:`, error);
          errors.push(`'${result.riotId}' 처리 중 오류가 발생했습니다.`);
        }
      }

      res.json({ 
        players, 
        errors: errors.length > 0 ? errors : undefined,
        refreshWarnings: refreshWarnings.length > 0 ? refreshWarnings : undefined,
        message: `${players.length}명의 플레이어 정보를 성공적으로 가져왔습니다.`
      });

    } catch (error) {
      console.error("Error fetching player data:", error);
      res.status(500).json({ message: "플레이어 데이터를 가져오는 중 오류가 발생했습니다." });
    }
  });

  // Get all players
  app.get("/api/players", async (req, res) => {
    try {
      const players = await storage.getAllPlayers();
      res.json(players);
    } catch (error) {
      console.error("Error getting players:", error);
      res.status(500).json({ message: "플레이어 목록을 가져오는 중 오류가 발생했습니다." });
    }
  });

  // Manual player DB: no Riot ID, OP.GG, or external API is used here.
  const manualPlayerSchema = z.object({
    discordName: z.string().trim().min(1).max(50),
    summonerName: z.string().trim().min(1).max(100),
    tier: z.enum(["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"]),
    rank: z.enum(["IV", "III", "II", "I"]).nullable().optional(),
    mainPosition: z.enum(["TOP", "JG", "MID", "ADC", "SUP"]),
    mainPosition2: z.enum(["TOP", "JG", "MID", "ADC", "SUP"]).or(z.literal("")).default(""),
    subPosition: z.enum(["TOP", "JG", "MID", "ADC", "SUP"]).nullable().default(null),
    subPosition2: z.enum(["TOP", "JG", "MID", "ADC", "SUP"]).nullable().default(null),
  });

  const createManualPlayer = (data: z.infer<typeof manualPlayerSchema>) => ({
    discordName: data.discordName,
    summonerName: data.summonerName,
    tier: data.tier,
    rank: data.rank ?? "II",
    leaguePoints: 0,
    wins: 0,
    losses: 0,
    winRate: 0.5,
    level: 1,
    mainPosition: data.mainPosition,
    mainPosition2: data.mainPosition2,
    subPosition: data.subPosition,
    subPosition2: data.subPosition2,
    positions: Array.from(new Set([data.mainPosition, data.mainPosition2, data.subPosition, data.subPosition2].filter(Boolean))),
    mmr: 1200,
    manualTier: data.tier,
    manualRank: data.rank ?? "II",
  });

  app.post("/api/players/manual", async (req, res) => {
    const parsed = manualPlayerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "플레이어 정보가 올바르지 않습니다.", errors: parsed.error.issues });
    }
    if (await storage.getPlayerBySummonerName(parsed.data.summonerName)) {
      return res.status(409).json({ message: "같은 닉네임#태그가 이미 등록되어 있습니다." });
    }
    const player = await storage.createPlayer(createManualPlayer(parsed.data));
    res.status(201).json({ player, message: "플레이어가 수동 DB에 등록되었습니다." });
  });

  app.patch("/api/players/:id/manual", async (req, res) => {
    const parsed = manualPlayerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "플레이어 정보가 올바르지 않습니다.", errors: parsed.error.issues });
    }
    const existing = await storage.getPlayer(req.params.id);
    if (!existing) return res.status(404).json({ message: "플레이어를 찾을 수 없습니다." });
    const duplicate = await storage.getPlayerBySummonerName(parsed.data.summonerName);
    if (duplicate && duplicate.id !== existing.id) {
      return res.status(409).json({ message: "같은 닉네임#태그가 이미 등록되어 있습니다." });
    }
    const player = await storage.updatePlayer(req.params.id, createManualPlayer(parsed.data));
    res.json({ player, message: "플레이어 정보가 수정되었습니다." });
  });

  app.delete("/api/players/:id", async (req, res) => {
    const deleted = await storage.deletePlayer(req.params.id);
    if (!deleted) return res.status(404).json({ message: "플레이어를 찾을 수 없습니다." });
    res.json({ message: "플레이어가 삭제되었습니다." });
  });

  // Update player manual tier
  app.patch("/api/players/:id/tier", async (req, res) => {
    try {
      const { id } = req.params;
      const { manualTier, manualRank } = req.body;

      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ message: "플레이어를 찾을 수 없습니다." });
      }

      const tierSchema = z.object({
        manualTier: z.string().nullable().optional(),
        manualRank: z.string().nullable().optional(),
      });

      const validationResult = tierSchema.safeParse({ manualTier, manualRank });
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "잘못된 티어 데이터입니다.",
          errors: validationResult.error.issues
        });
      }

      const updatedPlayer = await storage.updatePlayer(id, {
        manualTier: manualTier ?? null,
        manualRank: manualRank ?? null,
      });

      if (!updatedPlayer) {
        return res.status(500).json({ message: "플레이어 업데이트에 실패했습니다." });
      }

      res.json({ player: updatedPlayer, message: "티어가 성공적으로 업데이트되었습니다." });
    } catch (error) {
      console.error("Error updating player tier:", error);
      res.status(500).json({ message: "티어 업데이트 중 오류가 발생했습니다." });
    }
  });

  // Update player positions
  app.patch("/api/players/:id/position", async (req, res) => {
    try {
      const { id } = req.params;
      const { mainPosition, mainPosition2, subPosition, subPosition2 } = req.body;

      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ message: "플레이어를 찾을 수 없습니다." });
      }

      const positionSchema = z.object({
        mainPosition: z.enum(["TOP", "JG", "MID", "ADC", "SUP"]),
        mainPosition2: z.enum(["TOP", "JG", "MID", "ADC", "SUP"]).optional().or(z.literal("")),
        subPosition: z.enum(["TOP", "JG", "MID", "ADC", "SUP"]).nullable().optional(),
        subPosition2: z.enum(["TOP", "JG", "MID", "ADC", "SUP"]).nullable().optional(),
      });

      const validationResult = positionSchema.safeParse({ mainPosition, mainPosition2, subPosition, subPosition2 });
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "잘못된 포지션 데이터입니다.",
          errors: validationResult.error.issues
        });
      }

      const updatedPlayer = await storage.updatePlayer(id, {
        mainPosition,
        mainPosition2: mainPosition2 || "",
        subPosition: subPosition ?? null,
        subPosition2: subPosition2 ?? null,
      });

      if (!updatedPlayer) {
        return res.status(500).json({ message: "플레이어 업데이트에 실패했습니다." });
      }

      res.json({ player: updatedPlayer, message: "포지션이 성공적으로 업데이트되었습니다." });
    } catch (error) {
      console.error("Error updating player position:", error);
      res.status(500).json({ message: "포지션 업데이트 중 오류가 발생했습니다." });
    }
  });

  // Balance teams
  app.post("/api/teams/balance", async (req, res) => {
    try {
      const { playerIds, excludedTeamPlayerIds, enforceForcedSameTeam } = req.body;
      
      if (!Array.isArray(playerIds) || playerIds.length !== 10) {
        return res.status(400).json({ message: "정확히 10명의 플레이어 ID가 필요합니다." });
      }

      // Get all players
      const players = [];
      for (const playerId of playerIds) {
        const player = await storage.getPlayer(playerId);
        if (!player) {
          return res.status(400).json({ message: `플레이어 ID ${playerId}를 찾을 수 없습니다.` });
        }
        players.push(player);
      }

      // Check if custom balance settings are provided
      const { balanceSettingsId } = req.body;
      let balanceSettings = undefined;
      
      if (balanceSettingsId) {
        balanceSettings = await storage.getBalanceSettings(balanceSettingsId);
        if (!balanceSettings) {
          return res.status(404).json({ message: "밸런스 설정을 찾을 수 없습니다." });
        }
      } else {
        // Use default settings
        balanceSettings = await storage.getDefaultBalanceSettings();
      }

      const historicalWinRateByPlayer = new Map<string, { games: number; wins: number }>();
      const getHistoryPlayerIds = (team: unknown): string[] => {
        if (!team || typeof team !== "object" || !("players" in team)) return [];
        const teamPlayers = (team as { players?: unknown }).players;
        if (!Array.isArray(teamPlayers)) return [];
        return teamPlayers
          .map((player) => {
            if (!player || typeof player !== "object" || !("id" in player)) return null;
            const id = (player as { id?: unknown }).id;
            return typeof id === "string" ? id : null;
          })
          .filter((id): id is string => Boolean(id));
      };

      for (const result of await storage.getAllBalanceResults()) {
        if (result.winner !== "BLUE" && result.winner !== "RED") continue;
        const bluePlayerIds = getHistoryPlayerIds(result.blueTeam);
        const redPlayerIds = getHistoryPlayerIds(result.redTeam);
        const winningPlayerIds = result.winner === "BLUE" ? bluePlayerIds : redPlayerIds;
        const allPlayerIds = [...bluePlayerIds, ...redPlayerIds];
        for (const playerId of allPlayerIds) {
          const stat = historicalWinRateByPlayer.get(playerId) ?? { games: 0, wins: 0 };
          stat.games += 1;
          if (winningPlayerIds.includes(playerId)) stat.wins += 1;
          historicalWinRateByPlayer.set(playerId, stat);
        }
      }

      const recordedWinRates = new Map(
        Array.from(historicalWinRateByPlayer.entries()).map(([playerId, stat]) => [
          playerId,
          stat.games > 0 ? stat.wins / stat.games : 0.5,
        ]),
      );
      
      const teamBalancerInstance = new TeamBalancer(balanceSettings);
      const balanceResult = await teamBalancerInstance.balanceTeams(players, balanceSettings, {
        excludedTeamPlayerIds: Array.isArray(excludedTeamPlayerIds) ? excludedTeamPlayerIds : undefined,
        enforceForcedSameTeam: enforceForcedSameTeam !== false,
        recordedWinRates,
      });
      
      // Save the balance result and get the saved result with ID
      const savedBalanceResult = await storage.createBalanceResult({
        blueTeam: balanceResult.blueTeam,
        redTeam: balanceResult.redTeam,
        balanceScore: balanceResult.balanceScore,
        mmrDifference: balanceResult.mmrDifference,
        winRateDifference: balanceResult.winRateDifference,
        positionBalance: balanceResult.positionMatch,
      });

      // 주라인1 우선배정 천장(pity) 시스템: 이번에 실제로 배정된 라인을 기준으로
      // 각 선수의 누적 점수를 갱신합니다. (주라인1 배정 시 0으로 초기화,
      // 그 외에는 주라인2 +5 / 부라인1 +10 / 부라인2 +20 / 부라인3 +30)
      const assignedTeamPlayers = [...balanceResult.blueTeam.players, ...balanceResult.redTeam.players];
      await Promise.all(
        assignedTeamPlayers.map((assignedPlayer) => {
          const originalPlayer = players.find((player) => player.id === assignedPlayer.id);
          if (!originalPlayer || !assignedPlayer.recommendedPosition) return Promise.resolve(undefined);
          const nextPityScore = TeamBalancer.computeNextPityScore(
            originalPlayer,
            assignedPlayer.recommendedPosition,
          );
          if (nextPityScore === (originalPlayer.pityScore ?? 0)) return Promise.resolve(undefined);
          return storage.updatePlayer(originalPlayer.id, { pityScore: nextPityScore });
        }),
      );

      // Return the balance result with the ID for sharing
      res.json({
        ...balanceResult,
        id: savedBalanceResult.id,
        createdAt: savedBalanceResult.createdAt,
      });

    } catch (error) {
      console.error("Error balancing teams:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "팀 밸런스를 맞추는 중 오류가 발생했습니다." });
    }
  });

  // Get balance history
  app.get("/api/balance-history", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const history = await storage.getBalanceResults(limit);
      res.json(history);
    } catch (error) {
      console.error("Error getting balance history:", error);
      res.status(500).json({ message: "밸런스 기록을 가져오는 중 오류가 발생했습니다." });
    }
  });

  // Clear all balance history
  app.delete("/api/balance-history", async (_req, res) => {
    try {
      await storage.clearBalanceResults();
      res.json({ message: "밸런싱 기록이 모두 초기화되었습니다." });
    } catch (error) {
      console.error("Error clearing balance history:", error);
      res.status(500).json({ message: "밸런싱 기록을 초기화하는 중 오류가 발생했습니다." });
    }
  });

  // Delete one balance history entry
  app.delete("/api/balance-history/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteBalanceResult(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "밸런싱 기록을 찾을 수 없습니다." });
      }
      res.json({ message: "밸런싱 기록을 삭제했습니다." });
    } catch (error) {
      console.error("Error deleting balance history entry:", error);
      res.status(500).json({ message: "밸런싱 기록을 삭제하는 중 오류가 발생했습니다." });
    }
  });

  // Record the winning team for a balance result
  app.patch("/api/balance-history/:id/winner", async (req, res) => {
    try {
      const { id } = req.params;
      const { winner } = req.body;
      const validWinners = ["BLUE", "RED", null];

      if (!validWinners.includes(winner)) {
        return res.status(400).json({ message: "승리 팀은 BLUE, RED 또는 null이어야 합니다." });
      }

      const updatedResult = await storage.updateBalanceResultWinner(id, winner);
      if (!updatedResult) {
        return res.status(404).json({ message: "밸런싱 기록을 찾을 수 없습니다." });
      }

      res.json({
        result: updatedResult,
        message: winner ? "승패가 기록되었습니다." : "승패 기록이 삭제되었습니다.",
      });
    } catch (error) {
      console.error("Error updating balance history winner:", error);
      res.status(500).json({ message: "승패를 기록하는 중 오류가 발생했습니다." });
    }
  });

  // Aggregate recorded in-house match results for every registered player
  app.get("/api/inhouse-stats", async (_req, res) => {
    try {
      const [players, results] = await Promise.all([
        storage.getAllPlayers(),
        storage.getAllBalanceResults(),
      ]);
      const positions = ["TOP", "JG", "MID", "ADC", "SUP"] as const;
      const createLaneStats = () =>
        positions.map((position) => ({
          position,
          games: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
        }));
      const statsByPlayer = new Map(
        players.map((player) => [
          player.id,
          {
            playerId: player.id,
            discordName: player.discordName,
            summonerName: player.summonerName,
            tier: player.manualTier || player.tier,
            rank: player.manualRank || player.rank,
            games: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            laneStats: createLaneStats(),
            teammateStats: [] as Array<{
              playerId: string;
              discordName: string;
              summonerName: string;
              games: number;
              wins: number;
              losses: number;
              winRate: number;
            }>,
          },
        ]),
      );
      const teammatesByPlayer = new Map(
        players.map((player) => [
          player.id,
          new Map<string, { games: number; wins: number; losses: number }>(),
        ]),
      );

      let recordedMatches = 0;
      let blueWins = 0;
      let redWins = 0;

      const getTeamPlayers = (team: unknown): Array<{ id: string; position: string | null }> => {
        if (!team || typeof team !== "object" || !("players" in team)) return [];
        const teamPlayers = (team as { players?: unknown }).players;
        if (!Array.isArray(teamPlayers)) return [];
        return teamPlayers
          .map((player) => {
            if (!player || typeof player !== "object" || !("id" in player)) return null;
            return typeof (player as { id?: unknown }).id === "string"
              ? {
                  id: (player as { id: string }).id,
                  position:
                    typeof (player as { recommendedPosition?: unknown }).recommendedPosition === "string"
                      ? (player as { recommendedPosition: string }).recommendedPosition
                      : null,
                }
              : null;
          })
          .filter((player): player is { id: string; position: string | null } => Boolean(player));
      };

      for (const result of results) {
        if (result.winner !== "BLUE" && result.winner !== "RED") continue;
        recordedMatches += 1;
        if (result.winner === "BLUE") blueWins += 1;
        if (result.winner === "RED") redWins += 1;

        const bluePlayers = getTeamPlayers(result.blueTeam);
        const redPlayers = getTeamPlayers(result.redTeam);
        const updatePlayerStats = (
          teamPlayers: Array<{ id: string; position: string | null }>,
          won: boolean,
        ) => {
          for (const teamPlayer of teamPlayers) {
            const stat = statsByPlayer.get(teamPlayer.id);
            if (!stat) continue;
            stat.games += 1;
            if (won) stat.wins += 1;
            else stat.losses += 1;

            const lane = stat.laneStats.find((laneStat) => laneStat.position === teamPlayer.position);
            if (!lane) continue;
            lane.games += 1;
            if (won) lane.wins += 1;
            else lane.losses += 1;
          }
        };

        updatePlayerStats(bluePlayers, result.winner === "BLUE");
        updatePlayerStats(redPlayers, result.winner === "RED");

        const updateTeammateStats = (
          teamPlayers: Array<{ id: string; position: string | null }>,
          won: boolean,
        ) => {
          for (const teamPlayer of teamPlayers) {
            const teammateStats = teammatesByPlayer.get(teamPlayer.id);
            if (!teammateStats) continue;

            for (const teammate of teamPlayers) {
              if (teammate.id === teamPlayer.id || !statsByPlayer.has(teammate.id)) continue;
              const current = teammateStats.get(teammate.id) ?? { games: 0, wins: 0, losses: 0 };
              current.games += 1;
              if (won) current.wins += 1;
              else current.losses += 1;
              teammateStats.set(teammate.id, current);
            }
          }
        };

        updateTeammateStats(bluePlayers, result.winner === "BLUE");
        updateTeammateStats(redPlayers, result.winner === "RED");
      }

      const playerStats = Array.from(statsByPlayer.values())
        .map((stat) => ({
          ...stat,
          winRate: stat.games > 0 ? Math.round((stat.wins / stat.games) * 1000) / 10 : 0,
          laneStats: stat.laneStats.map((laneStat) => ({
            ...laneStat,
            winRate: laneStat.games > 0
              ? Math.round((laneStat.wins / laneStat.games) * 1000) / 10
              : 0,
          })),
          teammateStats: Array.from(teammatesByPlayer.get(stat.playerId)?.entries() ?? [])
            .map(([playerId, teammateStat]) => {
              const teammate = statsByPlayer.get(playerId);
              if (!teammate) return null;
              return {
                playerId,
                discordName: teammate.discordName,
                summonerName: teammate.summonerName,
                ...teammateStat,
                winRate: teammateStat.games > 0
                  ? Math.round((teammateStat.wins / teammateStat.games) * 1000) / 10
                  : 0,
              };
            })
            .filter((teammate): teammate is NonNullable<typeof teammate> => Boolean(teammate))
            .sort((a, b) => {
              if (b.games !== a.games) return b.games - a.games;
              if (b.winRate !== a.winRate) return b.winRate - a.winRate;
              return (a.discordName || a.summonerName).localeCompare(
                b.discordName || b.summonerName,
                "ko",
              );
            }),
        }))
        .sort((a, b) => {
          if (b.games !== a.games) return b.games - a.games;
          if (b.winRate !== a.winRate) return b.winRate - a.winRate;
          return (a.discordName || a.summonerName).localeCompare(b.discordName || b.summonerName, "ko");
        });
      const topPlayers = playerStats
        .filter((player) => player.games > 0)
        .sort((a, b) => {
          if (b.winRate !== a.winRate) return b.winRate - a.winRate;
          if (b.games !== a.games) return b.games - a.games;
          if (b.wins !== a.wins) return b.wins - a.wins;
          return (a.discordName || a.summonerName).localeCompare(b.discordName || b.summonerName, "ko");
        })
        .slice(0, 3);

      res.json({
        totalPlayers: playerStats.length,
        recordedMatches,
        blueWins,
        redWins,
        players: playerStats,
        topPlayers,
      });
    } catch (error) {
      console.error("Error getting in-house statistics:", error);
      res.status(500).json({ message: "내전 통계를 가져오는 중 오류가 발생했습니다." });
    }
  });

  // Get a specific balance result for sharing
  app.get("/api/balance-results/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const balanceResult = await storage.getBalanceResult(id);
      
      if (!balanceResult) {
        return res.status(404).json({ message: "밸런싱 결과를 찾을 수 없습니다." });
      }

      res.json(balanceResult);
    } catch (error) {
      console.error("Error getting balance result:", error);
      res.status(500).json({ message: "밸런싱 결과를 가져오는 중 오류가 발생했습니다." });
    }
  });

  // Preset management
  // Create a new preset
  app.post("/api/presets", async (req, res) => {
    try {
      const validationResult = insertPresetSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "잘못된 프리셋 데이터입니다.",
          errors: validationResult.error.issues
        });
      }

      const preset = await storage.createPreset(validationResult.data);
      res.json({ preset, message: "프리셋이 성공적으로 저장되었습니다." });
    } catch (error) {
      console.error("Error creating preset:", error);
      res.status(500).json({ message: "프리셋 저장 중 오류가 발생했습니다." });
    }
  });

  // Get all presets
  app.get("/api/presets", async (req, res) => {
    try {
      const presets = await storage.getAllPresets();
      res.json(presets);
    } catch (error) {
      console.error("Error getting presets:", error);
      res.status(500).json({ message: "프리셋 목록을 가져오는 중 오류가 발생했습니다." });
    }
  });

  // Get a specific preset
  app.get("/api/presets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const preset = await storage.getPreset(id);
      
      if (!preset) {
        return res.status(404).json({ message: "프리셋을 찾을 수 없습니다." });
      }

      res.json(preset);
    } catch (error) {
      console.error("Error getting preset:", error);
      res.status(500).json({ message: "프리셋을 가져오는 중 오류가 발생했습니다." });
    }
  });

  // Update a preset
  app.put("/api/presets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const validationResult = insertPresetSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "잘못된 프리셋 데이터입니다.",
          errors: validationResult.error.issues
        });
      }

      const updatedPreset = await storage.updatePreset(id, validationResult.data);
      if (!updatedPreset) {
        return res.status(404).json({ message: "프리셋을 찾을 수 없습니다." });
      }

      res.json({ preset: updatedPreset, message: "프리셋이 성공적으로 수정되었습니다." });
    } catch (error) {
      console.error("Error updating preset:", error);
      res.status(500).json({ message: "프리셋 수정 중 오류가 발생했습니다." });
    }
  });

  // Delete a preset
  app.delete("/api/presets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deletePreset(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "프리셋을 찾을 수 없습니다." });
      }

      res.json({ message: "프리셋이 성공적으로 삭제되었습니다." });
    } catch (error) {
      console.error("Error deleting preset:", error);
      res.status(500).json({ message: "프리셋 삭제 중 오류가 발생했습니다." });
    }
  });

  // Balance Settings endpoints
  
  // Get all balance settings
  app.get("/api/balance-settings", async (req, res) => {
    try {
      const settings = await storage.getAllBalanceSettings();
      res.json({ settings });
    } catch (error) {
      console.error("Error fetching balance settings:", error);
      res.status(500).json({ message: "밸런스 설정을 가져오는 중 오류가 발생했습니다." });
    }
  });

  // Get default balance settings
  app.get("/api/balance-settings/default", async (req, res) => {
    try {
      const defaultSettings = await storage.getDefaultBalanceSettings();
      if (!defaultSettings) {
        return res.status(404).json({ message: "기본 밸런스 설정이 없습니다." });
      }
      res.json({ settings: defaultSettings });
    } catch (error) {
      console.error("Error fetching default balance settings:", error);
      res.status(500).json({ message: "기본 밸런스 설정을 가져오는 중 오류가 발생했습니다." });
    }
  });

  // Get specific balance settings
  app.get("/api/balance-settings/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const settings = await storage.getBalanceSettings(id);
      if (!settings) {
        return res.status(404).json({ message: "밸런스 설정을 찾을 수 없습니다." });
      }
      res.json({ settings });
    } catch (error) {
      console.error("Error fetching balance settings:", error);
      res.status(500).json({ message: "밸런스 설정을 가져오는 중 오류가 발생했습니다." });
    }
  });

  // Create new balance settings
  app.post("/api/balance-settings", async (req, res) => {
    try {
      const validationResult = insertBalanceSettingsSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "잘못된 밸런스 설정 데이터입니다.",
          errors: validationResult.error.issues
        });
      }

      // Validate that weights add up to 1.0
      const { mmrWeight, positionWeight, winRateWeight } = validationResult.data;
      const totalWeight = (mmrWeight ?? 0) + (positionWeight ?? 0) + (winRateWeight ?? 0);
      if (Math.abs(totalWeight - 1.0) > 0.001) {
        return res.status(400).json({ 
          message: "밸런스 가중치의 합은 1.0이어야 합니다." 
        });
      }

      const newSettings = await storage.createBalanceSettings(validationResult.data);
      res.status(201).json({ 
        settings: newSettings, 
        message: "밸런스 설정이 성공적으로 생성되었습니다." 
      });
    } catch (error) {
      console.error("Error creating balance settings:", error);
      res.status(500).json({ message: "밸런스 설정 생성 중 오류가 발생했습니다." });
    }
  });

  // Update balance settings
  app.put("/api/balance-settings/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const validationResult = insertBalanceSettingsSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "잘못된 밸런스 설정 데이터입니다.",
          errors: validationResult.error.issues
        });
      }

      const updateData = validationResult.data;
      const existingSettings = await storage.getBalanceSettings(id);
      if (!existingSettings) {
        return res.status(404).json({ message: "밸런스 설정을 찾을 수 없습니다." });
      }
      if (
        updateData.mmrWeight !== undefined ||
        updateData.positionWeight !== undefined ||
        updateData.winRateWeight !== undefined
      ) {
        const totalWeight =
          (updateData.mmrWeight ?? existingSettings.mmrWeight) +
          (updateData.positionWeight ?? existingSettings.positionWeight) +
          (updateData.winRateWeight ?? existingSettings.winRateWeight);
        if (Math.abs(totalWeight - 1.0) > 0.001) {
          return res.status(400).json({ 
            message: "밸런스 가중치의 합은 1.0이어야 합니다." 
          });
        }
      }

      const updatedSettings = await storage.updateBalanceSettings(id, updateData);
      if (!updatedSettings) {
        return res.status(404).json({ message: "밸런스 설정을 찾을 수 없습니다." });
      }

      res.json({ 
        settings: updatedSettings, 
        message: "밸런스 설정이 성공적으로 수정되었습니다." 
      });
    } catch (error) {
      console.error("Error updating balance settings:", error);
      res.status(500).json({ message: "밸런스 설정 수정 중 오류가 발생했습니다." });
    }
  });

  // Delete balance settings
  app.delete("/api/balance-settings/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteBalanceSettings(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "밸런스 설정을 찾을 수 없거나 기본 설정은 삭제할 수 없습니다." });
      }

      res.json({ message: "밸런스 설정이 성공적으로 삭제되었습니다." });
    } catch (error) {
      console.error("Error deleting balance settings:", error);
      res.status(500).json({ message: "밸런스 설정 삭제 중 오류가 발생했습니다." });
    }
  });

  // Clear all data (for testing)
  app.delete("/api/clear", async (req, res) => {
    try {
      // Clear in-memory storage
      const newStorage = new (storage.constructor as any)();
      Object.setPrototypeOf(storage, Object.getPrototypeOf(newStorage));
      Object.assign(storage, newStorage);
      
      res.json({ message: "모든 데이터가 삭제되었습니다." });
    } catch (error) {
      console.error("Error clearing data:", error);
      res.status(500).json({ message: "데이터 삭제 중 오류가 발생했습니다." });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
