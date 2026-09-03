import { afterEach, describe, expect, it } from "vitest";
import { createDefaultConfig } from "../src/config.js";
import { openCorvusDatabase, type CorvusDatabase } from "../src/db/connection.js";
import { ensureDatabase } from "../src/db/migrations.js";
import { EventLog } from "../src/harness/event-log.js";
import { RunStore } from "../src/harness/run-store.js";
import { EvidenceStore } from "../src/harness/evidence-store.js";
import { ApprovalService } from "../src/harness/approval-service.js";
import { startWebControlPlane } from "../src/web/server.js";

let db: CorvusDatabase | undefined;
let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  if (db?.open) db.close();
  close = undefined;
  db = undefined;
});

describe("web auth endpoints", () => {
  it("supports password setup, login, status, and persistent authentication", async () => {
    db = openCorvusDatabase(":memory:");
    ensureDatabase(db);
    const config = createDefaultConfig();
    config.installation = { bundle: "full", features: ["webui"] };
    const events = new EventLog(db);
    const runs = new RunStore(db, events);
    const evidence = new EvidenceStore(db, events);
    const approvals = new ApprovalService(db, events, config.permissions, evidence);

    const web = await startWebControlPlane({
      config,
      runs,
      approvals,
      db,
      saveConfig: async () => undefined,
      port: 0,
      auth: true,
    });
    close = web.close;

    // 1. Initial status: uninitialized and unauthenticated
    const statusRes1 = await fetch(`${web.url}api/auth/status`).then((r) => r.json());
    expect(statusRes1.initialized).toBe(false);
    expect(statusRes1.authenticated).toBe(false);

    // 2. Accessing protected endpoint without token fails with 401
    const protectedFail = await fetch(`${web.url}api/state`);
    expect(protectedFail.status).toBe(401);

    // 3. Setup administrator password for the first time
    const setupRes = await fetch(`${web.url}api/auth/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "admin-secure-pwd" }),
    });
    expect(setupRes.status).toBe(200);
    const setupData = await setupRes.json();
    expect(setupData.ok).toBe(true);
    expect(setupData.token).toBeTruthy();
    const token = setupData.token;

    // 4. Status now reflects initialized
    const statusRes2 = await fetch(`${web.url}api/auth/status?token=${token}`).then((r) => r.json());
    expect(statusRes2.initialized).toBe(true);
    expect(statusRes2.authenticated).toBe(true);

    // 5. Accessing protected endpoint with token succeeds
    const protectedOk = await fetch(`${web.url}api/state`, {
      headers: { "x-corvus-token": token },
    });
    expect(protectedOk.status).toBe(200);

    // 6. Login with wrong password returns 401
    const loginFail = await fetch(`${web.url}api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong-password" }),
    });
    expect(loginFail.status).toBe(401);

    // 7. Login with correct password succeeds and returns the token
    const loginOk = await fetch(`${web.url}api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "admin-secure-pwd" }),
    });
    expect(loginOk.status).toBe(200);
    const loginData = await loginOk.json();
    expect(loginData.token).toBe(token);

    // 8. Change password requires correct old password
    const changeFail = await fetch(`${web.url}api/auth/change-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oldPassword: "wrong", newPassword: "new-password-456" }),
    });
    expect(changeFail.status).toBe(401);

    const changeOk = await fetch(`${web.url}api/auth/change-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oldPassword: "admin-secure-pwd", newPassword: "new-password-456" }),
    });
    expect(changeOk.status).toBe(200);

    // 9. Login with new password succeeds
    const loginNew = await fetch(`${web.url}api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "new-password-456" }),
    });
    expect(loginNew.status).toBe(200);
  });
});
