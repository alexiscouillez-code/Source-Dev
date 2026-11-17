import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

type Props<T extends ElementType> = {
  /** Variante mise en avant : bleu saturé au lieu du verre translucide. */
  accent?: boolean;
  /** Carte imbriquée dans une autre : rayon et marges plus petits. */
  inner?: boolean;
  as?: T;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

/**
 * Carte en verre dépoli (style « nuit ») : fond blanc translucide, flou de l'arrière-plan, bordure fine et halo interne.
 * Sans support du flou, le navigateur affiche un fond violet opaque (voir night.css).
 */
export default function GlassCard<T extends ElementType = "div">({ accent, inner, as, className = "", children, ...rest }: Props<T>) {
  const Tag = (as ?? "div") as ElementType;
  return <Tag className={`glass${accent ? " glass-accent" : ""}${inner ? " glass-inner" : ""} ${className}`.trim()} {...rest}>{children}</Tag>;
}
