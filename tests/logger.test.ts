import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
const previous=process.env.CORVUS_HOME;afterEach(()=>{if(previous===undefined)delete process.env.CORVUS_HOME;else process.env.CORVUS_HOME=previous});
describe("structured logger",()=>{it("writes JSONL and redacts secrets",async()=>{const root=await mkdtemp(join(tmpdir(),"corvus-log-"));try{process.env.CORVUS_HOME=root;const {log}=await import("../src/logger.js?test="+Date.now());log("info","request",{apiKey:"sk-sensitive",nested:{authorization:"Bearer secret"},runId:"run_1"});const files=await import("node:fs/promises").then(fs=>fs.readdir(join(root,"logs")));const text=await readFile(join(root,"logs",files[0]),"utf8");const item=JSON.parse(text);expect(item).toMatchObject({level:"info",message:"request",meta:{apiKey:"***redacted***",nested:{authorization:"***redacted***"},runId:"run_1"}})}finally{await rm(root,{recursive:true,force:true})}})});
