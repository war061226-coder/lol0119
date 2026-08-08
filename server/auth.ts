import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { NextFunction, Request, Response } from "express";
import { getDataDir } from "./storage";

declare module "express-session" {
  interface SessionData {
    role?: "admin";
    username?: string;
  }
}

interface AdminConfig {
  username: string;
  passwordHash: string; // format: "<salt-hex>:<hash-hex>"
  updatedAt: string;
}

const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "admin1234";

const adminConfigFile = join(getDataDir(), "admin-config.json");

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const hashBuffer = Buffer.from(hash, "hex");
    const suppliedBuffer = scryptSync(password, salt, 64);
    if (hashBuffer.length !== suppliedBuffer.length) return false;
    return timingSafeEqual(hashBuffer, suppliedBuffer);
  } catch {
    return false;
  }
}

function persistAdminConfig(config: AdminConfig) {
  const dir = getDataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(adminConfigFile, JSON.stringify(config, null, 2), "utf-8");
}

function loadAdminConfig(): AdminConfig {
  try {
    if (existsSync(adminConfigFile)) {
      const raw = readFileSync(adminConfigFile, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.username === "string" && typeof parsed.passwordHash === "string") {
        return parsed as AdminConfig;
      }
    }
  } catch (error) {
    console.error("관리자 계정 정보를 불러오지 못했습니다. 기본 계정을 다시 생성합니다.", error);
  }

  const defaultConfig: AdminConfig = {
    username: DEFAULT_ADMIN_USERNAME,
    passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
    updatedAt: new Date().toISOString(),
  };
  persistAdminConfig(defaultConfig);
  console.log(
    `🔑 기본 관리자 계정이 생성되었습니다. (아이디: ${DEFAULT_ADMIN_USERNAME} / 비밀번호: ${DEFAULT_ADMIN_PASSWORD})\n` +
    `   보안을 위해 로그인 후 반드시 비밀번호를 변경해주세요.`
  );
  return defaultConfig;
}

let adminConfig: AdminConfig = loadAdminConfig();

export function verifyAdminCredentials(username: string, password: string): boolean {
  if (username !== adminConfig.username) return false;
  return verifyPassword(password, adminConfig.passwordHash);
}

export function getAdminUsername(): string {
  return adminConfig.username;
}

export function changeAdminCredentials(
  currentPassword: string,
  newUsername: string | undefined,
  newPassword: string | undefined,
): { success: boolean; message: string } {
  if (!verifyPassword(currentPassword, adminConfig.passwordHash)) {
    return { success: false, message: "현재 비밀번호가 일치하지 않습니다." };
  }

  if (!newUsername && !newPassword) {
    return { success: false, message: "변경할 아이디 또는 비밀번호를 입력해주세요." };
  }

  if (newUsername !== undefined && newUsername.trim().length === 0) {
    return { success: false, message: "아이디는 비워둘 수 없습니다." };
  }

  if (newPassword !== undefined && newPassword.length < 4) {
    return { success: false, message: "새 비밀번호는 4자 이상이어야 합니다." };
  }

  adminConfig = {
    username: newUsername && newUsername.trim().length > 0 ? newUsername.trim() : adminConfig.username,
    passwordHash: newPassword ? hashPassword(newPassword) : adminConfig.passwordHash,
    updatedAt: new Date().toISOString(),
  };
  persistAdminConfig(adminConfig);

  return { success: true, message: "계정 정보가 변경되었습니다." };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session?.role === "admin") {
    return next();
  }
  res.status(401).json({ message: "관리자 권한이 필요합니다. 로그인 후 다시 시도해주세요." });
}
