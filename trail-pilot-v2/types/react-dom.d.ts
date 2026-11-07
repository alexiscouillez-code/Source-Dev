// Déclaration minimale : seul createPortal est utilisé (components/app/InfoTip.tsx).
declare module "react-dom" {
  import type { ReactNode, ReactPortal } from "react";
  export function createPortal(children: ReactNode, container: Element | DocumentFragment, key?: string | null): ReactPortal;
}
