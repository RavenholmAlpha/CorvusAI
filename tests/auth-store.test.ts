import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { WebAuthStore } from "../src/db/auth-store.js";
import { initialSchemaSql } from "../src/db/schema.js";

describe("WebAuthStore", () => {
  function createTestDb() {
    const db = new Database(":memory:");
    db.exec(initialSchemaSql);
    return db;
  }

  it("handles password initialization, verification and token validation", () => {
    const db = createTestDb();
    const store = new WebAuthStore(db as any);

    expect(store.isInitialized()).toBe(false);
    expect(store.getPersistentToken()).toBeNull();

    // Set password
    const { token } = store.setPassword("my-secret-pass-123");
    expect(store.isInitialized()).toBe(true);
    expect(token).toBeTruthy();
    expect(store.getPersistentToken()).toBe(token);

    // Verify wrong password
    const wrong = store.verifyPassword("wrong-password");
    expect(wrong.ok).toBe(false);

    // Verify correct password
    const correct = store.verifyPassword("my-secret-pass-123");
    expect(correct.ok).toBe(true);
    expect(correct.token).toBe(token);

    // Validate token
    expect(store.validateToken(token)).toBe(true);
    expect(store.validateToken("invalid-token")).toBe(false);

    // Reset password
    store.resetPassword();
    expect(store.isInitialized()).toBe(false);
    expect(store.getPersistentToken()).toBeNull();
  });

  it("preserves persistent token when updating password", () => {
    const db = createTestDb();
    const store = new WebAuthStore(db as any);

    const { token: originalToken } = store.setPassword("initial-pass");
    const { token: updatedToken } = store.setPassword("new-super-pass");

    // Persistent token is maintained so clients don't lose session upon password change
    expect(updatedToken).toBe(originalToken);
    expect(store.verifyPassword("new-super-pass").ok).toBe(true);
    expect(store.verifyPassword("initial-pass").ok).toBe(false);
  });
});
