import type { Metadata } from "next";
import { Geist, Noto_Naskh_Arabic } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const notoNaskh = Noto_Naskh_Arabic({
  variable: "--font-urdu",
  subsets: ["arabic"],
});

export const metadata: Metadata = {
  title: "Safe AI Parenting Coach",
  description:
    "Short, practical, non-judgmental parenting guidance in English or Urdu, with safety screening.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${notoNaskh.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
