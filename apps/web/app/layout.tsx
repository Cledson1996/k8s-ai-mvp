import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { AppShell } from "../components/app-shell";
import "./globals.css";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading"
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"]
});

export const metadata: Metadata = {
  title: "K8s AI MVP",
  description: "Local copiloto de observabilidade e diagnostico para Kubernetes."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${headingFont.variable} ${monoFont.variable} font-sans antialiased`}
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
