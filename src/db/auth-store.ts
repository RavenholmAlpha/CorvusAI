import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from "node:crypto";
import type { CorvusDatabase } from "./connection.js";

export interface PasswordCredential {
  hash: string;
  salt: string;
  persistentToken: string;
  updatedAt: string;
}

export class WebAuthStore {
  constructor(private db: CorvusDatabase) {}

  private hashPassword(password: string, salt: string): string {
    return scryptSync(password, salt, 64).toString("hex");
  }

  isInitialized(): boolean {
    const row = this.db.prepare("select value_json from settings where key = 'auth.web_credential'").get() as
      | { value_json: string }
      | undefined;
    return Boolean(row?.value_json);
  }

  getCredential(): PasswordCredential | null {
    const row = this.db.prepare("select value_json from settings where key = 'auth.web_credential'").get() as
      | { value_json: string }
      | undefined;
    if (!row?.value_json) return null;
    try {
      return JSON.parse(row.value_json) as PasswordCredential;
    } catch {
      return null;
    }
  }

  setPassword(password: string): { token: string } {
    if (!password || password.length < 4) {
      throw new Error("Password must be at least 4 characters long");
    }
    const salt = randomBytes(16).toString("hex");
    const hash = this.hashPassword(password, salt);
    const current = this.getCredential();
    const persistentToken = current?.persistentToken ?? randomUUID().replace(/-/g, "");
    const credential: PasswordCredential = {
      hash,
      salt,
      persistentToken,
      updatedAt: new Date().toISOString(),
    };
    const now = new Date().toISOString();
    this.db.prepare(`
      insert into settings (key, value_json, created_at, updated_at)
      values ('auth.web_credential', ?, ?, ?)
      on conflict(key) do update set value_json = excluded.value_json, updated_at = excluded.updated_at
    `).run(JSON.stringify(credential), now, now);
    return { token: persistentToken };
  }

  verifyPassword(password: string): { ok: boolean; token?: string } {
    const credential = this.getCredential();
    if (!credential) return { ok: false };
    const computed = this.hashPassword(password, credential.salt);
    const valid = timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(credential.hash, "hex"));
    if (!valid) return { ok: false };
    return { ok: true, token: credential.persistentToken };
  }

  validateToken(token: string): boolean {
    if (!token) return false;
    const credential = this.getCredential();
    if (!credential) return false;
    return credential.persistentToken === token;
  }

  getPersistentToken(): string | null {
    const credential = this.getCredential();
    return credential?.persistentToken ?? null;
  }

  resetPassword(): void {
    this.db.prepare("delete from settings where key = 'auth.web_credential'").run();
  }
}
