import type { WebState } from "../types";
import { defineTranslations, useI18n } from "../i18n";

defineTranslations({
  "page.reload": { en: "Reload", "zh-CN": "重新加载" },
  "page.toggleSidebar": { en: "Toggle navigation menu", "zh-CN": "切换导航菜单" },
});

/** Shared page-localization hook keeps page copy on the authored dictionaries. */
export const usePageI18n = useI18n;
export interface PageProps {
  state: WebState;
  reload: () => Promise<void>;
  onToggleSidebar?: () => void;
}