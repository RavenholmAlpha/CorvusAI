import { describe, it, expect, afterEach } from "vitest";
import { openCorvusDatabase, type CorvusDatabase } from "../src/db/connection.js";
import { ensureDatabase } from "../src/db/migrations.js";
import { startWebControlPlane } from "../src/web/server.js";
import { RunStore } from "../src/harness/run-store.js";
import { EventLog } from "../src/harness/event-log.js";
import { ApprovalService } from "../src/harness/approval-service.js";
import { UserStore } from "../src/db/user-store.js";
import { createDefaultConfig } from "../src/config.js";

describe("Web Multi-User Collaboration & RBAC Integration", () => {
  let db: CorvusDatabase | undefined;
  let serverHandle: { url: string; accessUrl: string; close: () => Promise<void> } | undefined;

  afterEach(async () => {
    if (serverHandle) {
      await serverHandle.close();
      serverHandle = undefined;
    }
    if (db?.open) {
      db.close();
      db = undefined;
    }
  });

  it("enforces admin-only routes and scopes projects/sessions for collaborators", async () => {
    db = openCorvusDatabase(":memory:");
    ensureDatabase(db);
    const events = new EventLog(db);
    const runs = new RunStore(db, events);
    const userStore = new UserStore(db);

    // Create 2 projects
    const projAlpha = runs.createProject("Project Alpha", "D:/projects/alpha");
    const projBeta = runs.createProject("Project Beta", "D:/projects/beta");

    // Create sessions in both projects
    const sessionAlpha = runs.createSession(projAlpha.id, "Alpha Task Session");
    const sessionBeta = runs.createSession(projBeta.id, "Beta Task Session");

    // Create Admin user
    userStore.createUser({
      username: "admin",
      password: "adminpassword",
      role: "admin",
    });

    // Create Collaborator with access ONLY to Project Alpha
    userStore.createUser({
      username: "collab_alice",
      password: "alicepassword",
      role: "collaborator",
      allowedProjectIds: [projAlpha.id],
    });

    const config = createDefaultConfig();
    serverHandle = await startWebControlPlane({
      db,
      runs,
      events,
      approvals: new ApprovalService(db),
      config,
      auth: true,
      port: 0,
    });

    // 1. Login as Collaborator Alice
    const aliceLoginRes = await fetch(`${serverHandle.url}api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "collab_alice", password: "alicepassword" }),
    });
    expect(aliceLoginRes.status).toBe(200);
    const aliceData = await aliceLoginRes.json();
    expect(aliceData.token).toBeDefined();
    expect(aliceData.user.role).toBe("collaborator");
    const aliceToken = aliceData.token;

    // 2. Collaborator cannot access Admin-only routes (e.g. /api/users or /api/config)
    const forbiddenUsersRes = await fetch(`${serverHandle.url}api/users`, {
      headers: { "x-corvus-token": aliceToken },
    });
    expect(forbiddenUsersRes.status).toBe(403);

    const forbiddenConfigRes = await fetch(`${serverHandle.url}api/config`, {
      method: "POST",
      headers: { "x-corvus-token": aliceToken, "content-type": "application/json" },
      body: JSON.stringify({ model: "hacked-model" }),
    });
    expect(forbiddenConfigRes.status).toBe(403);

    // 3. Collaborator GET /api/state: only sees Project Alpha and Alpha sessions
    const stateRes = await fetch(`${serverHandle.url}api/state`, {
      headers: { "x-corvus-token": aliceToken },
    });
    expect(stateRes.status).toBe(200);
    const state = await stateRes.json();
    expect(state.currentUser.username).toBe("collab_alice");
    expect(state.currentUser.role).toBe("collaborator");

    // Only 1 project visible
    expect(state.projects.length).toBe(1);
    expect(state.projects[0].id).toBe(projAlpha.id);

    // Only Alpha session visible, Beta session is hidden!
    expect(state.allSessions.some((s: any) => s.id === sessionAlpha.id)).toBe(true);
    expect(state.allSessions.some((s: any) => s.id === sessionBeta.id)).toBe(false);

    // 4. Admin login & verification
    const adminLoginRes = await fetch(`${serverHandle.url}api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "adminpassword" }),
    });
    expect(adminLoginRes.status).toBe(200);
    const adminToken = (await adminLoginRes.json()).token;

    // Admin CAN access /api/users
    const adminUsersRes = await fetch(`${serverHandle.url}api/users`, {
      headers: { "x-corvus-token": adminToken },
    });
    expect(adminUsersRes.status).toBe(200);
    const usersList = await adminUsersRes.json();
    expect(usersList.length).toBe(2);

    // Admin sees ALL projects in /api/state
    const adminStateRes = await fetch(`${serverHandle.url}api/state`, {
      headers: { "x-corvus-token": adminToken },
    });
    const adminState = await adminStateRes.json();
    expect(adminState.projects.length).toBe(2);
    expect(adminState.allSessions.some((s: any) => s.id === sessionAlpha.id)).toBe(true);
    expect(adminState.allSessions.some((s: any) => s.id === sessionBeta.id)).toBe(true);
  });
});
