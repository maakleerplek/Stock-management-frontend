import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** InvenTree names use underscores ("4mm_120x60cm_MDF"); show them with spaces. */
export const displayName = (name: string) => name.replace(/_/g, ' ');
