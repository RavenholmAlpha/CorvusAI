import { readFile } from "node:fs/promises";
import { createPublicKey, verify } from "node:crypto";
export async function verifyReleaseManifest(manifestPath:string,signaturePath:string,publicKeyPem:string):Promise<boolean>{const [manifest,signature]=await Promise.all([readFile(manifestPath),readFile(signaturePath,"utf8")]);return verify(null,manifest,createPublicKey(publicKeyPem),Buffer.from(signature.trim(),"base64"))}
