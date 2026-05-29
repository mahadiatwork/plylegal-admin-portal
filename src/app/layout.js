import "./globals.css";

export const metadata = {
  title: "ValidifyPro Admin Portal",
  description: "Read-only access to matter questionnaire, documents, and messages.",
  icons: {
    icon: "https://cdn.prod.website-files.com/68df275416b515842035785c/68f9a3861f1f134bb950ee93_Favicon.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
