import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function formatRelativeTime(date: Date | string | number): string {
  const d = new Date(date);
  const now = Date.now();
  const diff = now - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;
  return `${Math.floor(days / 30)}个月前`;
}

export function formatAbsoluteTime(date: Date | string | number): string {
  return new Date(date).toLocaleString();
}

export function truncateMiddle(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  const head = Math.ceil((maxLen - 3) / 2);
  const tail = Math.floor((maxLen - 3) / 2);
  return str.slice(0, head) + "..." + str.slice(str.length - tail);
}