// Déclaration minimale des fonctions de react-dom utilisées par l’appli (pas de @types/react-dom installé).
declare module "react-dom" {
  import type { ReactNode, ReactPortal } from "react";
  export function createPortal(children: ReactNode, container: Element | DocumentFragment, key?: string | null): ReactPortal;
  export function flushSync<R>(fn: () => R): R;
}
