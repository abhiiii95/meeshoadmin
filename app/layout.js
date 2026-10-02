import './globals.css';

export const metadata = {
  title: 'Meesho Admin',
  description: 'Orders, customers and returns from Meesho label PDFs',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
