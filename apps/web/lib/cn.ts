import clsx, { type ClassValue } from "clsx";

/** Class-name joiner. Tailwind classes here are token-backed, so no merge step. */
export const cn = (...classes: ClassValue[]): string => clsx(classes);
