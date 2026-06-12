import type { Metadata } from "next";
import { Noto_Sans_TC } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";

const notoSans = Noto_Sans_TC({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "HeroHerb 銷售通路開發系統",
  description: "B2B 名單採集、比對與 CRM 管理系統",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW" className="h-full">
      <body className={`${notoSans.className} h-full`}>
        <div className="flex h-screen">
          <Navigation />
          <main className="flex-1 overflow-auto">
            <div className="p-4 md:p-6 lg:p-8 max-w-7xl">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
