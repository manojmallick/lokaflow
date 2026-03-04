// metro.config.js — pnpm workspace + Expo monorepo setup
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const fs = require("fs");

const workspaceRoot = path.resolve(__dirname, "../..");
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// Watch the monorepo root so Metro can resolve symlinked pnpm packages
config.watchFolders = [workspaceRoot];

// Build nodeModulesPaths: project, workspace root, and every package inside the pnpm virtual store
const pnpmStore = path.resolve(workspaceRoot, "node_modules/.pnpm");
const pnpmPaths = [];
try {
  for (const entry of fs.readdirSync(pnpmStore)) {
    const pkg = path.join(pnpmStore, entry, "node_modules");
    if (fs.existsSync(pkg)) pnpmPaths.push(pkg);
  }
} catch (_) {}

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
  ...pnpmPaths,
];

// pnpm uses symlinks — allow Metro to follow them
config.resolver.unstable_enableSymlinks = true;

// Disable package exports resolution issues with pnpm
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
