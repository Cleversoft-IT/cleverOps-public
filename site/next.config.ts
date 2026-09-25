import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Il sito vive in cleverOps/site ma legge i manifest in ../skills a build time
  // (vedi scripts/generate-skills.mjs, eseguito da prebuild/predev).
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
