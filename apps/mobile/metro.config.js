// metro.config.js — pnpm workspace + Expo monorepo setup
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "../..");
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// Watch the monorepo root so Metro can resolve symlinked pnpm packages
config.watchFolders = [workspaceRoot];

// Build nodeModulesPaths: project and workspace root only.
// unstable_enableSymlinks (below) lets Metro follow the pnpm symlinks
// automatically, so we don't need to enumerate node_modules/.pnpm.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// pnpm uses symlinks — allow Metro to follow them
config.resolver.unstable_enableSymlinks = true;

// Disable package exports resolution issues with pnpm
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
