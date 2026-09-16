import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 16 writes its own CLAUDE.md and AGENTS.md on dev. CLAUDE.md is the
  // team's working agreement and is authored by hand, so Next must not
  // clobber it.
  agentRules: false,
  // Fail the production build on a type error rather than shipping it.
  // Next 16 dropped the `eslint` build key; linting runs as its own
  // script and in CI.
  typescript: { ignoreBuildErrors: false },
  async rewrites() {
    // The approved design reference, served as a static page at a clean URL.
    // It is a standalone document, not a React route - it stays in public/
    // until the real homepage replaces it.
    return [{ source: '/demo', destination: '/demo.html' }];
  },
};

export default nextConfig;
