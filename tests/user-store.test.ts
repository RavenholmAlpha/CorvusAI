import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { initialSchemaSql } from "../src/db/schema.js";
import { UserStore } from "../src/db/user-store.js";
import { WebAuthStore } from "../src/db/auth-store.js";

describe("UserStore and Multi-user Collaboration", () => {
  let db: any;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(initialSchemaSql);
  });

  it("seeds admin user when WebAuthStore has password", () => {
    const authStore = new WebAuthStore(db);
    authStore.setPassword("admin-secret-key");

    const userStore = new UserStore(db);
    expect(userStore.isInitialized()).toBe(true);

    const users = userStore.listUsers();
    expect(users.length).toBe(1);
    expect(users[0].username).toBe("admin");
    expect(users[0].role).toBe("admin");
    expect(users[0].allowedProjectIds).toEqual(["*"]);

    // Verify password check
    const verify = userStore.verifyPassword("admin", "admin-secret-key");
    expect(verify.ok).toBe(true);
    expect(verify.user?.username).toBe("admin");
    expect(verify.token).toBeDefined();

    // Verify token lookup
    const fromToken = userStore.getUserByToken(verify.token!);
    expect(fromToken?.username).toBe("admin");
  });

  it("supports creating collaborators with authorized workspaces and prevents privilege escalation", () => {
    const userStore = new UserStore(db);

    // Create an admin first
    const admin = userStore.createUser({
      username: "superadmin",
      password: "adminpassword",
      role: "admin",
    });
    expect(admin.role).toBe("admin");
    expect(admin.allowedProjectIds).toEqual(["*"]);

    // Create a collaborator with specific project access
    const collab = userStore.createUser({
      username: "coder_bob",
      password: "bobpassword",
      role: "collaborator",
      allowedProjectIds: ["proj_alpha", "proj_beta"],
    });
    expect(collab.role).toBe("collaborator");
    expect(collab.allowedProjectIds).toEqual(["proj_alpha", "proj_beta"]);

    // Verify collaborator login
    const loginRes = userStore.verifyPassword("coder_bob", "bobpassword");
    expect(loginRes.ok).toBe(true);
    expect(loginRes.user?.role).toBe("collaborator");
    expect(loginRes.user?.allowedProjectIds).toEqual(["proj_alpha", "proj_beta"]);

    // Token lookup returns correct scopes
    const tokenUser = userStore.getUserByToken(loginRes.token!);
    expect(tokenUser?.username).toBe("coder_bob");
    expect(tokenUser?.role).toBe("collaborator");
    expect(tokenUser?.allowedProjectIds).toEqual(["proj_alpha", "proj_beta"]);

    // Update authorized workspaces
    const updated = userStore.updateUser(collab.id, {
      allowedProjectIds: ["proj_alpha"],
    });
    expect(updated.allowedProjectIds).toEqual(["proj_alpha"]);

    // Prevent deleting the only administrator
    expect(() => userStore.deleteUser(admin.id)).toThrow("Cannot delete the only administrator");

    // Collaborator can be deleted
    userStore.deleteUser(collab.id);
    expect(userStore.getUser(collab.id)).toBeNull();
  });
});
