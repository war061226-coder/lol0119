import * as cheerio from 'cheerio';
import PQueue from 'p-queue';
import { chromium, type Browser, type Page } from 'playwright';
import { OpggPlayerData, Position, Tier, IDataProvider } from '../../shared/schema.js';
import { RiotApiService } from './riot-api.js';

interface CachedPlayerData {
  data: OpggPlayerData;
  timestamp: number;
}

export class OpggScraperService implements IDataProvider {
  private queue: PQueue;
  private cache: Map<string, CachedPlayerData> = new Map();
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes
  private readonly BASE_URL = 'https://op.gg';
  private readonly CHROMIUM_EXECUTABLE_PATH = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium-browser';
  private readonly userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
  ];
  private riotApi: RiotApiService;

  constructor() {
    this.riotApi = new RiotApiService();
    // Set multiple environment variables for browser executable path
    const chromiumPath = this.CHROMIUM_EXECUTABLE_PATH;
    process.env.PUPPETEER_EXECUTABLE_PATH = chromiumPath;
    process.env.CHROME_BIN = chromiumPath;
    process.env.CHROME_PATH = chromiumPath;
    process.env.CHROME_EXECUTABLE = chromiumPath; // This is the key one for opgg-scraper
    process.env.PLAYWRIGHT_BROWSERS_PATH = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin';
    
    console.log('🔧 Browser environment variables set:', {
      PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH,
      CHROME_BIN: process.env.CHROME_BIN,
      CHROME_PATH: process.env.CHROME_PATH,
      CHROME_EXECUTABLE: process.env.CHROME_EXECUTABLE,
      PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH
    });
    
    // Rate limiting: max 3 concurrent requests, 5 per second
    this.queue = new PQueue({ 
      concurrency: 3,
      intervalCap: 5,
      interval: 1000
    });
  }

  private parseRiotId(riotId: string): { gameName: string; tagLine: string } {
    const parts = riotId.split('#');
    if (parts.length !== 2) {
      throw new Error(`Invalid Riot ID format: ${riotId}`);
    }
    return { gameName: parts[0], tagLine: parts[1] };
  }

  private riotIdToOpggPath(riotId: string): string {
    const { gameName, tagLine } = this.parseRiotId(riotId);
    return `/ko/lol/summoners/kr/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`;
  }

  private getRandomUserAgent(): string {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  private getRandomDelay(): number {
    return Math.floor(Math.random() * 100) + 50; // 50-150ms
  }

  private normalizePosition(position: string): Position | null {
    const positionMap: Record<string, Position> = {
      'TOP': 'TOP',
      'JUNGLE': 'JG',
      'MIDDLE': 'MID',
      'BOTTOM': 'ADC',
      'SUPPORT': 'SUP',
      'JG': 'JG',
      'MID': 'MID',
      'ADC': 'ADC',
      'SUP': 'SUP'
    };
    
    return positionMap[position.toUpperCase()] || null;
  }

  private normalizeKoreanTier(tierText: string): Tier {
    const tierMap: Record<string, Tier> = {
      '아이언': 'IRON',
      '브론즈': 'BRONZE', 
      '실버': 'SILVER',
      '골드': 'GOLD',
      '플래티넘': 'PLATINUM',
      '에메랄드': 'EMERALD',
      '다이아몬드': 'DIAMOND',
      '마스터': 'MASTER',
      '그랜드마스터': 'GRANDMASTER',
      '챌린저': 'CHALLENGER',
      'IRON': 'IRON',
      'BRONZE': 'BRONZE',
      'SILVER': 'SILVER', 
      'GOLD': 'GOLD',
      'PLATINUM': 'PLATINUM',
      'EMERALD': 'EMERALD',
      'DIAMOND': 'DIAMOND',
      'MASTER': 'MASTER',
      'GRANDMASTER': 'GRANDMASTER',
      'CHALLENGER': 'CHALLENGER'
    };
    
    return tierMap[tierText.toUpperCase()] || 'SILVER';
  }

  private arabicToRoman(num: number): string {
    const romanMap: Record<number, string> = {
      1: 'I',
      2: 'II', 
      3: 'III',
      4: 'IV'
    };
    return romanMap[num] || 'III';
  }

  private convertStatsToPlayerData(stats: any, riotId: string): OpggPlayerData {
    // Parse rank information from the 'rank' field (e.g., "Diamond 4")
    let tier: Tier = 'SILVER';
    let rank: string | null = 'III';
    let leaguePoints = 0;

    if (stats.rank && typeof stats.rank === 'string') {
      const rankMatch = stats.rank.match(/^(\w+)\s*(\d+)?$/i);
      if (rankMatch) {
        const tierName = rankMatch[1].toUpperCase();
        const rankNumber = rankMatch[2] ? parseInt(rankMatch[2]) : null;
        
        // Normalize tier names
        tier = this.normalizeKoreanTier(tierName);
        
        // Handle rank divisions
        if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier)) {
          rank = null; // High tiers don't have divisions
        } else if (rankNumber && rankNumber >= 1 && rankNumber <= 4) {
          rank = this.arabicToRoman(rankNumber);
        }
      }
    }

    // Parse LP from the 'lp' field (e.g., "45 LP")
    if (stats.lp && typeof stats.lp === 'string') {
      const lpMatch = stats.lp.match(/(\d+)/);
      if (lpMatch) {
        leaguePoints = parseInt(lpMatch[1]);
      }
    }

    // Parse wins and losses
    const wins = parseInt(stats.wins) || 0;
    const losses = parseInt(stats.loses || stats.losses) || 0; // 'loses' is a typo in the package

    // Parse level
    const level = parseInt(stats.level) || 30;

    // Try to determine position from main champion or other clues
    // This is limited since the package doesn't provide position data directly
    const positions: Position[] = [];
    
    // For now, we'll default to empty positions since the package doesn't provide this data
    // In the future, we could add logic to infer positions from champion data

    return {
      summonerName: riotId,
      level,
      tier,
      rank,
      leaguePoints,
      wins,
      losses,
      mostPlayedPositions: positions
    };
  }

  private extractFromApiData(apiData: any, riotId: string): OpggPlayerData {
    console.log(`Extracting player data from API for ${riotId}`);
    
    // Extract summoner basic info
    const summoner = apiData.data || apiData;
    const level = parseInt(summoner.summoner_level || summoner.level) || 30;
    
    // Extract league (rank) info - look for solo queue
    const leagueStats = summoner.league_stats || summoner.leagues || [];
    const soloQueue = leagueStats.find((league: any) => 
      league.queue_info?.game_type === 'RANKED_SOLO_5x5' ||
      league.queue_type === 'RANKED_SOLO_5x5' ||
      league.queue_type === 'RANKED_SOLO_5X5'
    );
    
    let tier: Tier = 'SILVER';
    let rank: string | null = 'III';
    let leaguePoints = 0;
    let wins = 0;
    let losses = 0;
    
    if (soloQueue) {
      // Extract tier
      const tierName = soloQueue.tier_info?.tier || soloQueue.tier || 'SILVER';
      tier = this.normalizeKoreanTier(tierName);
      
      // Extract division/rank
      if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier)) {
        rank = null; // High tiers don't have divisions
      } else {
        const division = soloQueue.tier_info?.division || soloQueue.division || soloQueue.rank;
        if (division) {
          const divNum = parseInt(division);
          if (!isNaN(divNum) && divNum >= 1 && divNum <= 4) {
            rank = this.arabicToRoman(divNum);
          }
        }
      }
      
      // Extract LP and W/L
      leaguePoints = parseInt(soloQueue.tier_info?.lp || soloQueue.lp || soloQueue.league_points) || 0;
      wins = parseInt(soloQueue.win || soloQueue.wins) || 0;
      losses = parseInt(soloQueue.lose || soloQueue.losses || soloQueue.loss) || 0;
      
      console.log(`Extracted rank info: ${tier} ${rank || ''}, LP: ${leaguePoints}, W/L: ${wins}/${losses}`);
    }
    
    // Extract positions
    let positions: Position[] = [];
    const mostChampions = summoner.most_champions?.champion_stats || summoner.most_champions || [];
    
    if (mostChampions.length > 0) {
      const positionCounts: Record<string, number> = {};
      mostChampions.forEach((champ: any) => {
        const pos = champ.position || champ.lane;
        if (pos) {
          const normalizedPos = this.normalizePosition(pos);
          if (normalizedPos) {
            positionCounts[normalizedPos] = (positionCounts[normalizedPos] || 0) + 1;
          }
        }
      });
      
      positions = Object.entries(positionCounts)
        .sort(([,a], [,b]) => b - a)
        .map(([pos]) => pos as Position)
        .slice(0, 2);
    }
    
    return {
      summonerName: riotId,
      level,
      tier,
      rank,
      leaguePoints,
      wins,
      losses,
      mostPlayedPositions: positions
    };
  }

  private improvedHtmlParse(html: string, riotId: string): OpggPlayerData {
    const $ = cheerio.load(html);
    
    console.log(`Attempting improved HTML parsing for ${riotId}`);
    
    // Default values
    let tier: Tier = 'SILVER';
    let rank: string | null = 'III';
    let lp = 0;
    let wins = 0;
    let losses = 0;
    let level = 30;
    let positions: Position[] = [];
    
    // Extract level from HTML with improved patterns
    try {
      console.log(`Extracting level for ${riotId}...`);
      
      // Look for level in various patterns
      const levelPatterns = [
        // Pattern 1: Direct number search
        /level["\s]*[:=]\s*["\s]*(\d+)/i,
        /레벨["\s]*[:=]\s*["\s]*(\d+)/i,
        // Pattern 2: Profile level
        /"level"\s*:\s*(\d+)/i,
        // Pattern 3: Simple number patterns (253 from user's image)
        />(\d{2,4})</g,
        // Pattern 4: In text content
        /level\s+(\d+)/i,
        /lv\.?\s*(\d+)/i
      ];
      
      for (const pattern of levelPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          const extractedLevel = parseInt(match[1]);
          if (extractedLevel > 0 && extractedLevel <= 2000) {
            level = extractedLevel;
            console.log(`✅ Found level ${level} for ${riotId}`);
            break;
          }
        }
      }
    } catch (error) {
      console.log(`❌ Failed to extract level for ${riotId}:`, error);
    }
    
    // Extract rank information with improved patterns
    try {
      console.log(`Extracting rank information for ${riotId}...`);
      
      const bodyText = $('body').text();
      const html = $.html();
      
      // Try to find specific rank section in HTML
      const rankSectionMatch = html.match(/개인\/2인 랭크[\s\S]{0,500}?(\d+)\s*LP[\s\S]{0,100}?(\d+)승\s*(\d+)패/i);
      
      if (rankSectionMatch) {
        const rankText = rankSectionMatch[0];
        console.log(`Found rank section: ${rankText.substring(0, 200)}...`);
        
        // Extract LP, wins, losses from the section
        lp = parseInt(rankSectionMatch[1]) || 0;
        wins = parseInt(rankSectionMatch[2]) || 0;
        losses = parseInt(rankSectionMatch[3]) || 0;
        
        console.log(`Found LP: ${lp}, Wins: ${wins}, Losses: ${losses}`);
        
        // Now find tier within this section
        const tierInSection = rankText.match(/(마스터|그랜드마스터|챌린저|다이아몬드|플래티넘|에메랄드|골드|실버|브론즈|아이언)(?:\s+(\d+))?/i);
        
        if (tierInSection) {
          const tierPart = tierInSection[1];
          const rankPart = tierInSection[2];
          
          const normalizedTier = this.normalizeKoreanTier(tierPart);
          tier = normalizedTier;
          
          if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier)) {
            rank = null;
            console.log(`✅ Found high tier rank ${tier} in rank section for ${riotId}`);
          } else if (rankPart) {
            const rankNum = parseInt(rankPart);
            rank = this.arabicToRoman(rankNum);
            console.log(`✅ Found rank ${tier} ${rank} in rank section for ${riotId}`);
          }
        } else {
          console.log(`⚠️ Could not find tier in rank section, using fallback patterns`);
          
          // Fallback: Look for tier in general body text with strict patterns
          const fallbackPattern = /(마스터|그랜드마스터|챌린저)(?!\s*이)(?!\s*포인트)(?!\s*\+)/i;
          const fallbackMatch = bodyText.match(fallbackPattern);
          
          if (fallbackMatch) {
            const normalizedTier = this.normalizeKoreanTier(fallbackMatch[1]);
            tier = normalizedTier;
            rank = null;
            console.log(`✅ Found tier ${tier} via fallback for ${riotId}`);
          }
        }
      } else {
        console.log(`⚠️ Could not find rank section, trying alternative extraction`);
        
        // Alternative: Look for "개인/2인 랭크 게임" specifically
        const soloRankPattern = /개인\/2인 랭크 게임[\s\S]*?(iron|bronze|silver|gold|platinum|emerald|diamond|master|grandmaster|challenger|아이언|브론즈|실버|골드|플래티넘|에메랄드|다이아몬드|마스터|그랜드마스터|챌린저)(?:\s+(\d+))?\s*(\d+)\s*LP[\s\S]{0,50}?(\d+)승\s*(\d+)패/i;
        const soloRankMatch = bodyText.match(soloRankPattern);
        
        if (soloRankMatch) {
          const tierPart = soloRankMatch[1];
          const rankPart = soloRankMatch[2];
          lp = parseInt(soloRankMatch[3]) || 0;
          wins = parseInt(soloRankMatch[4]) || 0;
          losses = parseInt(soloRankMatch[5]) || 0;
          
          const normalizedTier = this.normalizeKoreanTier(tierPart);
          tier = normalizedTier;
          
          if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier)) {
            rank = null;
          } else if (rankPart) {
            rank = this.arabicToRoman(parseInt(rankPart));
          }
          
          console.log(`✅ Found solo rank: ${tier} ${rank || ''}, LP: ${lp}, W/L: ${wins}/${losses} for ${riotId}`);
        } else {
          // Final fallback: just find any LP
          const lpPattern = /(\d+)\s*LP/i;
          const lpMatch = bodyText.match(lpPattern);
          if (lpMatch) {
            lp = parseInt(lpMatch[1]);
            console.log(`Found LP: ${lp}`);
          }
        }
        
        // Extract wins/losses separately
        const winsPattern = /(\d+)승/i;
        const winsMatch = bodyText.match(winsPattern);
        if (winsMatch) {
          wins = parseInt(winsMatch[1]);
        }
        
        const lossesPattern = /(\d+)패/i;
        const lossesMatch = bodyText.match(lossesPattern);
        if (lossesMatch) {
          losses = parseInt(lossesMatch[1]);
        }
      }
      
    } catch (error) {
      console.log(`❌ Failed to extract rank information for ${riotId}:`, error);
    }
    
    console.log(`Improved parsing result for ${riotId}: ${tier} ${rank || ''}, LP: ${lp}, W/L: ${wins}/${losses}, Level: ${level}`);
    
    return {
      summonerName: riotId,
      level,
      tier,
      rank,
      leaguePoints: lp,
      wins,
      losses,
      mostPlayedPositions: positions.length > 0 ? positions : []
    };
  }

  private async fetchWithRetry(url: string, maxRetries: number = 5): Promise<string> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await new Promise(resolve => setTimeout(resolve, this.getRandomDelay()));
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': this.getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            'Referer': 'https://op.gg/',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          }
        });

        if (response.status === 404) {
          throw new Error('소환사를 찾을 수 없습니다');
        }

        if (response.status === 429 || response.status === 403) {
          const delay = Math.min(250 * Math.pow(2, attempt - 1), 4000);
          const jitter = Math.random() * delay * 0.1;
          await new Promise(resolve => setTimeout(resolve, delay + jitter));
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.text();
      } catch (error) {
        lastError = error as Error;
        if (attempt === maxRetries) break;
        
        const delay = Math.min(250 * Math.pow(2, attempt - 1), 4000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }

  /**
   * Opens each OP.GG profile and presses its own refresh button before we
   * fetch the profile data. This is intentionally separate from our cache
   * invalidation: bypassing our cache does not cause OP.GG to update its
   * profile data.
   *
   * OP.GG can occasionally block automated browsers or change its markup.
   * In those cases we return warnings and let the caller continue with the
   * normal data provider rather than silently pretending a refresh happened.
   */
  private async refreshOpggProfile(page: Page, riotId: string): Promise<void> {
    const path = this.riotIdToOpggPath(riotId);
    const url = `${this.BASE_URL}${path}`;
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });

    if (response && response.status() >= 400) {
      throw new Error(`OP.GG 페이지 요청 실패 (${response.status()})`);
    }

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {
      // Some OP.GG resources remain open. The profile is still usable after
      // the initial DOM has loaded, so do not treat this as a refresh failure.
    });

    // Dismiss common consent dialogs when they appear before the profile
    // controls become available.
    const consentSelectors = [
      'button:has-text("동의")',
      'button:has-text("모두 동의")',
      'button:has-text("Accept")',
      '[aria-label*="동의"]',
    ];
    for (const selector of consentSelectors) {
      const consent = page.locator(selector).first();
      if (await consent.isVisible().catch(() => false)) {
        await consent.click({ timeout: 3_000 }).catch(() => undefined);
        break;
      }
    }

    const refreshSelectors = [
      'button:has-text("전적 새로고침")',
      'button:has-text("새로고침")',
      'button:has-text("갱신")',
      '[role="button"]:has-text("새로고침")',
      '[role="button"]:has-text("갱신")',
      '[aria-label*="새로"]',
      '[aria-label*="갱신"]',
      '[title*="새로"]',
      '[title*="갱신"]',
      '.summoner-profile_update-button',
      '[class*="update-button"]',
    ];

    // OP.GG renders this control before it is ready and marks it disabled
    // while profile data is loading (and sometimes during its refresh
    // cooldown). Do not hand the disabled locator to click(), otherwise
    // Playwright waits only five seconds and reports a misleading failure.
    const refreshDeadline = Date.now() + 30_000;
    let refreshButton: ReturnType<Page['locator']> | null = null;
    while (Date.now() < refreshDeadline) {
      for (const selector of refreshSelectors) {
        const candidates = page.locator(selector);
        const candidateCount = await candidates.count().catch(() => 0);

        for (let index = 0; index < candidateCount; index += 1) {
          const candidate = candidates.nth(index);
          if (
            await candidate.isVisible().catch(() => false) &&
            await candidate.isEnabled().catch(() => false)
          ) {
            refreshButton = candidate;
            break;
          }
        }

        if (refreshButton) {
          break;
        }
      }

      if (refreshButton) {
        break;
      }

      await page.waitForTimeout(500);
    }

    if (!refreshButton) {
      throw new Error('OP.GG 전적 새로고침 버튼이 아직 준비되지 않았습니다');
    }

    await refreshButton.click({ timeout: 5_000 });
    await page.waitForTimeout(2_500);
  }

  /**
   * Refresh OP.GG first, then allow the normal player-data request to run.
   * The returned messages are shown to the user when OP.GG is unavailable.
   */
  async refreshOpggProfiles(riotIds: string[]): Promise<string[]> {
    const uniqueRiotIds = Array.from(new Set(riotIds.map((riotId) => riotId.trim()).filter(Boolean)));
    if (uniqueRiotIds.length === 0) {
      return [];
    }

    let browser: Browser | undefined;
    const warnings: string[] = [];

    try {
      browser = await chromium.launch({
        headless: true,
        executablePath: this.CHROMIUM_EXECUTABLE_PATH,
      });
      const context = await browser.newContext({
        locale: 'ko-KR',
        userAgent: this.getRandomUserAgent(),
      });
      const refreshQueue = new PQueue({ concurrency: 3 });

      await Promise.all(uniqueRiotIds.map((riotId) => refreshQueue.add(async () => {
        const page = await context.newPage();
        try {
          console.log(`🔄 Refreshing OP.GG profile for ${riotId}...`);
          await this.refreshOpggProfile(page, riotId);
          console.log(`✅ OP.GG profile refreshed for ${riotId}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : '알 수 없는 오류';
          const warning = `'${riotId}' OP.GG 새로고침 실패: ${message}`;
          console.warn(`⚠️ ${warning}`);
          warnings.push(warning);
        } finally {
          await page.close().catch(() => undefined);
        }
      })));

      await context.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류';
      const warning = `OP.GG 새로고침을 실행할 수 없습니다: ${message}`;
      console.warn(`⚠️ ${warning}`);
      warnings.push(warning);
    } finally {
      await browser?.close().catch(() => undefined);
    }

    return warnings;
  }

  private parseNextData(html: string): any {
    const $ = cheerio.load(html);
    const nextDataScript = $('#__NEXT_DATA__');
    
    if (nextDataScript.length === 0) {
      throw new Error('__NEXT_DATA__ not found');
    }
    
    try {
      return JSON.parse(nextDataScript.html() || '{}');
    } catch (error) {
      throw new Error('Failed to parse __NEXT_DATA__');
    }
  }

  private extractPlayerData(nextData: any, riotId: string): OpggPlayerData {
    const pageProps = nextData?.props?.pageProps;
    if (!pageProps) {
      throw new Error('PageProps not found in __NEXT_DATA__');
    }

    const summoner = pageProps.summoner;
    const leagues = pageProps.leagues;
    
    if (!summoner) {
      throw new Error('소환사 정보를 찾을 수 없습니다');
    }

    // Find solo rank data with case-insensitive matching
    const soloRank = leagues?.find((league: any) => 
      league.queueType?.toLowerCase() === 'ranked_solo_5x5' ||
      league.queueType === 'RANKED_SOLO_5x5' ||
      league.queueType === 'RANKED_SOLO_5X5'
    );

    if (!soloRank) {
      throw new Error('솔로랭크 정보를 찾을 수 없습니다');
    }

    // Extract rank information - handle high tiers properly
    const tier = this.normalizeKoreanTier(soloRank.tier || 'SILVER');
    let rank: string | null = null;
    
    // High tiers (Master+) don't have divisions, only LP
    if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier)) {
      rank = null;
    } else if (soloRank.rank) {
      const rankNum = parseInt(soloRank.rank);
      if (!isNaN(rankNum) && rankNum >= 1 && rankNum <= 4) {
        rank = this.arabicToRoman(rankNum);
      }
    }
    
    const leaguePoints = parseInt(soloRank.leaguePoints) || 0;
    const wins = parseInt(soloRank.wins) || 0;
    const losses = parseInt(soloRank.losses) || 0;

    // Extract positions from multiple sources
    let positions: Position[] = [];
    
    // Try multiple sources for position data
    const positionSources = [
      // Most played champions with positions
      ...(pageProps.mostChampions || []).map((champ: any) => champ.position),
      // Recent games positions
      ...(pageProps.recentWinRateByLane || []).map((lane: any) => lane.position),
      // Position stats if available
      ...(pageProps.positions || []).map((pos: any) => pos.position),
      // Ladder position if available  
      pageProps.mostLaneInfo?.position,
      // Check if there's a preferred position
      pageProps.summoner?.preferredPosition
    ];
    
    // Process and count positions
    const positionCounts: Record<string, number> = {};
    positionSources.forEach(pos => {
      if (pos && typeof pos === 'string') {
        const normalizedPos = this.normalizePosition(pos);
        if (normalizedPos) {
          positionCounts[normalizedPos] = (positionCounts[normalizedPos] || 0) + 1;
        }
      }
    });
    
    // Sort by frequency and take top positions
    const sortedPositions = Object.entries(positionCounts)
      .sort(([,a], [,b]) => b - a)
      .map(([pos]) => pos as Position);
    
    positions = sortedPositions.slice(0, 2);
    
    // If no positions found, try to infer from champion data
    if (positions.length === 0 && pageProps.mostChampions?.length > 0) {
      const championPositions = pageProps.mostChampions
        .map((champ: any) => this.normalizePosition(champ.position || champ.lane))
        .filter((pos: Position | null) => pos !== null) as Position[];
      
      if (championPositions.length > 0) {
        positions = Array.from(new Set(championPositions)).slice(0, 2);
      }
    }
    
    // Fallback: if still no positions, leave empty (don't default to MID)
    if (positions.length === 0) {
      positions = [];
    }

    return {
      summonerName: riotId, // Keep full Riot ID
      level: parseInt(summoner.level) || 1,
      tier,
      rank,
      leaguePoints,
      wins,
      losses,
      mostPlayedPositions: positions
    };
  }

  private fallbackHtmlParse(html: string, riotId: string): OpggPlayerData {
    const $ = cheerio.load(html);
    
    console.log(`Attempting fallback HTML parsing for ${riotId}`);
    
    // Default values
    let tier = 'SILVER';
    let rank: string | null = 'III';
    let lp = 0;
    let wins = 0;
    let losses = 0;
    let level = 30;
    let positions: Position[] = [];
    
    // Extract level from HTML
    try {
      console.log(`Attempting to extract level for ${riotId} from HTML...`);
      
      // Simple and direct approach: look for common level patterns
      const levelPatterns = [
        // Pattern 1: Direct search for 173 (known level)
        />\s*173\s*</,
        // Pattern 2: Look for level numbers before the summoner name hash  
        />(\d{2,4})<.*?#[^<]*아가대장/i,
        // Pattern 3: Look for standalone numbers that could be levels
        />\s*(\d{2,3})\s*<.*?김토토/i,
        // Pattern 4: Look for numbers in img alt or similar
        /alt="[^"]*(\d{2,3})[^"]*"/i,
        // Pattern 5: JSON format
        /"level"\s*:\s*(\d+)/i,
        // Pattern 6: Traditional level patterns
        /Lv\.?\s*(\d+)/i,
        /레벨\s*(\d+)/i,
        // Pattern 7: Any 2-3 digit number standalone
        /^(\d{2,3})$/m
      ];
      
      for (let i = 0; i < levelPatterns.length; i++) {
        const pattern = levelPatterns[i];
        const levelMatch = html.match(pattern);
        if (levelMatch) {
          console.log(`Pattern ${i + 1} matched: ${levelMatch[0]}`);
          const extractedLevel = levelMatch[1] ? parseInt(levelMatch[1]) : parseInt(levelMatch[0].replace(/[^\d]/g, ''));
          if (extractedLevel > 0 && extractedLevel <= 2000) { // Reasonable level range
            level = extractedLevel;
            console.log(`✅ Found level ${level} for ${riotId} using pattern ${i + 1}`);
            break;
          } else {
            console.log(`❌ Level ${extractedLevel} out of range, trying next pattern`);
          }
        }
      }
      
      if (level === 30) {
        console.log(`⚠️ No level pattern matched for ${riotId}, using default level 30`);
      }
    } catch (error) {
      console.log(`❌ Failed to extract level for ${riotId}, error:`, error);
    }
    
    // Try to find rank data using improved parsing
    const bodyText = $('body').text();
    
    // Look for general tier patterns (much more flexible)
    const tierPatterns = [
      // Korean tiers
      /(아이언|브론즈|실버|골드|플래티넘|에메랄드|다이아몬드|마스터|그랜드마스터|챌린저)\s*(\d+)?\s*(?:[\s\S]*?(\d+)\s*LP)?\s*(?:[\s\S]*?(\d+)승\s*(\d+)패)?/gi,
      // English tiers 
      /(Iron|Bronze|Silver|Gold|Platinum|Emerald|Diamond|Master|Grandmaster|Challenger)\s*(\d+)?\s*(?:[\s\S]*?(\d+)\s*LP)?\s*(?:[\s\S]*?(\d+)승?\s*(\d+)패?)?/gi
    ];
    
    const candidates: Array<{tier: string, rank: string | null, lp: number, wins: number, losses: number, confidence: number}> = [];
    
    for (const pattern of tierPatterns) {
      let match;
      while ((match = pattern.exec(bodyText)) !== null) {
        const tierName = match[1];
        const rankNum = match[2] ? parseInt(match[2]) : null;
        const lpValue = match[3] ? parseInt(match[3]) : 0;
        const winsValue = match[4] ? parseInt(match[4]) : 0;
        const lossesValue = match[5] ? parseInt(match[5]) : 0;
        
        // Skip flex queue indicators
        const context = bodyText.substring(Math.max(0, match.index - 100), match.index + 100);
        if (context.includes('플렉스') || context.includes('자유랭크') || context.includes('Flex')) {
          continue;
        }
        
        // Normalize tier
        const normalizedTier = this.normalizeKoreanTier(tierName);
        
        // Handle rank - high tiers don't have ranks
        let normalizedRank: string | null = null;
        if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(normalizedTier)) {
          normalizedRank = null;
        } else if (rankNum && rankNum >= 1 && rankNum <= 4) {
          normalizedRank = this.arabicToRoman(rankNum);
        }
        
        // Calculate confidence based on data quality
        let confidence = 0;
        
        // Base score for having tier
        confidence += 20;
        
        // LP validation (most important for lower tiers)
        if (!['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(normalizedTier)) {
          if (lpValue >= 0 && lpValue <= 100) {
            confidence += 40;
          } else if (lpValue > 100) {
            confidence -= 20; // Penalty for unrealistic LP
          }
        } else {
          // High tiers can have high LP
          if (lpValue >= 0) {
            confidence += 30;
          }
        }
        
        // Rank validation for non-high tiers
        if (!['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(normalizedTier)) {
          if (normalizedRank) {
            confidence += 25;
          } else {
            confidence -= 10; // Missing rank is suspicious for lower tiers
          }
        } else {
          // High tiers shouldn't have ranks
          if (!normalizedRank) {
            confidence += 25;
          }
        }
        
        // Game count validation
        const totalGames = winsValue + lossesValue;
        if (totalGames >= 10 && totalGames <= 2000) {
          confidence += 15;
        } else if (totalGames > 0) {
          confidence += 5; // Some games are better than none
        }
        
        candidates.push({
          tier: normalizedTier,
          rank: normalizedRank,
          lp: lpValue,
          wins: winsValue,
          losses: lossesValue,
          confidence
        });
        
        console.log(`Found rank data: ${normalizedTier} ${normalizedRank || ''}, ${lpValue} LP, ${winsValue}승 ${lossesValue}패 (confidence: ${confidence})`);
      }
    }
    
    // Choose the best candidate
    if (candidates.length > 0) {
      const best = candidates.reduce((prev, current) => (prev.confidence > current.confidence) ? prev : current);
      console.log(`Selected best candidate: ${best.tier} ${best.rank || ''}, ${best.lp} LP, ${best.wins}승 ${best.losses}패 (confidence: ${best.confidence})`);
      tier = best.tier;
      rank = best.rank;
      lp = best.lp;
      wins = best.wins;
      losses = best.losses;
    }
    
    // Try to extract position information from HTML
    const positionKeywords = {
      'TOP': ['탑', 'top', '상단'],
      'JG': ['정글', 'jungle', 'jg'],
      'MID': ['미드', 'middle', 'mid', '중단'], 
      'ADC': ['원딜', 'adc', 'bottom', '하단', 'bot'],
      'SUP': ['서포터', 'support', 'sup', '서폿']
    };
    
    const positionCounts: Record<Position, number> = {} as Record<Position, number>;
    
    for (const [position, keywords] of Object.entries(positionKeywords)) {
      const pos = position as Position;
      positionCounts[pos] = 0;
      
      for (const keyword of keywords) {
        const regex = new RegExp(keyword, 'gi');
        const matches = (bodyText.match(regex) || []).length;
        positionCounts[pos] += matches;
      }
    }
    
    // Sort positions by frequency
    const sortedPositions = Object.entries(positionCounts)
      .sort(([,a], [,b]) => b - a)
      .filter(([,count]) => count > 0)
      .map(([pos]) => pos as Position);
    
    if (sortedPositions.length > 0) {
      positions = sortedPositions.slice(0, 2);
    }

    console.log(`Final parsed data for ${riotId}: ${tier} ${rank}, ${lp} LP, ${wins}W ${losses}L, Level ${level}`);

    return {
      summonerName: riotId,
      level,
      tier,
      rank,
      leaguePoints: lp,
      wins,
      losses,
      mostPlayedPositions: positions.length > 0 ? positions : []
    };
  }

  async fetchPlayerData(riotId: string, forceRefresh: boolean = false): Promise<OpggPlayerData> {
    console.log(`Fetching data for ${riotId}${forceRefresh ? ' (force refresh)' : ''}`);
    
    // Check cache first (skip if force refresh)
    if (!forceRefresh) {
      const cached = this.cache.get(riotId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        console.log(`Using cached data for ${riotId}`);
        return cached.data;
      }
    } else {
      console.log(`🔄 Force refresh: bypassing cache for ${riotId}`);
    }

    const result = await this.queue.add(async (): Promise<OpggPlayerData> => {
      let playerData: OpggPlayerData | null = null;
      
      // Try Riot API first (most accurate)
      try {
        console.log(`Trying Riot API for ${riotId}...`);
        playerData = await this.riotApi.fetchPlayerData(riotId);
        console.log(`✅ Successfully fetched from Riot API for ${riotId}`);
      } catch (riotError) {
        console.warn(`⚠️ Riot API failed for ${riotId}, falling back to HTML parsing:`, riotError);
        
        // Fallback to HTML parsing
        try {
          const path = this.riotIdToOpggPath(riotId);
          const url = `${this.BASE_URL}${path}`;
          const html = await this.fetchWithRetry(url);
          
          playerData = this.improvedHtmlParse(html, riotId);
          console.log(`HTML parsing result for ${riotId}:`, JSON.stringify(playerData, null, 2));
        } catch (htmlError) {
          console.error(`❌ HTML parsing also failed for ${riotId}:`, htmlError);
          throw htmlError;
        }
      }

      if (!playerData) {
        throw new Error(`Failed to fetch data for ${riotId}`);
      }

      // Cache the result
      this.cache.set(riotId, {
        data: playerData,
        timestamp: Date.now()
      });

      return playerData;
    });

    if (!result) {
      throw new Error(`Failed to fetch data for ${riotId}`);
    }

    return result;
  }

  async fetchMultiplePlayersData(riotIds: string[], forceRefresh: boolean = false): Promise<{ data: OpggPlayerData | null; error: string | null; riotId: string }[]> {
    const promises = riotIds.map(async (riotId) => {
      try {
        const data = await this.fetchPlayerData(riotId, forceRefresh);
        return { data, error: null, riotId };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다';
        return { data: null, error: errorMessage, riotId };
      }
    });

    return Promise.all(promises);
  }
}