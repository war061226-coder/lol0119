import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@shared/schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

/**
 * DATABASE_URL 환경 변수가 설정되어 있을 때만 호출됩니다.
 * Neon 같은 서버리스 PostgreSQL과 HTTP 기반으로 통신하므로
 * 별도의 커넥션 풀/웹소켓 설정 없이 바로 사용할 수 있습니다.
 */
export function createDb(): Database {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL이 설정되지 않았습니다. .env 파일에 PostgreSQL 연결 문자열을 추가해주세요.",
    );
  }
  const sql = neon(process.env.DATABASE_URL);
  return drizzle(sql, { schema });
}
