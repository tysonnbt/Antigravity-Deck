import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#09090b', // matches dark background
};

export const metadata: Metadata = {
  title: "Antigravity Deck",
  description: "Real-time Antigravity conversation mirror",
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Antigravity Deck',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <SidebarProvider>
          <TooltipProvider delayDuration={200}>
            {children}
          </TooltipProvider>
        </SidebarProvider>
      </body>
    </html>
  );
}
