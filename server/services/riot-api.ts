import type { Tier, Position, OpggPlayerData } from '../../shared/schema.js';

interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

interface RiotSummoner {
  id: string;
  accountId: string;
  puuid: string;
  profileIconId: number;
  revisionDate: number;
  summonerLevel: number;
}

interface RiotLeagueEntry {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

export class RiotApiService {
  private readonly API_KEY: string;
  private readonly REGION = 'asia';
  private readonly PLATFORM = 'kr';
  
  constructor() {
    this.API_KEY = process.env.RIOT_API_KEY || '';
    if (!this.API_KEY) {
      console.warn('⚠️ RIOT_API_KEY not found in environment variables');
    } else {
      console.log('✅ Riot API initialized with key');
    }
  }

  private async fetchWithRetry<T>(url: string, maxRetries = 3): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            'X-Riot-Token': this.API_KEY
          }
        });

        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
          console.log(`Rate limited, waiting ${retryAfter} seconds...`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          continue;
        }

        if (response.status === 404) {
          throw new Error('소환사를 찾을 수 없습니다');
        }

        if (!response.ok) {
          throw new Error(`Riot API error: ${response.status} ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        lastError = error as Error;
        if (attempt === maxRetries) break;
        
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    
    throw lastError || new Error('Unknown error');
  }

  async fetchPlayerData(riotId: string): Promise<OpggPlayerData> {
    console.log(`Fetching player data from Riot API for ${riotId}`);
    
    const parts = riotId.split('#');
    const gameName = parts[0];
    const tagLine = parts[1] || 'KR1';

    try {
      // Step 1: Get account info (PUUID) from Riot ID
      const accountUrl = `https://${this.REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
      console.log(`Fetching account: ${accountUrl}`);
      
      const account = await this.fetchWithRetry<RiotAccount>(accountUrl);
      console.log(`✅ Got account PUUID: ${account.puuid.substring(0, 8)}...`);

      // Step 2: Get summoner info by PUUID
      const summonerUrl = `https://${this.PLATFORM}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${account.puuid}`;
      console.log(`Fetching summoner: ${summonerUrl}`);
      
      const summoner = await this.fetchWithRetry<RiotSummoner>(summonerUrl);
      console.log(`✅ Got summoner level: ${summoner.summonerLevel}`);

      // Step 3: Get league/rank info by PUUID (NEW API endpoint)
      const leagueUrl = `https://${this.PLATFORM}.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`;
      console.log(`Fetching league: ${leagueUrl}`);
      
      const leagues = await this.fetchWithRetry<RiotLeagueEntry[]>(leagueUrl);
      console.log(`✅ Got ${leagues.length} league entries`);

      // Find solo queue rank
      const soloQueue = leagues.find(entry => entry.queueType === 'RANKED_SOLO_5x5');
      
      let tier: Tier = 'SILVER';
      let rank: string | null = 'III';
      let leaguePoints = 0;
      let wins = 0;
      let losses = 0;

      if (soloQueue) {
        tier = soloQueue.tier.toUpperCase() as Tier;
        
        // High tiers don't have divisions
        if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier)) {
          rank = null;
        } else {
          rank = soloQueue.rank;
        }
        
        leaguePoints = soloQueue.leaguePoints;
        wins = soloQueue.wins;
        losses = soloQueue.losses;
        
        console.log(`✅ Rank: ${tier} ${rank || ''}, LP: ${leaguePoints}, W/L: ${wins}/${losses}`);
      } else {
        console.log(`⚠️ No solo queue rank found for ${riotId}`);
      }

      return {
        summonerName: riotId,
        level: summoner.summonerLevel,
        tier,
        rank,
        leaguePoints,
        wins,
        losses,
        mostPlayedPositions: [] // We'll need champion mastery API for this
      };
    } catch (error) {
      console.error(`❌ Riot API error for ${riotId}:`, error);
      throw error;
    }
  }
}
