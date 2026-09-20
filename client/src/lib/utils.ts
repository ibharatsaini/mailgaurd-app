import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function statusColor(status: string): string {
  switch (status) {
    case "HEALTHY":
    case "PASS":
      return "text-healthy";
    case "WARNING":
    case "WARN":
      return "text-warning";
    case "CRITICAL":
    case "FAIL":
      return "text-critical";
    default:
      return "text-ink-muted";
  }
}
