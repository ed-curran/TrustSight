import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json';

// Convert from Semver (example: 0.1.0-beta6)
const [major, minor, patch, label = '0'] = pkg.version
  // can only contain digits, dots, or dash
  .replace(/[^\d.-]+/g, '')
  // split into version parts
  .split(/[.-]/)

export default defineManifest(async (env) => ({
  manifest_version: 3,
  name: pkg.displayName,
  description: pkg.description,
  // up to four numbers separated by dots
  version: `${major}.${minor}.${patch}.${label}`,
  // semver is OK in "version_name"
  version_name: pkg.version,
  options_ui: {
    page: 'src/pages/options/index.html',
  },
  background: {
    service_worker: 'src/pages/background/index.ts',
    type: 'module',
  },
  action: {
    default_popup: 'src/pages/popup/index.html',
    default_icon: 'question-mark-circled-32.png',
  },
  chrome_url_overrides: {},
  icons: {
    '128': 'icon-128.png',
  },
  permissions: ['activeTab', 'scripting', 'storage', 'alarms'],
  optional_permissions: ["tabs"],
  web_accessible_resources: [
    {
      resources: [
        'icon-128.png',
        'icon-32.png',
        'badge.png',
        'badge-alert.png',
        'badge-check.png',
      ],
      matches: [],
    },
  ],
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
  }
}))