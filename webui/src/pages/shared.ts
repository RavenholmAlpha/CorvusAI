import type { WebState } from "../types";
export interface PageProps {
  state: WebState;
  reload: () => Promise<void>;
  onToggleSidebar?: () => void;
}