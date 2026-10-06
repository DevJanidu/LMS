import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();
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
  /* config options here */
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: [{ loader: "@svgr/webpack", options: svgLoaderOptions }],
    });
    return config;
  },
  images: {
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

export default withNextIntl(nextConfig);
