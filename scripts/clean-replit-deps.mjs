import { readFileSync, writeFileSync, existsSync } from 'fs';

const wsFile = 'pnpm-workspace.yaml';
if (!existsSync(wsFile)) process.exit(0);

const y = readFileSync(wsFile, 'utf8');
const lines = y.split('\n');
const out = [];
let skip = false;
const blockHeaders = ['overrides:', 'onlyBuiltDependencies:', 'minimumReleaseAgeExclude:'];
const lineHeaders = ['minimumReleaseAge:'];
const catalogDel = [
  '@replit/vite-plugin-cartographer',
  '@replit/vite-plugin-dev-banner',
  '@replit/vite-plugin-runtime-error-modal',
];

for (const line of lines) {
  if (blockHeaders.some((h) => line.startsWith(h))) {
    skip = true;
    continue;
  }
  if (lineHeaders.some((h) => line.startsWith(h))) {
    continue;
  }
  if (skip) {
    if (line === '' || /^\s/.test(line)) continue;
    skip = false;
  }
  if (catalogDel.some((c) => line.includes(c))) continue;
  out.push(line);
}

let cleaned = out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
writeFileSync(wsFile, cleaned);
console.log('pnpm-workspace.yaml cleaned');

const rootPkg = 'package.json';
if (existsSync(rootPkg)) {
  let pkg = JSON.parse(readFileSync(rootPkg, 'utf8'));
  if (pkg.dependencies) delete pkg.dependencies['@replit/connectors-sdk'];
  writeFileSync(rootPkg, JSON.stringify(pkg, null, 2) + '\n');
  console.log('package.json cleaned');
}

const vpnPkg = 'artifacts/vpn-panel/package.json';
if (existsSync(vpnPkg)) {
  let pkg = JSON.parse(readFileSync(vpnPkg, 'utf8'));
  const replitDeps = [
    '@replit/vite-plugin-cartographer',
    '@replit/vite-plugin-dev-banner',
    '@replit/vite-plugin-runtime-error-modal',
  ];
  for (const d of replitDeps) {
    if (pkg.dependencies) delete pkg.dependencies[d];
    if (pkg.devDependencies) delete pkg.devDependencies[d];
  }
  writeFileSync(vpnPkg, JSON.stringify(pkg, null, 2) + '\n');
  console.log('vpn-panel/package.json cleaned');
}
