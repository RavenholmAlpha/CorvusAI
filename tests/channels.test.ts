import { afterEach, describe, expect, it } from "vitest";
import { openCorvusDatabase, type CorvusDatabase } from "../src/db/connection.js";
import { ensureDatabase } from "../src/db/migrations.js";
import { ChannelDeliveryManager } from "../src/channels.js";
let db:CorvusDatabase|undefined;afterEach(()=>{if(db?.open)db.close()});
describe("channel delivery queue",()=>{
 it("persists delivery attempts through a channel adapter",async()=>{db=openCorvusDatabase(":memory:");ensureDatabase(db);const manager=new ChannelDeliveryManager(db);const delivered:unknown[]=[];manager.register({type:"test",deliver:async(_config,payload)=>{delivered.push(payload)}});const row=await manager.enqueue("channel",{type:"test"},{text:"hello"});expect(row).toMatchObject({channelId:"channel",status:"delivered",attempts:1});expect(delivered).toEqual([{text:"hello"}])});
 it("recovers failed deliveries through the persistent worker",async()=>{db=openCorvusDatabase(":memory:");ensureDatabase(db);const manager=new ChannelDeliveryManager(db);let attempts=0;manager.register({type:"flaky",deliver:async()=>{attempts++;if(attempts===1)throw new Error("temporary")}});const config={type:"flaky"};const first=await manager.enqueue("alerts",config,{text:"retry"});expect(first.status).toBe("failed");manager.start(()=>({alerts:config}),10);await new Promise(resolve=>setTimeout(resolve,35));manager.stop();expect(manager.list()[0]).toMatchObject({status:"delivered",attempts:2});});
});
