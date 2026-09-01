import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getConfigRoot } from "./config.js";
interface SecretFile{version:1;salt:string;iv:string;tag:string;data:string}
function password():string{const value=process.env.CORVUS_SECRET_PASSWORD;if(!value)throw new Error("CORVUS_SECRET_PASSWORD is required for store: references");return value}
function path():string{return join(getConfigRoot(),"secrets.enc.json")}
async function readAll():Promise<Record<string,string>>{try{const file=JSON.parse(await readFile(path(),"utf8")) as SecretFile;const key=scryptSync(password(),Buffer.from(file.salt,"base64"),32);const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(file.iv,"base64"));decipher.setAuthTag(Buffer.from(file.tag,"base64"));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(file.data,"base64")),decipher.final()]).toString("utf8"))}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return{};throw error}}
async function writeAll(values:Record<string,string>):Promise<void>{const salt=randomBytes(16),iv=randomBytes(12),key=scryptSync(password(),salt,32),cipher=createCipheriv("aes-256-gcm",key,iv);const encrypted=Buffer.concat([cipher.update(JSON.stringify(values),"utf8"),cipher.final()]);const file:SecretFile={version:1,salt:salt.toString("base64"),iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),data:encrypted.toString("base64")};await mkdir(dirname(path()),{recursive:true});await writeFile(path(),JSON.stringify(file,null,2)+"\n",{encoding:"utf8",mode:0o600})}
export async function setStoredSecret(name:string,value:string):Promise<void>{if(!/^[A-Z][A-Z0-9_]{1,127}$/i.test(name))throw new Error("Invalid secret name");const values=await readAll();values[name]=value;await writeAll(values)}
export async function getStoredSecret(name:string):Promise<string|undefined>{return(await readAll())[name]}
export function getStoredSecretSync(name:string):string|undefined{const file=JSON.parse(readFileSync(path(),"utf8")) as SecretFile;const key=scryptSync(password(),Buffer.from(file.salt,"base64"),32);const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(file.iv,"base64"));decipher.setAuthTag(Buffer.from(file.tag,"base64"));const values=JSON.parse(Buffer.concat([decipher.update(Buffer.from(file.data,"base64")),decipher.final()]).toString("utf8")) as Record<string,string>;return values[name]}
export async function deleteStoredSecret(name:string):Promise<void>{const values=await readAll();delete values[name];await writeAll(values)}
export async function listStoredSecrets():Promise<string[]>{return Object.keys(await readAll()).sort()}
