import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyBundle, applyPermissionPreset, BUNDLES, planBundle } from "../src/bundles.js";
import { createDefaultConfig, saveConfig } from "../src/config.js";
import { PluginManagementService } from "../src/plugin-management.js";
import { readPluginManifest, resolvePluginEntry } from "../src/plugins.js";

describe("plugin kernel and feature bundles", () => {
  it("plans and applies feature bundles without widening permissions", () => {
    const config=createDefaultConfig(); const before={...config.permissions.rules}; const plan=planBundle(config,"full");
    expect(plan.enableFeatures).toContain("browser"); expect(plan.requiredCapabilities).toContain("browser.control");
    applyBundle(config,"full"); expect(config.installation?.bundle).toBe("full"); expect(config.permissions.rules).toEqual(before);
    applyPermissionPreset(config,"safe"); expect(config.permissions.rules["capability:process"]).toBe("ask");
  });
  it("publishes distinct minimal/default/full presets",()=>{expect(BUNDLES.minimal.features.length).toBeLessThan(BUNDLES.default.features.length);expect(BUNDLES.default.features.length).toBeLessThan(BUNDLES.full.features.length);});
  it("validates v1 manifests and blocks entry traversal",async()=>{const root=await mkdtemp(join(tmpdir(),"corvus-manifest-"));try{await writeFile(join(root,"corvus.plugin.json"),JSON.stringify({id:"test.plugin",name:"Test",version:"1.0.0",apiVersion:1,runtime:{type:"native",entry:"index.mjs"},capabilities:{required:["network"],optional:[]}}));const manifest=await readPluginManifest(root);expect(manifest.id).toBe("test.plugin");expect(()=>resolvePluginEntry(root,"../escape.mjs")).toThrow("escapes");}finally{await rm(root,{recursive:true,force:true});}});
  it("manages plugin enablement, grants and config through one service",async()=>{const home=await mkdtemp(join(tmpdir(),"corvus-manager-"));try{const source=join(home,"source");const plugins=join(home,"plugins");await mkdir(source);await writeFile(join(source,"corvus.plugin.json"),JSON.stringify({id:"test.plugin",name:"Test",version:"1.0.0",apiVersion:1,runtime:"declarative",capabilities:{required:["network"],optional:[]}}));const config=createDefaultConfig();const manager=new PluginManagementService(plugins,config,()=>saveConfig(config,join(home,"config.json")));await manager.installFromDirectory(source);expect((await manager.list())[0].enabled).toBe(false);await manager.grant("test.plugin",["network"]);await manager.enable("test.plugin");await manager.configure("test.plugin",{url:"https://example.test"});const item=(await manager.list())[0];expect(item.health).toBe("ready");expect(item.configured).toBe(true);}finally{await rm(home,{recursive:true,force:true});}});
});
