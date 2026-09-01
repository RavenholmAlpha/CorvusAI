import React from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { defineTranslations, I18nProvider, useI18n } from "./i18n";
defineTranslations({"test.greeting":{en:"Welcome","zh-CN":"欢迎"}});
function Probe(){const{locale,setLocale,t}=useI18n();return <><span>{t("test.greeting")}</span><button onClick={()=>setLocale(locale==="en"?"zh-CN":"en")}>switch</button></>}
describe("WebUI localization",()=>{
 it("uses authored locale dictionaries and switches at runtime",()=>{const view=render(<I18nProvider><Probe/></I18nProvider>);expect(screen.getByText("Welcome")).toBeTruthy();fireEvent.click(screen.getByRole("button"));expect(screen.getByText("欢迎")).toBeTruthy();view.unmount()});
 it("falls back to authored English and preserves unknown technical keys",()=>{function F(){const{t}=useI18n();return <span>{t("unknown.protocol.openai-chat")}</span>}render(<I18nProvider initialLocale="zh-CN"><F/></I18nProvider>);expect(screen.getByText("unknown.protocol.openai-chat")).toBeTruthy()});
});
