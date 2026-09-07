import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";
import styles from "./nullain-logo.module.css";

type NullainLogoProps = Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  decorative?: boolean;
};

/**
 * Marca animada da Nullain, com contraste correto em ambos os temas.
 * Respeita a preferência do sistema por movimento reduzido.
 */
export function NullainLogo({ className, decorative = false, ...props }: NullainLogoProps) {
  return (
    <span
      {...props}
      className={cn(styles.root, className)}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Nullain"}
      aria-hidden={decorative || undefined}
    >
      <img
        src="/nullain/logo-light.gif"
        alt=""
        aria-hidden="true"
        className={cn(styles.asset, styles.lightAnimated)}
        loading="eager"
      />
      <img
        src="/nullain/logo-dark.gif"
        alt=""
        aria-hidden="true"
        className={cn(styles.asset, styles.darkAnimated)}
        loading="eager"
      />
      <img
        src="/nullain/logo-light.png"
        alt=""
        aria-hidden="true"
        className={cn(styles.asset, styles.lightStatic)}
        loading="eager"
      />
      <img
        src="/nullain/logo-dark.png"
        alt=""
        aria-hidden="true"
        className={cn(styles.asset, styles.darkStatic)}
        loading="eager"
      />
    </span>
  );
}
