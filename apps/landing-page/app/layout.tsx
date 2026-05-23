import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import React from "react";
import { PostHogAnalytics } from "./PostHogAnalytics";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Zapper | The process manager for agents",
  description:
    "Declarative, stateful, isolated per worktree. Native processes and Docker containers, one yaml, one CLI.",
  icons: {
    icon: [
      {
        url: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj4KICA8dGV4dCB5PSI3NSIgZm9udC1zaXplPSI4MCI+4pqh77iPPC90ZXh0Pgo8L3N2Zz4=",
        type: "image/svg+xml",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} antialiased`}>
        <PostHogAnalytics />
        {children}
      </body>
    </html>
  );
}
