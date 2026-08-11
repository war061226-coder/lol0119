import {
  players,
  teams,
  balanceResults,
  presets,
  balanceSettingsTable,
  type Player, type InsertPlayer, type Team, type InsertTeam, type BalanceResult, type InsertBalanceResult, type Preset, type InsertPreset, type BalanceSettings, type InsertBalanceSettings,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { eq, desc } from "drizzle-orm";
import { createDb, type Database } from "./db";

export function getDataDir(): string {
  return process.env.LOL_BALANCER_DATA_DIR
    || join((process as any).pkg ? dirname(process.execPath) : process.cwd(), "data");
}

export interface IStorage {
  // Player operations
  getPlayer(id: string): Promise<Player | undefined>;
  getPlayerBySummonerName(summonerName: string): Promise<Player | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  updatePlayer(id: string, player: Partial<InsertPlayer>): Promise<Player | undefined>;
  deletePlayer(id: string): Promise<boolean>;
  getAllPlayers(): Promise<Player[]>;
  
  // Team operations
  getTeam(id: string): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  getAllTeams(): Promise<Team[]>;
  
  // Balance result operations
  createBalanceResult(result: InsertBalanceResult): Promise<BalanceResult>;
  getBalanceResult(id: string): Promise<BalanceResult | undefined>;
  getBalanceResults(limit?: number): Promise<BalanceResult[]>;
  getAllBalanceResults(): Promise<BalanceResult[]>;
  updateBalanceResultWinner(id: string, winner: string | null): Promise<BalanceResult | undefined>;
  clearBalanceResults(): Promise<void>;
  
  // Preset operations
  createPreset(preset: InsertPreset): Promise<Preset>;
  getPreset(id: string): Promise<Preset | undefined>;
  getAllPresets(): Promise<Preset[]>;
  updatePreset(id: string, preset: Partial<InsertPreset>): Promise<Preset | undefined>;
  deletePreset(id: string): Promise<boolean>;
  
  // Balance settings operations
  createBalanceSettings(settings: InsertBalanceSettings): Promise<BalanceSettings>;
  getBalanceSettings(id: string): Promise<BalanceSettings | undefined>;
  getAllBalanceSettings(): Promise<BalanceSettings[]>;
  getDefaultBalanceSettings(): Promise<BalanceSettings | undefined>;
  updateBalanceSettings(id: string, settings: Partial<InsertBalanceSettings>): Promise<BalanceSettings | undefined>;
  deleteBalanceSettings(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private players: Map<string, Player>;
  private teams: Map<string, Team>;
  private balanceResults: Map<string, BalanceResult>;
  private presets: Map<string, Preset>;
  private balanceSettings: Map<string, BalanceSettings>;
  private readonly appRoot = getDataDir();
  private readonly playersFile = join(this.appRoot, "manual-players.json");
  private readonly balanceHistoryFile = join(this.appRoot, "balance-history.json");

  constructor() {
    this.players = new Map();
    this.teams = new Map();
    this.balanceResults = new Map();
    this.presets = new Map();
    this.balanceSettings = new Map();
    this.loadPlayers();
    this.loadBalanceResults();
    
    // Create a default balance settings
    this.initializeDefaultBalanceSettings();
  }

  async getPlayer(id: string): Promise<Player | undefined> {
    return this.players.get(id);
  }

  async getPlayerBySummonerName(summonerName: string): Promise<Player | undefined> {
    return Array.from(this.players.values()).find(
      (player) => player.summonerName.toLowerCase() === summonerName.toLowerCase()
    );
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const id = randomUUID();
    const player: Player = { 
      ...insertPlayer,
      discordName: insertPlayer.discordName ?? "",
      mainPosition2: insertPlayer.mainPosition2 ?? "",
      subPosition: insertPlayer.subPosition ?? null,
      subPosition2: insertPlayer.subPosition2 ?? null,
      rank: insertPlayer.rank || null,
      leaguePoints: insertPlayer.leaguePoints || 0,
      wins: insertPlayer.wins || 0,
      losses: insertPlayer.losses || 0,
      winRate: insertPlayer.winRate || 0,
      level: insertPlayer.level || 1,
      positions: insertPlayer.positions || [],
      mmr: insertPlayer.mmr || 1200,
      manualTier: insertPlayer.manualTier || null,
      manualRank: insertPlayer.manualRank || null,
      pityScore: insertPlayer.pityScore ?? 0,
      id, 
      lastUpdated: new Date().toISOString() 
    };
    this.players.set(id, player);
    this.persistPlayers();
    return player;
  }

  async updatePlayer(id: string, updateData: Partial<InsertPlayer>): Promise<Player | undefined> {
    const existingPlayer = this.players.get(id);
    if (!existingPlayer) return undefined;
    
    const updatedPlayer: Player = {
      ...existingPlayer,
      ...updateData,
      lastUpdated: new Date().toISOString()
    };
    this.players.set(id, updatedPlayer);
    this.persistPlayers();
    return updatedPlayer;
  }

  async deletePlayer(id: string): Promise<boolean> {
    const deleted = this.players.delete(id);
    if (deleted) this.persistPlayers();
    return deleted;
  }

  async getAllPlayers(): Promise<Player[]> {
    return Array.from(this.players.values());
  }

  private loadPlayers() {
    if (!existsSync(this.playersFile)) return;
    try {
      const savedPlayers = JSON.parse(readFileSync(this.playersFile, "utf8")) as Player[];
      for (const player of savedPlayers) {
        // 기존에 저장된 데이터에는 pityScore 필드가 없을 수 있으므로 기본값 0으로 보정합니다.
        this.players.set(player.id, { ...player, pityScore: player.pityScore ?? 0 });
      }
    } catch (error) {
      console.error("수동 플레이어 DB를 불러오지 못했습니다:", error);
    }
  }

  private persistPlayers() {
    try {
      const directory = this.appRoot;
      mkdirSync(directory, { recursive: true });
      writeFileSync(this.playersFile, JSON.stringify(Array.from(this.players.values()), null, 2), "utf8");
    } catch (error) {
      console.error("수동 플레이어 DB를 저장하지 못했습니다:", error);
    }
  }

  private loadBalanceResults() {
    if (!existsSync(this.balanceHistoryFile)) return;
    try {
      const savedResults = JSON.parse(readFileSync(this.balanceHistoryFile, "utf8")) as BalanceResult[];
      for (const result of savedResults) {
        this.balanceResults.set(result.id, {
          ...result,
          winner: result.winner ?? null,
        });
      }
    } catch (error) {
      console.error("밸런싱 기록을 불러오지 못했습니다:", error);
    }
  }

  private persistBalanceResults() {
    try {
      const directory = this.appRoot;
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        this.balanceHistoryFile,
        JSON.stringify(Array.from(this.balanceResults.values()), null, 2),
        "utf8",
      );
    } catch (error) {
      console.error("밸런싱 기록을 저장하지 못했습니다:", error);
    }
  }

  async getTeam(id: string): Promise<Team | undefined> {
    return this.teams.get(id);
  }

  async createTeam(insertTeam: InsertTeam): Promise<Team> {
    const id = randomUUID();
    const team: Team = { 
      ...insertTeam,
      players: insertTeam.players || [],
      averageMmr: insertTeam.averageMmr || 0,
      averageWinRate: insertTeam.averageWinRate || 0,
      teamScore: insertTeam.teamScore || 0,
      id, 
      createdAt: new Date().toISOString() 
    };
    this.teams.set(id, team);
    return team;
  }

  async getAllTeams(): Promise<Team[]> {
    return Array.from(this.teams.values());
  }

  async createBalanceResult(insertResult: InsertBalanceResult): Promise<BalanceResult> {
    const id = randomUUID();
    const result: BalanceResult = { 
      ...insertResult,
      balanceScore: insertResult.balanceScore || 0,
      mmrDifference: insertResult.mmrDifference || 0,
      winRateDifference: insertResult.winRateDifference || 0,
      positionBalance: insertResult.positionBalance || 0,
      winner: insertResult.winner ?? null,
      id, 
      createdAt: new Date().toISOString() 
    };
    this.balanceResults.set(id, result);
    this.persistBalanceResults();
    return result;
  }

  async getBalanceResult(id: string): Promise<BalanceResult | undefined> {
    return this.balanceResults.get(id);
  }

  async getBalanceResults(limit = 10): Promise<BalanceResult[]> {
    const results = Array.from(this.balanceResults.values());
    return results
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  async getAllBalanceResults(): Promise<BalanceResult[]> {
    const results = Array.from(this.balanceResults.values());
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async updateBalanceResultWinner(id: string, winner: string | null): Promise<BalanceResult | undefined> {
    const existingResult = this.balanceResults.get(id);
    if (!existingResult) return undefined;

    const updatedResult: BalanceResult = {
      ...existingResult,
      winner,
    };
    this.balanceResults.set(id, updatedResult);
    this.persistBalanceResults();
    return updatedResult;
  }

  async deleteBalanceResult(id: string): Promise<boolean> {
    const deleted = this.balanceResults.delete(id);
    if (deleted) this.persistBalanceResults();
    return deleted;
  }

  async clearBalanceResults(): Promise<void> {
    this.balanceResults.clear();
    this.persistBalanceResults();
  }

  async createPreset(insertPreset: InsertPreset): Promise<Preset> {
    const id = randomUUID();
    const preset: Preset = { 
      ...insertPreset,
      playerNames: insertPreset.playerNames || [],
      description: insertPreset.description || null,
      id, 
      createdAt: new Date().toISOString() 
    };
    this.presets.set(id, preset);
    return preset;
  }

  async getPreset(id: string): Promise<Preset | undefined> {
    return this.presets.get(id);
  }

  async getAllPresets(): Promise<Preset[]> {
    const presets = Array.from(this.presets.values());
    return presets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async updatePreset(id: string, updateData: Partial<InsertPreset>): Promise<Preset | undefined> {
    const existingPreset = this.presets.get(id);
    if (!existingPreset) return undefined;
    
    const updatedPreset: Preset = {
      ...existingPreset,
      ...updateData,
    };
    this.presets.set(id, updatedPreset);
    return updatedPreset;
  }

  async deletePreset(id: string): Promise<boolean> {
    return this.presets.delete(id);
  }

  // Initialize default balance settings
  private async initializeDefaultBalanceSettings(): Promise<void> {
    const defaultSettings: BalanceSettings = {
      id: randomUUID(),
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
    this.balanceSettings.set(defaultSettings.id, defaultSettings);
  }

  async createBalanceSettings(insertSettings: InsertBalanceSettings): Promise<BalanceSettings> {
    const id = randomUUID();
    const settings: BalanceSettings = {
      ...insertSettings,
      id,
      isDefault: insertSettings.isDefault ?? false,
       mmrWeight: insertSettings.mmrWeight ?? 0.7,
       positionWeight: insertSettings.positionWeight ?? 0.3,
       winRateWeight: insertSettings.winRateWeight ?? 0,
      topWeight: insertSettings.topWeight ?? 1.0,
      jgWeight: insertSettings.jgWeight ?? 1.1,
      midWeight: insertSettings.midWeight ?? 1.2,
      adcWeight: insertSettings.adcWeight ?? 1.0,
      supWeight: insertSettings.supWeight ?? 0.9,
      mmrTolerance: insertSettings.mmrTolerance ?? 20.0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.balanceSettings.set(id, settings);
    return settings;
  }

  async getBalanceSettings(id: string): Promise<BalanceSettings | undefined> {
    return this.balanceSettings.get(id);
  }

  async getAllBalanceSettings(): Promise<BalanceSettings[]> {
    const settings = Array.from(this.balanceSettings.values());
    return settings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getDefaultBalanceSettings(): Promise<BalanceSettings | undefined> {
    return Array.from(this.balanceSettings.values()).find(s => s.isDefault);
  }

  async updateBalanceSettings(id: string, updateData: Partial<InsertBalanceSettings>): Promise<BalanceSettings | undefined> {
    const existingSettings = this.balanceSettings.get(id);
    if (!existingSettings) return undefined;
    
    const updatedSettings: BalanceSettings = {
      ...existingSettings,
      ...updateData,
      updatedAt: new Date(),
    };
    this.balanceSettings.set(id, updatedSettings);
    return updatedSettings;
  }

  async deleteBalanceSettings(id: string): Promise<boolean> {
    const settings = this.balanceSettings.get(id);
    if (settings?.isDefault) {
      // Don't allow deleting default settings
      return false;
    }
    return this.balanceSettings.delete(id);
  }
}

/**
 * Neon 등 무료/유료 PostgreSQL DB에 데이터를 저장하는 구현체.
 * DATABASE_URL 환경변수가 설정되어 있으면 이 클래스가 자동으로 사용됩니다.
 */
export class DatabaseStorage implements IStorage {
  private db: Database;
  private ready: Promise<void>;

  constructor(db: Database) {
    this.db = db;
    this.ready = this.ensureDefaultBalanceSettings();
  }

  private async ensureDefaultBalanceSettings(): Promise<void> {
    try {
      const existing = await this.db
        .select()
        .from(balanceSettingsTable)
        .where(eq(balanceSettingsTable.isDefault, true))
        .limit(1);
      if (existing.length === 0) {
        await this.db.insert(balanceSettingsTable).values({
          name: "기본 설정",
          isDefault: true,
        });
      }
    } catch (error) {
      console.error("기본 밸런스 설정 초기화 실패:", error);
    }
  }

  // ---- Players ----
  async getPlayer(id: string): Promise<Player | undefined> {
    const [player] = await this.db.select().from(players).where(eq(players.id, id)).limit(1);
    return player;
  }

  async getPlayerBySummonerName(summonerName: string): Promise<Player | undefined> {
    const all = await this.db.select().from(players);
    return all.find((p) => p.summonerName.toLowerCase() === summonerName.toLowerCase());
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const [player] = await this.db
      .insert(players)
      .values({
        ...insertPlayer,
        discordName: insertPlayer.discordName ?? "",
        mainPosition2: insertPlayer.mainPosition2 ?? "",
        subPosition: insertPlayer.subPosition ?? null,
        subPosition2: insertPlayer.subPosition2 ?? null,
        rank: insertPlayer.rank || null,
        leaguePoints: insertPlayer.leaguePoints || 0,
        wins: insertPlayer.wins || 0,
        losses: insertPlayer.losses || 0,
        winRate: insertPlayer.winRate || 0,
        level: insertPlayer.level || 1,
        positions: insertPlayer.positions || [],
        mmr: insertPlayer.mmr || 1200,
        manualTier: insertPlayer.manualTier || null,
        manualRank: insertPlayer.manualRank || null,
        pityScore: insertPlayer.pityScore ?? 0,
      })
      .returning();
    return player;
  }

  async updatePlayer(id: string, updateData: Partial<InsertPlayer>): Promise<Player | undefined> {
    const [updated] = await this.db
      .update(players)
      .set({ ...updateData, lastUpdated: new Date().toISOString() })
      .where(eq(players.id, id))
      .returning();
    return updated;
  }

  async deletePlayer(id: string): Promise<boolean> {
    const deleted = await this.db.delete(players).where(eq(players.id, id)).returning();
    return deleted.length > 0;
  }

  async getAllPlayers(): Promise<Player[]> {
    return this.db.select().from(players);
  }

  // ---- Teams ----
  async getTeam(id: string): Promise<Team | undefined> {
    const [team] = await this.db.select().from(teams).where(eq(teams.id, id)).limit(1);
    return team;
  }

  async createTeam(insertTeam: InsertTeam): Promise<Team> {
    const [team] = await this.db
      .insert(teams)
      .values({
        ...insertTeam,
        players: insertTeam.players || [],
        averageMmr: insertTeam.averageMmr || 0,
        averageWinRate: insertTeam.averageWinRate || 0,
        teamScore: insertTeam.teamScore || 0,
      })
      .returning();
    return team;
  }

  async getAllTeams(): Promise<Team[]> {
    return this.db.select().from(teams);
  }

  // ---- Balance results ----
  async createBalanceResult(insertResult: InsertBalanceResult): Promise<BalanceResult> {
    const [result] = await this.db
      .insert(balanceResults)
      .values({
        ...insertResult,
        balanceScore: insertResult.balanceScore || 0,
        mmrDifference: insertResult.mmrDifference || 0,
        winRateDifference: insertResult.winRateDifference || 0,
        positionBalance: insertResult.positionBalance || 0,
        winner: insertResult.winner ?? null,
      })
      .returning();
    return result;
  }

  async getBalanceResult(id: string): Promise<BalanceResult | undefined> {
    const [result] = await this.db.select().from(balanceResults).where(eq(balanceResults.id, id)).limit(1);
    return result;
  }

  async getBalanceResults(limit = 10): Promise<BalanceResult[]> {
    return this.db.select().from(balanceResults).orderBy(desc(balanceResults.createdAt)).limit(limit);
  }

  async getAllBalanceResults(): Promise<BalanceResult[]> {
    return this.db.select().from(balanceResults).orderBy(desc(balanceResults.createdAt));
  }

  async updateBalanceResultWinner(id: string, winner: string | null): Promise<BalanceResult | undefined> {
    const [updated] = await this.db
      .update(balanceResults)
      .set({ winner })
      .where(eq(balanceResults.id, id))
      .returning();
    return updated;
  }

  async deleteBalanceResult(id: string): Promise<boolean> {
    const deleted = await this.db.delete(balanceResults).where(eq(balanceResults.id, id)).returning();
    return deleted.length > 0;
  }

  async clearBalanceResults(): Promise<void> {
    await this.db.delete(balanceResults);
  }

  // ---- Presets ----
  async createPreset(insertPreset: InsertPreset): Promise<Preset> {
    const [preset] = await this.db
      .insert(presets)
      .values({
        ...insertPreset,
        playerNames: insertPreset.playerNames || [],
        description: insertPreset.description || null,
      })
      .returning();
    return preset;
  }

  async getPreset(id: string): Promise<Preset | undefined> {
    const [preset] = await this.db.select().from(presets).where(eq(presets.id, id)).limit(1);
    return preset;
  }

  async getAllPresets(): Promise<Preset[]> {
    return this.db.select().from(presets).orderBy(desc(presets.createdAt));
  }

  async updatePreset(id: string, updateData: Partial<InsertPreset>): Promise<Preset | undefined> {
    const [updated] = await this.db.update(presets).set(updateData).where(eq(presets.id, id)).returning();
    return updated;
  }

  async deletePreset(id: string): Promise<boolean> {
    const deleted = await this.db.delete(presets).where(eq(presets.id, id)).returning();
    return deleted.length > 0;
  }

  // ---- Balance settings ----
  async createBalanceSettings(insertSettings: InsertBalanceSettings): Promise<BalanceSettings> {
    const [settings] = await this.db
      .insert(balanceSettingsTable)
      .values({
        ...insertSettings,
        isDefault: insertSettings.isDefault ?? false,
        mmrWeight: insertSettings.mmrWeight ?? 0.7,
        positionWeight: insertSettings.positionWeight ?? 0.3,
        winRateWeight: insertSettings.winRateWeight ?? 0,
        topWeight: insertSettings.topWeight ?? 1.0,
        jgWeight: insertSettings.jgWeight ?? 1.1,
        midWeight: insertSettings.midWeight ?? 1.2,
        adcWeight: insertSettings.adcWeight ?? 1.0,
        supWeight: insertSettings.supWeight ?? 0.9,
        mmrTolerance: insertSettings.mmrTolerance ?? 20.0,
      })
      .returning();
    return settings;
  }

  async getBalanceSettings(id: string): Promise<BalanceSettings | undefined> {
    const [settings] = await this.db
      .select()
      .from(balanceSettingsTable)
      .where(eq(balanceSettingsTable.id, id))
      .limit(1);
    return settings;
  }

  async getAllBalanceSettings(): Promise<BalanceSettings[]> {
    await this.ready;
    return this.db.select().from(balanceSettingsTable).orderBy(desc(balanceSettingsTable.createdAt));
  }

  async getDefaultBalanceSettings(): Promise<BalanceSettings | undefined> {
    await this.ready;
    const [settings] = await this.db
      .select()
      .from(balanceSettingsTable)
      .where(eq(balanceSettingsTable.isDefault, true))
      .limit(1);
    return settings;
  }

  async updateBalanceSettings(id: string, updateData: Partial<InsertBalanceSettings>): Promise<BalanceSettings | undefined> {
    const [updated] = await this.db
      .update(balanceSettingsTable)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(balanceSettingsTable.id, id))
      .returning();
    return updated;
  }

  async deleteBalanceSettings(id: string): Promise<boolean> {
    const [existing] = await this.db
      .select()
      .from(balanceSettingsTable)
      .where(eq(balanceSettingsTable.id, id))
      .limit(1);
    if (existing?.isDefault) {
      return false;
    }
    const deleted = await this.db.delete(balanceSettingsTable).where(eq(balanceSettingsTable.id, id)).returning();
    return deleted.length > 0;
  }
}

// DATABASE_URL이 설정되어 있으면 자동으로 PostgreSQL(DatabaseStorage)을 사용하고,
// 없으면 기존처럼 로컬 JSON 파일(MemStorage)에 저장합니다.
export const storage: IStorage = process.env.DATABASE_URL
  ? new DatabaseStorage(createDb())
  : new MemStorage();

if (process.env.DATABASE_URL) {
  console.log("✅ PostgreSQL 데이터베이스에 연결되어 데이터를 저장합니다.");
} else {
  console.log("💾 DATABASE_URL이 없어 로컬 JSON 파일(data 폴더)에 데이터를 저장합니다.");
}
