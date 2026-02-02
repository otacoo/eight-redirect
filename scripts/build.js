/**
 * Build extension into dist/:
 * - dist/chrome/   – unzipped Chrome extension (Load unpacked)
 * - dist/firefox/  – unzipped Firefox extension (Load Temporary Add-on)
 * - dist/signed-xpi/ – folder for manually adding signed .xpi (not written by build)
 * - dist/*.zip     – chrome zip and firefox zip
 * - dist/*.crx     – Chrome package (root of dist)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'src');
const distDir = path.join(root, 'dist');
const distChrome = path.join(distDir, 'chrome');
const distFirefox = path.join(distDir, 'firefox');
const signedXpiDir = path.join(distDir, 'signed-xpi');

const EXT_FILES = [
  { zipName: 'src/background.js', diskPath: path.join(srcDir, 'background.js') },
  { zipName: 'src/check.html', diskPath: path.join(srcDir, 'check.html') },
  { zipName: 'src/check.js', diskPath: path.join(srcDir, 'check.js') },
  { zipName: 'src/content.js', diskPath: path.join(srcDir, 'content.js') },
  { zipName: 'src/options.html', diskPath: path.join(srcDir, 'options.html') },
  { zipName: 'src/options.js', diskPath: path.join(srcDir, 'options.js') },
  { zipName: 'src/popup.html', diskPath: path.join(srcDir, 'popup.html') },
  { zipName: 'src/popup.js', diskPath: path.join(srcDir, 'popup.js') },
];
const srcIconsDir = path.join(srcDir, 'icons');

const pkg = require(path.join(root, 'package.json'));
const baseName = 'eight-redirect';
const version = (pkg.version || '1.0.0').replace(/\./g, '-');
const crxName = `${baseName}.crx`;
const chromeZipName = `${baseName}-chrome.zip`;
const firefoxZipName = `${baseName}-firefox.zip`;

const onlyFirefox = process.argv.includes('--firefox');
const onlyChrome = process.argv.includes('--chrome');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyToDir(destDir, manifestPath) {
  ensureDir(destDir);
  fs.copyFileSync(manifestPath, path.join(destDir, 'manifest.json'));
  ensureDir(path.join(destDir, 'src'));
  for (const { zipName, diskPath } of EXT_FILES) {
    if (fs.existsSync(diskPath)) {
      fs.copyFileSync(diskPath, path.join(destDir, zipName));
    }
  }
  const destIcons = path.join(destDir, 'src', 'icons');
  ensureDir(destIcons);
  if (fs.existsSync(srcIconsDir)) {
    for (const name of fs.readdirSync(srcIconsDir)) {
      const full = path.join(srcIconsDir, name);
      if (fs.statSync(full).isFile() && !name.startsWith('.')) {
        fs.copyFileSync(full, path.join(destIcons, name));
      }
    }
  }
}

function zipDirectory(dirPath, outZipPath) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(outZipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    out.on('close', () => resolve());
    archive.on('error', reject);
    archive.pipe(out);
    archive.directory(dirPath, false);
    archive.finalize();
  });
}

function buildFirefox() {
  ensureDir(distDir);
  ensureDir(distFirefox);
  ensureDir(signedXpiDir);
  if (fs.existsSync(distFirefox)) {
    fs.rmSync(distFirefox, { recursive: true });
  }
  fs.mkdirSync(distFirefox, { recursive: true });

  copyToDir(distFirefox, path.join(srcDir, 'manifest.firefox.json'));
  console.log('Firefox (unzipped): ' + distFirefox);
  return Promise.resolve();
}

function buildChrome() {
  ensureDir(distDir);
  ensureDir(distChrome);
  if (fs.existsSync(distChrome)) {
    fs.rmSync(distChrome, { recursive: true });
  }
  fs.mkdirSync(distChrome, { recursive: true });

  copyToDir(distChrome, path.join(srcDir, 'manifest.chrome.json'));

  ensureDir(distDir);
  const keyPath = path.join(distDir, 'key.pem');
  if (!fs.existsSync(keyPath)) {
    console.log('Generating signing key (one-time): dist/key.pem');
    execSync('npx crx keygen "' + distDir + '"', { stdio: 'inherit', cwd: root });
  }

  const crxPath = path.join(distDir, crxName);
  execSync('npx crx pack "' + distChrome + '" -p "' + keyPath + '" -o "' + crxPath + '"', {
    stdio: 'inherit',
    cwd: root,
  });
  console.log('Chrome (unzipped): ' + distChrome);
  console.log('Chrome (.crx): ' + crxPath);
}

function buildZips() {
  const tasks = [];
  if (!onlyFirefox) {
    tasks.push(
      zipDirectory(distChrome, path.join(distDir, chromeZipName)).then(() => {
        console.log('Chrome zip: ' + path.join(distDir, chromeZipName));
      })
    );
  }
  if (!onlyChrome) {
    tasks.push(
      zipDirectory(distFirefox, path.join(distDir, firefoxZipName)).then(() => {
        console.log('Firefox zip: ' + path.join(distDir, firefoxZipName));
      })
    );
  }
  return Promise.all(tasks);
}

function run() {
  let chain = Promise.resolve();
  if (!onlyChrome) {
    chain = chain.then(() => buildFirefox());
  }
  if (!onlyFirefox) {
    chain = chain.then(() => buildChrome());
  }
  chain = chain.then(() => buildZips());
  return chain;
}

run()
  .then(() => console.log('Done.'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
