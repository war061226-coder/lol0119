import { type OpggPlayerData, type Position, type IDataProvider } from "@shared/schema";
import { OpggScraperService } from './opgg-scraper.js';

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
};

const RANK_MODIFIERS: Record<string, number> = {
  "IV": -100,
  "III": -50,
  "II": 0,
  "I": 50,
};

// Global API settings that can be modified at runtime
export const apiSettings = {
  riotApiKey: process.env.RIOT_API_KEY || "",
  useRiotApi: false,
};

// Adapter service that chooses between scraper and API based on settings
export class OpggApiService implements IDataProvider {
  private scraperService: OpggScraperService;
  private riotApiService: RiotApiService;

  constructor() {
    this.scraperService = new OpggScraperService();
    this.riotApiService = new RiotApiService();
    console.log('✅ OpggApiService initialized with both scraper and Riot API support');
  }

  private getDataProvider(): IDataProvider {
    if (apiSettings.useRiotApi && apiSettings.riotApiKey) {
      console.log('📡 Using Riot API for data fetching');
      return this.riotApiService;
    }
    console.log('🔄 Using OP.GG scraper for data fetching');
    return this.scraperService;
  }

  async fetchPlayerData(riotId: string, forceRefresh?: boolean): Promise<OpggPlayerData> {
    return this.getDataProvider().fetchPlayerData(riotId, forceRefresh);
  }

  async refreshOpggProfiles(riotIds: string[]): Promise<string[]> {
    return this.scraperService.refreshOpggProfiles(riotIds);
  }

  async fetchMultiplePlayersData(riotIds: string[], forceRefresh?: boolean): Promise<{ data: OpggPlayerData | null; error: string | null; riotId: string }[]> {
    return this.getDataProvider().fetchMultiplePlayersData(riotIds, forceRefresh);
  }

  // Keep MMR calculation utility for compatibility
  calculateMMR(tier: string, rank: string, leaguePoints: number): number {
    const baseMmr = TIER_MMR_MAP[tier] || 1200;
    const rankModifier = RANK_MODIFIERS[rank] || 0;
    const lpModifier = Math.floor(leaguePoints / 4); // 4 LP = 1 MMR roughly
    
    return baseMmr + rankModifier + lpModifier;
  }
}

// Rename the original class to RiotApiService
class RiotApiService implements IDataProvider {
  private baseUrl: string;
  private accountBaseUrl: string;
  private regionalMatchUrl: string;

  constructor() {
    this.baseUrl = "https://kr.api.riotgames.com/lol";
    this.accountBaseUrl = "https://asia.api.riotgames.com/riot/account/v1";
    this.regionalMatchUrl = "https://asia.api.riotgames.com/lol";
  }

  // Get API key from apiSettings (dynamic getter)
  private get apiKey(): string {
    return apiSettings.riotApiKey;
  }

  private parseRiotId(riotId: string): { gameName: string; tagLine: string } {
    const parts = riotId.split('#');
    if (parts.length !== 2) {
      throw new Error(`잘못된 라이엇 ID 형식입니다: ${riotId}. 올바른 형식: 닉네임#태그`);
    }
    return {
      gameName: parts[0].trim(),
      tagLine: parts[1].trim()
    };
  }

  private async getMockPlayerData(riotId: string): Promise<OpggPlayerData> {
    // Generate realistic mock data for testing
    const tiers = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
    const ranks = ["IV", "III", "II", "I"];
    const positions: Position[] = ["TOP", "JG", "MID", "ADC", "SUP"];
    
    // Parse the Riot ID
    const { gameName, tagLine } = this.parseRiotId(riotId);
    
    // Use game name hash for consistent data
    const hash = gameName.split('').reduce((a: number, b: string) => a + b.charCodeAt(0), 0);
    
    const tier = tiers[hash % tiers.length];
    const rank = tier === "MASTER" || tier === "GRANDMASTER" || tier === "CHALLENGER" ? null : ranks[hash % ranks.length];
    const mainPosition = positions[hash % positions.length];
    const secondaryPosition = positions[(hash + 1) % positions.length];
    
    const baseLP = 50 + (hash % 150);
    const wins = 40 + (hash % 60);
    const losses = 20 + (hash % 40);
    const level = 30 + (hash % 200);
    
    return {
      summonerName: riotId,
      level,
      tier,
      rank,
      leaguePoints: baseLP,
      wins,
      losses,
      mostPlayedPositions: [mainPosition, secondaryPosition]
    };
  }

  async fetchPlayerData(riotId: string, forceRefresh?: boolean): Promise<OpggPlayerData> {
    // Note: RiotApiService does not use caching, so forceRefresh is ignored here
    // If caching is added in the future, implement cache bypass logic when forceRefresh is true
    
    // If no API key is available, use mock data for testing
    if (!this.apiKey || this.apiKey === "your-api-key") {
      console.log(`Using mock data for ${riotId} (no API key available)`);
      return this.getMockPlayerData(riotId);
    }

    try {
      // Parse Riot ID
      const { gameName, tagLine } = this.parseRiotId(riotId);
      
      // Step 1: Get account info by Riot ID (new API)
      const accountResponse = await fetch(
        `${this.accountBaseUrl}/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}?api_key=${this.apiKey}`
      );

      if (!accountResponse.ok) {
        if (accountResponse.status === 404) {
          throw new Error(`라이엇 ID '${riotId}'를 찾을 수 없습니다.`);
        }
        if (accountResponse.status === 401 || accountResponse.status === 403) {
          console.log(`API key invalid (${accountResponse.status}), disabling Riot API`);
          apiSettings.useRiotApi = false;
          throw new Error(`Riot API 인증 실패: API 키를 확인하세요.`);
        }
        throw new Error(`계정 정보를 가져오는 중 오류가 발생했습니다. (${accountResponse.status})`);
      }

      const accountData = await accountResponse.json();
      
      // Step 2: Get summoner info by PUUID
      const summonerResponse = await fetch(
        `${this.baseUrl}/summoner/v4/summoners/by-puuid/${accountData.puuid}?api_key=${this.apiKey}`
      );

      if (!summonerResponse.ok) {
        if (summonerResponse.status === 401 || summonerResponse.status === 403) {
          console.log(`API key invalid (${summonerResponse.status}), disabling Riot API`);
          apiSettings.useRiotApi = false;
          throw new Error(`Riot API 인증 실패: API 키를 확인하세요.`);
        }
        throw new Error(`소환사 정보를 가져오는 중 오류가 발생했습니다. (${summonerResponse.status})`);
      }

      const summonerData = await summonerResponse.json();
      
      // Step 2: Get ranked info
      const rankedResponse = await fetch(
        `${this.baseUrl}/league/v4/entries/by-summoner/${summonerData.id}?api_key=${this.apiKey}`
      );

      if (!rankedResponse.ok) {
        if (rankedResponse.status === 401 || rankedResponse.status === 403) {
          console.log(`API key invalid (${rankedResponse.status}), disabling Riot API`);
          apiSettings.useRiotApi = false;
          throw new Error(`Riot API 인증 실패: API 키를 확인하세요.`);
        }
        throw new Error(`랭크 정보를 가져오는 중 오류가 발생했습니다. (${rankedResponse.status})`);
      }

      const rankedData = await rankedResponse.json();
      
      // Find Solo/Duo queue data
      const soloQueueData = rankedData.find((entry: any) => entry.queueType === "RANKED_SOLO_5x5");
      
      if (!soloQueueData) {
        throw new Error(`'${riotId}'의 솔로랭크 정보를 찾을 수 없습니다.`);
      }

      // Step 3: Get match history to determine main position
      const matchHistoryResponse = await fetch(
        `${this.regionalMatchUrl}/match/v5/matches/by-puuid/${accountData.puuid}/ids?start=0&count=20&api_key=${this.apiKey}`
      );

      let mostPlayedPositions: Position[] = ["MID"]; // Default fallback
      
      if (matchHistoryResponse.ok) {
        const matchIds = await matchHistoryResponse.json();
        const positions: Position[] = [];
        
        // Analyze recent matches for position
        for (const matchId of matchIds.slice(0, 10)) {
          try {
            const matchResponse = await fetch(
              `${this.regionalMatchUrl}/match/v5/matches/${matchId}?api_key=${this.apiKey}`
            );
            
            if (matchResponse.ok) {
              const matchData = await matchResponse.json();
              const participant = matchData.info.participants.find(
                (p: any) => p.puuid === accountData.puuid
              );
              
              if (participant && participant.teamPosition) {
                const position = this.normalizePosition(participant.teamPosition);
                if (position) positions.push(position);
              }
            }
          } catch (error) {
            console.warn(`Failed to fetch match ${matchId}:`, error);
          }
        }
        
        if (positions.length > 0) {
          mostPlayedPositions = this.getMostPlayedPositions(positions);
        }
      }

      return {
        summonerName: riotId, // Return the full Riot ID
        level: summonerData.summonerLevel,
        tier: soloQueueData.tier,
        rank: soloQueueData.rank,
        leaguePoints: soloQueueData.leaguePoints,
        wins: soloQueueData.wins,
        losses: soloQueueData.losses,
        mostPlayedPositions,
      };

    } catch (error) {
      console.error(`Error fetching data for ${riotId}:`, error);
      throw error;
    }
  }

  async fetchMultiplePlayersData(riotIds: string[], forceRefresh?: boolean): Promise<{ data: OpggPlayerData | null; error: string | null; riotId: string }[]> {
    const results = await Promise.allSettled(
      riotIds.map(riotId => this.fetchPlayerData(riotId, forceRefresh))
    );

    return results.map((result, index) => {
      const riotId = riotIds[index];
      if (result.status === "fulfilled") {
        return { data: result.value, error: null, riotId };
      } else {
        const errorMessage = result.reason instanceof Error ? result.reason.message : '알 수 없는 오류가 발생했습니다';
        console.error(`Failed to fetch player data for ${riotId}:`, result.reason);
        return { data: null, error: errorMessage, riotId };
      }
    });
  }

  calculateMMR(tier: string, rank: string, leaguePoints: number): number {
    const baseMmr = TIER_MMR_MAP[tier] || 1200;
    const rankModifier = RANK_MODIFIERS[rank] || 0;
    const lpModifier = Math.floor(leaguePoints / 4); // 4 LP = 1 MMR roughly
    
    return baseMmr + rankModifier + lpModifier;
  }

  private normalizePosition(riotPosition: string): Position | null {
    const positionMap: Record<string, Position> = {
      "TOP": "TOP",
      "JUNGLE": "JG",
      "MIDDLE": "MID",
      "BOTTOM": "ADC",
      "UTILITY": "SUP",
    };
    
    return positionMap[riotPosition] || null;
  }

  private getMostPlayedPositions(positions: Position[]): Position[] {
    const positionCounts = positions.reduce((acc, pos) => {
      acc[pos] = (acc[pos] || 0) + 1;
      return acc;
    }, {} as Record<Position, number>);

    const sorted = Object.entries(positionCounts)
      .sort(([,a], [,b]) => b - a)
      .map(([pos]) => pos as Position);

    return sorted.slice(0, 2); // Return top 2 positions
  }
}

export const opggService = new OpggApiService();
