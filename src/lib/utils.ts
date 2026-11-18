import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function money(value: number) { return new Intl.NumberFormat("en-KW", { style:"currency", currency:"KWD", maximumFractionDigits:0 }).format(value); }
export function digits(value: string) { return value.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))); }
export function normalizeArabic(value: string) { return value.replace(/[أإآ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").trim(); }
