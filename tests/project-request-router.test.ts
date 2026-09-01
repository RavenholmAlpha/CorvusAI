import { describe, expect, it } from "vitest";
import { routeProjectRequest } from "../src/project-request-router.js";
const projects=[{id:"alpha-id",name:"Alpha",path:"/work/alpha"},{id:"beta-id",name:"Beta",path:"/work/beta"}];
describe("project request router",()=>{
 it("routes named project analysis",()=>expect(routeProjectRequest("请分析 Alpha 项目",projects)).toMatchObject({kind:"project",project:{id:"alpha-id"}}));
 it("keeps conceptual questions at master",()=>expect(routeProjectRequest("解释事件溯源",projects)).toEqual({kind:"master"}));
 it("clarifies ambiguous aliases",()=>expect(routeProjectRequest("review work repo",[{id:"a",name:"work",path:"/x/work"},{id:"b",name:"other",path:"/y/work"}]).kind).toBe("clarify"));
});
