import { describe, expect, it } from "vitest";
import { openCorvusDatabase } from "../src/db/connection.js";
import { ensureDatabase } from "../src/db/migrations.js";
import { EventLog } from "../src/harness/event-log.js";
describe("tamper-evident audit chain",()=>{it("verifies append order and detects payload tampering",()=>{const db=openCorvusDatabase(":memory:");ensureDatabase(db);const events=new EventLog(db);events.append("first",{value:1});events.append("second",{value:2});expect(events.verifyChain()).toEqual({ok:true,checked:2});db.prepare("update events set payload_json='{}' where type='first'").run();expect(events.verifyChain()).toMatchObject({ok:false,brokenAt:expect.any(String)});db.close()})});
