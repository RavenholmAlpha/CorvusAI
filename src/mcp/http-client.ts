import { randomUUID } from "node:crypto";
import type { McpServerConfig, McpTool } from "./client.js";
import { resolveSecret } from "../secrets.js";
export interface HttpMcpServerConfig extends McpServerConfig { url: string; headers?: Record<string,string>; bearerTokenRef?: string }
export class HttpMcpClient {
 private sessionId?:string;
 constructor(private readonly config:HttpMcpServerConfig,private readonly fetchImpl:typeof fetch=fetch){}
 async connect():Promise<void>{await this.request("initialize",{protocolVersion:"2024-11-05",capabilities:{},clientInfo:{name:"corvus",version:"0.3.1"}});await this.notify("notifications/initialized")}
 async listTools():Promise<McpTool[]>{const result=await this.request("tools/list") as {tools?:McpTool[]};return result.tools??[]}
 async callTool(name:string,args:Record<string,unknown>):Promise<unknown>{return this.request("tools/call",{name,arguments:args})}
 async disconnect():Promise<void>{this.sessionId=undefined}
 private headers():Record<string,string>{const token=this.config.bearerTokenRef?resolveSecret(this.config.bearerTokenRef):undefined;return{"content-type":"application/json","accept":"application/json, text/event-stream",...(this.config.headers??{}),...(token?{authorization:"Bearer "+token}:{}),...(this.sessionId?{"mcp-session-id":this.sessionId}:{})}}
 private async notify(method:string):Promise<void>{await this.send({jsonrpc:"2.0",method})}
 private async request(method:string,params?:Record<string,unknown>):Promise<unknown>{const id=randomUUID();const response=await this.send({jsonrpc:"2.0",id,method,...(params?{params}:{})});if(!response)throw new Error("MCP HTTP server returned no response");if(response.error)throw new Error(String(response.error.message??"MCP HTTP error"));return response.result}
 private async send(message:Record<string,unknown>):Promise<any>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.config.timeoutMs??30000);try{const response=await this.fetchImpl(this.config.url,{method:"POST",headers:this.headers(),body:JSON.stringify(message),signal:controller.signal});if(!response.ok)throw new Error("MCP HTTP failed ("+response.status+"): "+await response.text());this.sessionId=response.headers.get("mcp-session-id")??this.sessionId;if(response.status===202)return undefined;const type=response.headers.get("content-type")??"";if(type.includes("text/event-stream")){const text=await response.text();const data=text.split(/\r?\n/).filter(line=>line.startsWith("data:" )).map(line=>line.slice(5).trim()).find(Boolean);return data?JSON.parse(data):undefined}return response.json()}finally{clearTimeout(timer)}}
}
export function isHttpMcpConfig(config:McpServerConfig):config is HttpMcpServerConfig{return typeof (config as HttpMcpServerConfig).url==="string"}
