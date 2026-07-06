// Expo's metro-config detects pnpm monorepos since SDK 52; the explicit
// watchFolders keeps hot reload watching the workspace packages' dist output.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];

module.exports = config;
