import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Khalese Lab Helper — In Runx-1 We Trust",
  description: "AI-powered biomedical research assistant. Literature review, hypothesis generation, and publication-ready papers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="dna-bg">
        <div style={{ position: "relative", zIndex: 1, minHeight: "100vh" }}>
          {children}
        </div>
      </body>
    </html>
  );
}
