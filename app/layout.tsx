import type { Metadata } from "next";
import { Noto_Sans_TC } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const notoSans = Noto_Sans_TC({ subsets: ["latin"], weight: ["400", "500", "700"] });

export const metadata: Metadata = {
  title: "HeroHerb 通路開發系統",
  description: "B2B 名單採集、比對與 CRM 管理系統",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <body className={notoSans.className}>
        <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
          <div className="d-only" style={{ display: "flex" }}>
            <Sidebar />
          </div>
          <main
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              minWidth: 0,
            }}
          >
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
