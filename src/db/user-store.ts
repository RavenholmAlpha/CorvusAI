import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from "node:crypto";
import type { CorvusDatabase } from "./connection.js";
import { WebAuthStore } from "./auth-store.js";

export type UserRole = "admin" | "collaborator";

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  role: UserRole;
  allowedProjectIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type SafeUser = Omit<UserRecord, "passwordHash" | "salt">;

export class UserStore {
  constructor(private db: CorvusDatabase) {
    this.ensureAdminUser();
  }

  private hashPassword(password: string, salt: string): string {
    return scryptSync(password, salt, 64).toString("hex");
  }

  private ensureAdminUser(): void {
    try {
      const existingCount =
        (this.db.prepare("select count(*) as count from users").get() as { count: number } | undefined)?.count ?? 0;
      if (existingCount === 0) {
        const authStore = new WebAuthStore(this.db);
        const cred = authStore.getCredential();
        const now = new Date().toISOString();
        const adminId = "user_" + randomUUID().replace(/-/g, "");
        if (cred) {
          this.db.prepare(`
            insert into users (id, username, password_hash, salt, role, allowed_projects_json, created_at, updated_at)
            values (?, 'admin', ?, ?, 'admin', '["*"]', ?, ?)
          `).run(adminId, cred.hash, cred.salt, cred.updatedAt || now, now);

          if (cred.persistentToken) {
            this.db.prepare(`
              insert or replace into user_tokens (token, user_id, created_at, last_used_at)
              values (?, ?, ?, ?)
            `).run(cred.persistentToken, adminId, now, now);
          }
        }
      }
    } catch {}
  }

  isInitialized(): boolean {
    try {
      const admin = this.db.prepare("select id from users where role = 'admin' limit 1").get();
      return Boolean(admin);
    } catch {
      return false;
    }
  }

  listUsers(): SafeUser[] {
    const rows = this.db
      .prepare(
        "select id, username, role, allowed_projects_json, created_at, updated_at from users order by created_at asc"
      )
      .all() as any[];
    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      role: r.role as UserRole,
      allowedProjectIds: JSON.parse(r.allowed_projects_json || "[]"),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  getUser(id: string): SafeUser | null {
    const r = this.db
      .prepare(
        "select id, username, role, allowed_projects_json, created_at, updated_at from users where id = ?"
      )
      .get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      username: r.username,
      role: r.role as UserRole,
      allowedProjectIds: JSON.parse(r.allowed_projects_json || "[]"),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  getUserByUsername(username: string): UserRecord | null {
    const r = this.db
      .prepare(
        "select id, username, password_hash, salt, role, allowed_projects_json, created_at, updated_at from users where lower(username) = lower(?)"
      )
      .get(username) as any;
    if (!r) return null;
    return {
      id: r.id,
      username: r.username,
      passwordHash: r.password_hash,
      salt: r.salt,
      role: r.role as UserRole,
      allowedProjectIds: JSON.parse(r.allowed_projects_json || "[]"),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  createUser(input: {
    username: string;
    password: string;
    role?: UserRole;
    allowedProjectIds?: string[];
  }): SafeUser {
    const username = input.username.trim();
    if (!username || username.length < 2) {
      throw new Error("Username must be at least 2 characters");
    }
    if (!input.password || input.password.length < 4) {
      throw new Error("Password must be at least 4 characters");
    }
    const existing = this.getUserByUsername(username);
    if (existing) {
      throw new Error(`User with username '${username}' already exists`);
    }

    const salt = randomBytes(16).toString("hex");
    const hash = this.hashPassword(input.password, salt);
    const id = "user_" + randomUUID().replace(/-/g, "");
    const role: UserRole = input.role || "collaborator";
    const allowed = role === "admin" ? ["*"] : input.allowedProjectIds || [];
    const now = new Date().toISOString();

    this.db.prepare(`
      insert into users (id, username, password_hash, salt, role, allowed_projects_json, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, username, hash, salt, role, JSON.stringify(allowed), now, now);

    // If this is the first admin created via setup, also sync WebAuthStore
    if (role === "admin" && username === "admin") {
      const authStore = new WebAuthStore(this.db);
      const persistent = authStore.getPersistentToken();
      if (persistent) {
        this.db
          .prepare(
            "insert or replace into user_tokens (token, user_id, created_at, last_used_at) values (?, ?, ?, ?)"
          )
          .run(persistent, id, now, now);
      }
    }

    return {
      id,
      username,
      role,
      allowedProjectIds: allowed,
      createdAt: now,
      updatedAt: now,
    };
  }

  updateUser(
    id: string,
    updates: {
      role?: UserRole;
      allowedProjectIds?: string[];
      password?: string;
    }
  ): SafeUser {
    const user = this.getUser(id);
    if (!user) throw new Error("User not found");

    const now = new Date().toISOString();
    if (updates.password) {
      if (updates.password.length < 4) throw new Error("Password must be at least 4 characters");
      const salt = randomBytes(16).toString("hex");
      const hash = this.hashPassword(updates.password, salt);
      this.db
        .prepare("update users set password_hash = ?, salt = ?, updated_at = ? where id = ?")
        .run(hash, salt, now, id);

      if (user.username === "admin") {
        const authStore = new WebAuthStore(this.db);
        authStore.setPassword(updates.password);
      }
    }
    if (updates.role) {
      if (user.role === "admin" && updates.role !== "admin") {
        const adminCount =
          (this.db.prepare("select count(*) as count from users where role = 'admin'").get() as any)?.count ?? 0;
        if (adminCount <= 1) {
          throw new Error("Cannot demote the only administrator");
        }
      }
      this.db.prepare("update users set role = ?, updated_at = ? where id = ?").run(updates.role, now, id);
    }
    if (updates.allowedProjectIds !== undefined) {
      const finalRole = updates.role ?? user.role;
      const allowed = finalRole === "admin" ? ["*"] : updates.allowedProjectIds;
      this.db
        .prepare("update users set allowed_projects_json = ?, updated_at = ? where id = ?")
        .run(JSON.stringify(allowed), now, id);
    }

    return this.getUser(id)!;
  }

  deleteUser(id: string): void {
    const user = this.getUser(id);
    if (!user) throw new Error("User not found");
    if (user.role === "admin") {
      const adminCount =
        (this.db.prepare("select count(*) as count from users where role = 'admin'").get() as any)?.count ?? 0;
      if (adminCount <= 1) {
        throw new Error("Cannot delete the only administrator");
      }
    }
    this.db.prepare("delete from users where id = ?").run(id);
  }

  verifyPassword(
    username: string,
    password: string
  ): { ok: boolean; user?: SafeUser; token?: string } {
    const record = this.getUserByUsername(username);
    if (!record) return { ok: false };
    const computed = this.hashPassword(password, record.salt);
    const valid = timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(record.passwordHash, "hex"));
    if (!valid) return { ok: false };

    let token = randomUUID().replace(/-/g, "");
    if (record.username === "admin") {
      const authStore = new WebAuthStore(this.db);
      const persistent = authStore.getPersistentToken();
      if (persistent) token = persistent;
    }
    const now = new Date().toISOString();
    this.db
      .prepare("insert or replace into user_tokens (token, user_id, created_at, last_used_at) values (?, ?, ?, ?)")
      .run(token, record.id, now, now);

    return {
      ok: true,
      user: {
        id: record.id,
        username: record.username,
        role: record.role,
        allowedProjectIds: record.allowedProjectIds,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      token,
    };
  }

  getUserByToken(token: string): SafeUser | null {
    if (!token) return null;
    const row = this.db
      .prepare(`
      select u.id, u.username, u.role, u.allowed_projects_json, u.created_at, u.updated_at
      from user_tokens t
      join users u on u.id = t.user_id
      where t.token = ?
    `)
      .get(token) as any;
    if (!row) {
      const authStore = new WebAuthStore(this.db);
      if (authStore.validateToken(token)) {
        const admin = this.getUserByUsername("admin");
        if (admin) {
          return {
            id: admin.id,
            username: admin.username,
            role: admin.role,
            allowedProjectIds: admin.allowedProjectIds,
            createdAt: admin.createdAt,
            updatedAt: admin.updatedAt,
          };
        }
      }
      return null;
    }

    try {
      this.db.prepare("update user_tokens set last_used_at = ? where token = ?").run(new Date().toISOString(), token);
    } catch {}

    return {
      id: row.id,
      username: row.username,
      role: row.role as UserRole,
      allowedProjectIds: JSON.parse(row.allowed_projects_json || "[]"),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
