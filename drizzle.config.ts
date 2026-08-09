import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL이 설정되지 않았습니다. .env 파일을 만들고 무료 PostgreSQL(예: Neon) 연결 문자열을 넣어주세요. 자세한 방법은 DATABASE_SETUP.md를 참고하세요.",
  );
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
