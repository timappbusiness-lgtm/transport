import type { NextConfig } from 'next';

// Vercel sets this at build time. The release pipeline reads it back from
// production to know when the deployment it asked for is the one serving.
const commit = process.env.VERCEL_GIT_COMMIT_SHA;

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
  async headers() {
    if (!commit) return [];
    return [{ source: '/:path*', headers: [{ key: 'x-coridor-commit', value: commit }] }];
  },
};

export default nextConfig;
