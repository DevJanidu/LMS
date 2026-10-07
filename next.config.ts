import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import bundleAnalyzer from "@next/bundle-analyzer";

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
  logging: { incomingRequests: false, serverFunctions: false, browserToTerminal: false },
  // Isolate browser-test builds from a developer's running server.
  distDir: process.env.PLAYWRIGHT_ISOLATED_BUILD === "1" ? ".next-playwright" : ".next",
  async headers() {
    const storage = process.env.OBJECT_STORAGE_ENDPOINT;
    let storageOrigin = "";
    if (storage) {
      try { storageOrigin = new URL(storage).origin; }
      catch { throw new Error("Invalid OBJECT_STORAGE_ENDPOINT configuration."); }
    }
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://i.ytimg.com; font-src 'self'; connect-src 'self' ${storageOrigin}${process.env.NODE_ENV === "development" ? " ws: wss:" : ""}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    ] }];
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
