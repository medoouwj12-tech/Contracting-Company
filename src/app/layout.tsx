import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title:"عقار | إدارة العقارات والعملاء", description:"منصة ذكية لإدارة العقارات والعملاء في الكويت" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ar" dir="rtl" suppressHydrationWarning><body>{children}</body></html>; }
