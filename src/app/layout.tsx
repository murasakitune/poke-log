import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ポケモン対戦ログメーカー",
  description: "選出・勝敗・苦手相手をローカル保存で記録する対戦ログツール",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
