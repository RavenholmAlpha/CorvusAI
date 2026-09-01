import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { BrowserRuntime } from "../src/browser-runtime.js";
import { ExecutionNodeManager } from "../src/execution-nodes.js";
let close:(()=>Promise<void>)|undefined;afterEach(async()=>{await close?.();close=undefined});
describe("browser and execution runtimes",()=>{
 it("lists CDP browser pages and blocks secret typing before page access",async()=>{const server=createServer((_req,res)=>{res.setHeader("content-type","application/json");res.end(JSON.stringify([{id:"page1",title:"Page",url:"https://example.com"}]))});await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));close=()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));const address=server.address() as any;const runtime=new BrowserRuntime(()=>"http://127.0.0.1:"+address.port);const pages=await runtime.listPages();expect(pages[0]).toMatchObject({id:"page1",title:"Page"});await expect(runtime.type("page1","password=secret")).rejects.toThrow("Potential secret")});
 it("tests a local execution node",async()=>{const nodes=new ExecutionNodeManager(()=>({local:{id:"local",type:"local",enabled:true,allowedCommands:["node"]}}));expect(await nodes.test("local")).toMatchObject({id:"local",ok:true});await expect(nodes.execute("local","git status")).rejects.toThrow("not allowed")});
});
