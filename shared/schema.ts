import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, jsonb, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export type Position = "TOP" | "JG" | "MID" | "ADC" | "SUP";
export type Tier = "IRON" | "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" | "EMERALD" | "DIAMOND" | "MASTER" | "GRANDMASTER" | "CHALLENGER";

export interface QuickPlayer {
  discordName: string;
  summonerName: string;
  mainPositions: Position[];
  subPositions: Position[];
}

// Quick-fill roster supplied for the custom-game lobby.
export const QUICK_PLAYER_ROSTER: QuickPlayer[] = [
  { discordName: "말라리", summonerName: "단결된 의지#1226", mainPositions: ["TOP", "MID"], subPositions: ["JG", "SUP"] },
  { discordName: "리코", summonerName: "우리 집 앞 찹쌀 붕어빵#맛있어요", mainPositions: ["MID", "ADC"], subPositions: ["TOP", "SUP"] },
  { discordName: "스카이", summonerName: "다크블루3#KR1", mainPositions: ["TOP", "JG"], subPositions: ["MID"] },
  { discordName: "별우주", summonerName: "JWCB#STSP", mainPositions: ["TOP", "MID"], subPositions: ["JG"] },
  { discordName: "아세", summonerName: "Vega#BDD", mainPositions: ["MID", "ADC"], subPositions: ["SUP", "JG"] },
  { discordName: "@김토토@", summonerName: "김토토#아가대장", mainPositions: ["SUP"], subPositions: [] },
  { discordName: "@졍졍쓰@", summonerName: "졍졍쓰#7777", mainPositions: ["ADC", "JG"], subPositions: ["MID", "TOP"] },
  { discordName: "광어", summonerName: "물컹한맛광어#0076", mainPositions: ["SUP", "MID"], subPositions: ["JG", "TOP"] },
  { discordName: "별이", summonerName: "별이에요#star", mainPositions: ["SUP"], subPositions: [] },
  { discordName: "고라니", summonerName: "서영이언니이뻐요#1226", mainPositions: ["TOP", "MID"], subPositions: ["JG", "SUP"] },
  { discordName: "스페얼", summonerName: "스페얼아님#1234", mainPositions: ["TOP", "MID"], subPositions: ["JG"] },
  { discordName: "김맨들씨", summonerName: "맨들펀치#김맨들씨", mainPositions: ["SUP", "TOP"], subPositions: ["MID", "JG"] },
  { discordName: "김수원", summonerName: "아스파라거스#aste", mainPositions: ["MID"], subPositions: [] },
  { discordName: "쌀빱", summonerName: "안녕안녕#안녕이야", mainPositions: ["JG", "ADC"], subPositions: ["MID", "TOP"] },
  { discordName: "천악", summonerName: "사라진세계의천악#KR1", mainPositions: ["JG", "SUP"], subPositions: ["MID", "TOP"] },
  { discordName: "형붕붕", summonerName: "은빛날개z#KR1", mainPositions: ["JG", "TOP"], subPositions: ["ADC", "SUP"] },
  { discordName: "겐에이", summonerName: "겐에이#파스텔", mainPositions: ["TOP", "JG"], subPositions: ["MID", "SUP"] },
  { discordName: "쨔스", summonerName: "이수민#8826", mainPositions: ["ADC", "MID"], subPositions: ["TOP", "JG"] },
  { discordName: "무능", summonerName: "게임 안에서 게임하기#니하하하하", mainPositions: ["TOP", "MID"], subPositions: ["ADC", "JG"] },
];

// Riot ID validation schema (supports Korean characters, numbers, and special characters in tags)
export const riotIdSchema = z.string()
  .regex(/^[^#]{3,16}#[\w\u3131-\u3163\u1100-\u11FF\uAC00-\uD7A3\uA960-\uA97F\uD7B0-\uD7FF]{1,5}$/, "올바른 라이엇 ID 형식이 아닙니다 (예: 닉네임#태그)")
  .transform((val) => val.trim());

export const players = pgTable("players", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  discordName: text("discord_name").notNull().default(""),
  summonerName: text("summoner_name").notNull(),
  tier: text("tier").notNull(),
  rank: text("rank"),
  leaguePoints: integer("league_points").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  winRate: real("win_rate").notNull().default(0),
  level: integer("level").notNull().default(1),
  mainPosition: text("main_position").notNull(),
  mainPosition2: text("main_position_2").notNull().default(""),
  subPosition: text("sub_position"),
  subPosition2: text("sub_position_2"),
  positions: jsonb("positions").notNull().default('[]'),
  mmr: integer("mmr").notNull().default(1200),
  manualTier: text("manual_tier"),
  manualRank: text("manual_rank"),
  // 주라인1 우선배정 천장(pity) 시스템 누적 점수.
  // 주라인2 배정 +5, 부라인1 배정 +10, 부라인2 배정 +20, 부라인3 배정 +30.
  // 35점 이상이면 다음 밸런싱에서 주라인1로 우선배정되며, 주라인1로 배정되는 순간 0으로 초기화됩니다.
  pityScore: integer("pity_score").notNull().default(0),
  lastUpdated: text("last_updated").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  players: jsonb("players").notNull().default('[]'),
  averageMmr: real("average_mmr").notNull().default(0),
  averageWinRate: real("average_win_rate").notNull().default(0),
  teamScore: real("team_score").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const balanceResults = pgTable("balance_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  blueTeam: jsonb("blue_team").notNull(),
  redTeam: jsonb("red_team").notNull(),
  balanceScore: real("balance_score").notNull().default(0),
  mmrDifference: real("mmr_difference").notNull().default(0),
  winRateDifference: real("win_rate_difference").notNull().default(0),
  positionBalance: real("position_balance").notNull().default(0),
  winner: text("winner"),
  // 이 밸런싱 기록의 승패가 기록되어(winner가 BLUE/RED로 설정되어) 가산점(pity)이
  // 이미 각 선수에게 반영되었는지 여부. 같은 기록에 대해 가산점이 중복 반영되는 것을 막습니다.
  pityApplied: boolean("pity_applied").notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const presets = pgTable("presets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  playerNames: jsonb("player_names").notNull().default('[]'), // Array of riot IDs/summoner names
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertPlayerSchema = createInsertSchema(players).omit({
  id: true,
  lastUpdated: true,
});

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  createdAt: true,
});

export const insertBalanceResultSchema = createInsertSchema(balanceResults).omit({
  id: true,
  createdAt: true,
});

export const insertPresetSchema = createInsertSchema(presets).omit({
  id: true,
  createdAt: true,
});

export type Player = typeof players.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type BalanceResult = typeof balanceResults.$inferSelect;
export type InsertBalanceResult = z.infer<typeof insertBalanceResultSchema>;
export type Preset = typeof presets.$inferSelect;
export type InsertPreset = z.infer<typeof insertPresetSchema>;

// API Response types
export interface OpggPlayerData {
  summonerName: string;
  level: number;
  tier: string;
  rank: string | null;
  leaguePoints: number;
  wins: number;
  losses: number;
  mostPlayedPositions: Position[];
}

// Data provider interface for abstraction between API and scraper
export interface IDataProvider {
  fetchPlayerData(riotId: string, forceRefresh?: boolean): Promise<OpggPlayerData>;
  fetchMultiplePlayersData(riotIds: string[], forceRefresh?: boolean): Promise<{ data: OpggPlayerData | null; error: string | null; riotId: string }[]>;
}

export interface TeamComposition {
  players: RecommendedPlayer[];
  averageMmr: number;
  averageWinRate: number;
  teamScore: number;
}

export interface RecommendedPlayer extends Player {
  recommendedPosition?: Position;
}

export interface BalanceAnalysis {
  blueTeam: TeamComposition;
  redTeam: TeamComposition;
  balanceScore: number;
  mmrDifference: number;
  winRateDifference: number;
  positionMatch: number;
}

export interface ShareableBalanceResult extends BalanceAnalysis {
  id: string;
  createdAt: string;
}

export interface InhousePlayerStats {
  playerId: string;
  discordName: string;
  summonerName: string;
  tier: string;
  rank: string | null;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  laneStats: InhouseLaneStats[];
  teammateStats: InhouseTeammateStats[];
}

export interface InhouseLaneStats {
  position: Position;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface InhouseTeammateStats {
  playerId: string;
  discordName: string;
  summonerName: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface InhouseStatsSummary {
  totalPlayers: number;
  recordedMatches: number;
  blueWins: number;
  redWins: number;
  players: InhousePlayerStats[];
  topPlayers: InhousePlayerStats[];
  // topPlayers에 들기 위한 최소 참여 경기 수(총 내전 횟수의 30% 이상, 올림).
  topPlayersMinGames: number;
}

// Balance settings schema
export const balanceSettingsTable = pgTable("balance_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  isDefault: boolean("is_default").default(false),
  
  // Balance score weights (must add up to 1.0)
  mmrWeight: real("mmr_weight").default(0.7).notNull(),
  positionWeight: real("position_weight").default(0.3).notNull(),
  winRateWeight: real("win_rate_weight").default(0).notNull(),
  
  // Position importance weights
  topWeight: real("top_weight").default(1.0).notNull(),
  jgWeight: real("jg_weight").default(1.1).notNull(),
  midWeight: real("mid_weight").default(1.2).notNull(),
  adcWeight: real("adc_weight").default(1.0).notNull(),
  supWeight: real("sup_weight").default(0.9).notNull(),
  
  // Scoring parameters
  mmrTolerance: real("mmr_tolerance").default(20.0).notNull(), // MMR difference tolerance
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBalanceSettingsSchema = createInsertSchema(balanceSettingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBalanceSettings = z.infer<typeof insertBalanceSettingsSchema>;
export type BalanceSettings = typeof balanceSettingsTable.$inferSelect;
