import { assertSafeUrl } from "./network-policy.js";
export interface BrowserPage{id:string;title:string;url:string;webSocketDebuggerUrl?:string}
async function cdp(wsUrl:string,method:string,params:Record<string,unknown>={}):Promise<any>{return new Promise((resolve,reject)=>{const socket=new WebSocket(wsUrl),id=1;const timer=setTimeout(()=>{socket.close();reject(new Error("CDP timeout"))},15000);socket.addEventListener("open",()=>socket.send(JSON.stringify({id,method,params})));socket.addEventListener("message",event=>{const message=JSON.parse(String(event.data));if(message.id===id){clearTimeout(timer);socket.close();message.error?reject(new Error(message.error.message)):resolve(message.result)}});socket.addEventListener("error",()=>{clearTimeout(timer);reject(new Error("CDP connection failed"))})})}
export class BrowserRuntime{
 constructor(private readonly endpoint:()=>string|undefined){}
 private base():string{const endpoint=this.endpoint();if(!endpoint)throw new Error("Browser CDP endpoint is not configured");return endpoint.replace(/\/+$/,"")}
 async listPages():Promise<BrowserPage[]>{const response=await fetch(this.base()+"/json/list");if(!response.ok)throw new Error("CDP list failed: "+response.status);return response.json() as Promise<BrowserPage[]>}
 async newPage(url="about:blank"):Promise<BrowserPage>{if(url!=="about:blank")await assertSafeUrl(url);const response=await fetch(this.base()+"/json/new?"+encodeURIComponent(url),{method:"PUT"});if(!response.ok)throw new Error("CDP new page failed: "+response.status);return response.json() as Promise<BrowserPage>}
 async navigate(pageId:string,url:string):Promise<void>{await assertSafeUrl(url);await this.call(pageId,"Page.navigate",{url})}
 async screenshot(pageId:string):Promise<string>{const result=await this.call(pageId,"Page.captureScreenshot",{format:"png",fromSurface:true});return String(result.data)}
 async snapshot(pageId:string):Promise<unknown>{await this.call(pageId,"DOM.enable");const document=await this.call(pageId,"DOM.getDocument",{depth:4,pierce:true});return document.root}
 async click(pageId:string,x:number,y:number):Promise<void>{await this.call(pageId,"Input.dispatchMouseEvent",{type:"mousePressed",x,y,button:"left",clickCount:1});await this.call(pageId,"Input.dispatchMouseEvent",{type:"mouseReleased",x,y,button:"left",clickCount:1})}
 async type(pageId:string,text:string):Promise<void>{if(/(?:sk-|api[_-]?key|token|password)/i.test(text))throw new Error("Potential secret text is blocked from browser typing");await this.call(pageId,"Input.insertText",{text})}
 async press(pageId:string,key:string):Promise<void>{await this.call(pageId,"Input.dispatchKeyEvent",{type:"keyDown",key});await this.call(pageId,"Input.dispatchKeyEvent",{type:"keyUp",key})}
 private async call(pageId:string,method:string,params:Record<string,unknown>={}):Promise<any>{const page=(await this.listPages()).find(item=>item.id===pageId);if(!page?.webSocketDebuggerUrl)throw new Error("Browser page not found: "+pageId);return cdp(page.webSocketDebuggerUrl,method,params)}
}
