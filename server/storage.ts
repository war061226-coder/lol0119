import { type Player, type InsertPlayer, type Team, type InsertTeam, type BalanceResult, type InsertBalanceResult, type Preset, type InsertPreset, type BalanceSettings, type InsertBalanceSettings } from "@shared/schema";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

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
        this.players.set(player.id, player);
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

export const storage = new MemStorage();
