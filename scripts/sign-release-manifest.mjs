import { readFile, writeFile } from "node:fs/promises";
import { createPrivateKey, sign } from "node:crypto";
const manifestUrl=new URL("../dist/release-manifest.json",import.meta.url);const pem=process.env.CORVUS_RELEASE_PRIVATE_KEY;if(!pem)throw new Error("CORVUS_RELEASE_PRIVATE_KEY is required");const data=await readFile(manifestUrl);const signature=sign(null,data,createPrivateKey(pem)).toString("base64");await writeFile(new URL("../dist/release-manifest.sig",import.meta.url),signature+"\n");console.log("Signed release manifest");
