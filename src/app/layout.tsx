import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Moda Interact Admin",
  description: "Platform operations console for Moda Interact",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
