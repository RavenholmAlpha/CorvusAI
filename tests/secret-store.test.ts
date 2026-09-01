import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deleteStoredSecret, getStoredSecret, listStoredSecrets, setStoredSecret } from "../src/secret-store.js";
import { resolveSecret } from "../src/secrets.js";
const oldHome=process.env.CORVUS_HOME,oldPassword=process.env.CORVUS_SECRET_PASSWORD;afterEach(()=>{if(oldHome===undefined)delete process.env.CORVUS_HOME;else process.env.CORVUS_HOME=oldHome;if(oldPassword===undefined)delete process.env.CORVUS_SECRET_PASSWORD;else process.env.CORVUS_SECRET_PASSWORD=oldPassword});
describe("encrypted secret store",()=>{it("encrypts, retrieves and deletes named secrets",async()=>{const root=await mkdtemp(join(tmpdir(),"corvus-secrets-"));try{process.env.CORVUS_HOME=root;process.env.CORVUS_SECRET_PASSWORD="test-password";await setStoredSecret("GITHUB_TOKEN","very-secret");expect(await getStoredSecret("GITHUB_TOKEN")).toBe("very-secret");expect(resolveSecret("store:GITHUB_TOKEN")).toBe("very-secret");expect(await listStoredSecrets()).toEqual(["GITHUB_TOKEN"]);const raw=await readFile(join(root,"secrets.enc.json"),"utf8");expect(raw).not.toContain("very-secret");await deleteStoredSecret("GITHUB_TOKEN");expect(await listStoredSecrets()).toEqual([])}finally{await rm(root,{recursive:true,force:true})}})});
