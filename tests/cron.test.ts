import { describe, expect, it } from "vitest";
import { nextCronTime, parseCron } from "../src/cron.js";
describe("cron scheduling",()=>{
 it("parses ranges, lists and steps",()=>{const cron=parseCron("*/15 9-17 * * 1-5");expect(cron.minute).toEqual(new Set([0,15,30,45]));expect(cron.hour.has(12)).toBe(true);expect(cron.weekday.has(0)).toBe(false)});
 it("finds the next matching local time",()=>{const next=nextCronTime("30 10 * * *",new Date("2026-01-01T10:29:30"));expect(next.getHours()).toBe(10);expect(next.getMinutes()).toBe(30)});
 it("rejects malformed expressions",()=>{expect(()=>parseCron("* * *")).toThrow("5 fields");expect(()=>parseCron("70 * * * *")).toThrow("Invalid cron")});
});
