import { describe, expect, it } from "vitest";
import { assertSafeUrl, isPrivateAddress } from "../src/network-policy.js";
describe("network policy",()=>{
 it("detects private IPv4 and IPv6 ranges",()=>{expect(isPrivateAddress("127.0.0.1")).toBe(true);expect(isPrivateAddress("192.168.1.2")).toBe(true);expect(isPrivateAddress("::1")).toBe(true);expect(isPrivateAddress("8.8.8.8")).toBe(false)});
 it("rejects local, credentialed and non-http URLs before DNS",async()=>{await expect(assertSafeUrl("http://localhost/admin")).rejects.toThrow("Private network");await expect(assertSafeUrl("http://user:pass@example.com")).rejects.toThrow("credentials");await expect(assertSafeUrl("file:///etc/passwd")).rejects.toThrow("HTTP")});
});
