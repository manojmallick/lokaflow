// Single source of truth is vite.config.js — this file re-exports it so that
// tsconfig.node.json can include it without duplicating config.
import config from "./vite.config.js";

export default config;
