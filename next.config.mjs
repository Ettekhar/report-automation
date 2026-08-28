import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Required for local next dev to initialize Cloudflare bindings (D1)
initOpenNextCloudflareForDev();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
};

export default nextConfig;
