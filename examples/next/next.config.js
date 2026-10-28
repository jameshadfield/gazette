/** @type {import('next').NextConfig} */
const nextConfig = {
  // The gazette companion components live in ../../runtime/next (outside this
  // example app). externalDir lets Next compile them through its own loader.
  // In a real project you would instead import them from the installed
  // `gazette` package (e.g. `import { GazettePaper } from "gazette/next"`) or
  // copy runtime/next/ into your app, and this flag would be unnecessary.
  experimental: {
    externalDir: true,
  },
};

module.exports = nextConfig;
