import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BundleService } from "../src/bundle-service.js";
import { BUNDLES } from "../src/bundles.js";
import { createDefaultConfig } from "../src/config.js";

describe("BundleService",()=>{
 it("resolves custom dependencies and applies an atomic revisioned plan",async()=>{const root=await mkdtemp(join(tmpdir(),"corvus-bundle-"));try{const config=createDefaultConfig();config.installation={...config.installation!,bundle:"minimal",features:[...BUNDLES.minimal.features]};let saves=0;const service=new BundleService(root,config,async()=>{saves++});const plan=await service.plan("custom",["browser","scheduler"]);expect(plan.resolvedComponents).toEqual(expect.arrayContaining(["durable-harness","webui","browser","delegation","scheduler"]));expect(plan.requiredCapabilities).toEqual(expect.arrayContaining(["browser.control","scheduler.execute"]));const state=await service.apply(plan.id,0,"cli");expect(state.revision).toBe(1);expect(config.installation?.bundle).toBe("custom");expect(saves).toBe(1);const reloaded=new BundleService(root,config,async()=>{});expect((await reloaded.current()).resolvedComponents).toContain("browser");}finally{await rm(root,{recursive:true,force:true})}});
 it("rejects stale concurrent plans",async()=>{const root=await mkdtemp(join(tmpdir(),"corvus-bundle-"));try{const config=createDefaultConfig();const service=new BundleService(root,config,async()=>{});const first=await service.plan("minimal");const stale=await service.plan("full");await service.apply(first.id,0,"webui");await expect(service.apply(stale.id,0,"webui")).rejects.toThrow("revision conflict");}finally{await rm(root,{recursive:true,force:true})}});
 it("preserves permission rules while applying bundles",async()=>{const root=await mkdtemp(join(tmpdir(),"corvus-bundle-"));try{const config=createDefaultConfig();const before={...config.permissions.rules};const service=new BundleService(root,config,async()=>{});const plan=await service.plan("full");await service.apply(plan.id,0,"installer");expect(config.permissions.rules).toEqual(before);}finally{await rm(root,{recursive:true,force:true})}});
});
