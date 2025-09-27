// Shared middleware configuration for all API routes
// This reduces bundle size by sharing common dependencies

export const config = {
  // Share common dependencies across functions
  unstable_includeFiles: [
    'lib/**/*.js',
    'node_modules/@libsql/**',
    'node_modules/bcrypt/**'
  ]
};