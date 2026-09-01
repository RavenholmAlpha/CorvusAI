import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getConfigRoot } from "./config.js";
function logDir():string{const dir=join(getConfigRoot(),"logs");mkdirSync(dir,{recursive:true});return dir}
function logFile():string{const d=new Date(),ymd=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");return join(logDir(),"corvus-"+ymd+".jsonl")}
export type LogLevel="info"|"warn"|"error"|"debug";
function sanitize(value:unknown):unknown{if(Array.isArray(value))return value.map(sanitize);if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([key,child])=>/api.?key|token|secret|password|authorization/i.test(key)?[key,"***redacted***"]:[key,sanitize(child)]));if(typeof value==="string"&&/(?:bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]{8,})/i.test(value))return"***redacted***";return value}
export function log(level:LogLevel,message:string,meta?:Record<string,unknown>):void{try{const entry={timestamp:new Date().toISOString(),level,message,...(meta?{meta:sanitize(meta)}:{})};appendFileSync(logFile(),JSON.stringify(entry)+"\n","utf8")}catch(error){if(level==="error")process.stderr.write("Corvus logging failure: "+(error as Error).message+"\n")}}
export const logger={info:(message:string,meta?:Record<string,unknown>)=>log("info",message,meta),warn:(message:string,meta?:Record<string,unknown>)=>log("warn",message,meta),error:(message:string,meta?:Record<string,unknown>)=>log("error",message,meta),debug:(message:string,meta?:Record<string,unknown>)=>log("debug",message,meta)};
