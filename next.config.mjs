/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse ships its own pdf.js build; keep it out of the server bundle
  serverExternalPackages: ['pdf-parse'],
  // Lets phones on the same Wi-Fi open the dev server (http://<mac-ip>:3000)
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*'],
};

export default nextConfig;
