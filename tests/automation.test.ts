import { describe, expect, it } from "vitest";
import { openCorvusDatabase } from "../src/db/connection.js";
import { ensureDatabase } from "../src/db/migrations.js";
import { AutomationScheduler, type AutomationConfig } from "../src/automation.js";

describe("AutomationScheduler", () => {
  it("runs matching event automations and records state", async () => {
    const calls: string[] = [];
    const scheduler = new AutomationScheduler(async (automation) => { calls.push(automation.id); });
    const automations: AutomationConfig[] = [{ id: "memory", enabled: true, projectId: "p", prompt: "curate", trigger: { type: "event", event: "task.completed" } }];
    await scheduler.emit("task.completed", automations);
    expect(calls).toEqual(["memory"]);
    expect(scheduler.listStates()).toEqual([expect.objectContaining({ id: "memory", lastStatus: "succeeded" })]);
  });

  it("persists execution history and skips overlapping work", async () => {
    const db = openCorvusDatabase(":memory:"); ensureDatabase(db); let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    const scheduler = new AutomationScheduler(async () => gate, db); const job: AutomationConfig = { id: "slow", enabled: true, projectId: "p", prompt: "slow", trigger: { type: "event", event: "go" } };
    const first = scheduler.runNow(job); await new Promise((resolve) => setImmediate(resolve)); await scheduler.runNow(job); expect(scheduler.listStates()[0].lastStatus).toBe("skipped"); release(); await first;
    expect(scheduler.listRuns("slow")).toEqual([expect.objectContaining({ automationId: "slow", status: "succeeded" })]); db.close();
  });

  it("retries transient failures and records the final attempt", async () => {
    const db=openCorvusDatabase(":memory:");ensureDatabase(db);let calls=0;const scheduler=new AutomationScheduler(async()=>{calls++;if(calls===1)throw new Error("transient")},db);
    await scheduler.runNow({id:"retry",enabled:true,projectId:"p",prompt:"retry",trigger:{type:"event",event:"go"},maxRetries:1,retryDelaySeconds:0.001});
    expect(calls).toBe(2);expect(scheduler.listRuns("retry")[0]).toMatchObject({status:"succeeded"});expect((db.prepare("select attempt, claim_token from automation_runs where automation_id='retry'").get() as any)).toMatchObject({attempt:2,claim_token:expect.any(String)});db.close();
  });
  it("prevents concurrent schedulers from owning the same active lease", async () => {
    const db=openCorvusDatabase(":memory:");ensureDatabase(db);let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve});let secondCalls=0;const first=new AutomationScheduler(async()=>gate,db);const second=new AutomationScheduler(async()=>{secondCalls++},db);const job:AutomationConfig={id:"shared",enabled:true,projectId:"p",prompt:"x",trigger:{type:"event",event:"go"}};const active=first.runNow(job);await new Promise(resolve=>setImmediate(resolve));await second.runNow(job);expect(secondCalls).toBe(0);expect(second.listStates()[0]).toMatchObject({lastStatus:"skipped",lastError:"Another process owns the active lease"});release();await active;db.close();
  });
});
