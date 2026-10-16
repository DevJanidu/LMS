import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import bundleAnalyzer from "@next/bundle-analyzer";
import { contentSecurityPolicy, storageOriginFrom } from "./src/lib/security/csp";

const withNextIntl = createNextIntlPlugin();
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true", openAnalyzer: false });
// Keep the coordinate system when CSS scales icons below their source dimensions.
const svgLoaderOptions = {
  dimensions: false,
  svgoConfig: {
    plugins: [
      {
        name: "preset-default",
        params: { overrides: { removeViewBox: false } },
      },
    ],
  },
};

const nextConfig: NextConfig = {
  // Keep each deployment's navigation, assets and action references together.
  deploymentId: process.env.NEXT_DEPLOYMENT_ID || process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || undefined,
  experimental: { staleTimes: { dynamic: 0, static: 180 } },
  logging: { incomingRequests: false, serverFunctions: false, browserToTerminal: false },
  // Isolate browser-test builds from a developer's running server.
  distDir: process.env.PLAYWRIGHT_ISOLATED_BUILD === "1" ? ".next-playwright" : ".next",
  async headers() {
    // Baseline policy. src/proxy.ts replaces it with a nonce-based policy on
    // dynamically rendered (signed-in and sign-in) routes.
    const policy = contentSecurityPolicy({ storageOrigin: storageOriginFrom(process.env.OBJECT_STORAGE_ENDPOINT), development: process.env.NODE_ENV === "development" });
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: policy },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    ] }, ...["/reset-password", "/:locale/reset-password"].map(source => ({ source, headers: [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "private, no-store" },
    ] }))];
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: [{ loader: "@svgr/webpack", options: svgLoaderOptions }],
    });
    return config;
  },
  images: {
    formats: ["image/avif", "image/webp"],
    localPatterns: [
      {
        pathname: "/**",
      },
    ],
  },
  turbopack: {
    root: __dirname,
    rules: {
      "*.svg": {
        loaders: [{ loader: "@svgr/webpack", options: svgLoaderOptions }],
        as: "*.js",
      },
    },
  },
};

export default withBundleAnalyzer(withNextIntl(nextConfig));
