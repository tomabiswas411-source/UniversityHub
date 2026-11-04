import type { Metadata, Viewport } from "next";
import { Inter, Fraunces, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { PwaProvider } from "@/components/shared/pwa-provider";

const inter = Inter({
 variable: "--font-inter",
 subsets: ["latin"],
 display: "swap",
});

const fraunces = Fraunces({
 variable: "--font-fraunces",
 subsets: ["latin"],
 display: "swap",
});

const geistMono = Geist_Mono({
 variable: "--font-geist-mono",
 subsets: ["latin"],
});

export const metadata: Metadata = {
 title: "UniversityHub — University Management System",
 description:
 "One platform for every department — class routines, notices, assignments, results and real-time notifications. Multi-university PWA management system.",
 keywords: [
 "university management",
 "class routine",
 "department",
 "academic",
 "PWA",
 ],
 manifest: "/manifest.json",
 applicationName: "UniversityHub",
 icons: {
 icon: [
 { url: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png" },
 { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
 ],
 apple: "/icons/apple-touch-icon.png",
 },
 appleWebApp: {
 capable: true,
 statusBarStyle: "default",
 title: "UniversityHub",
 },
 openGraph: {
 title: "UniversityHub — University Management System",
 description:
 "Routines, notices, assignments, results & real-time notifications for every department — installed as an app.",
 type: "website",
 images: ["/icons/icon-512x512.png"],
 },
};

export const viewport: Viewport = {
 width: "device-width",
 initialScale: 1,
 // No maximumScale — pinch-zoom must stay available (accessibility).
 viewportFit: "cover", // Day 47 — respect notches / home-indicator safe areas
 themeColor: "#241C15",
};

export default function RootLayout({
 children,
}: Readonly<{
 children: React.ReactNode;
}>) {
 return (
 <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
 <body
 className={`${inter.variable} ${fraunces.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
 >
 <ThemeProvider>
 {children}
 <Toaster />
 <PwaProvider />
 </ThemeProvider>
 </body>
 </html>
 );
}
