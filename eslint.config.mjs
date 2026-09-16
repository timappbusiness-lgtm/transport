import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'design/**',
      'supabase/**',
      'public/**',
      'next-env.d.ts',
      'src/lib/supabase/database.types.ts',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  ...coreWebVitals,
  ...nextTypescript,
];

export default config;
