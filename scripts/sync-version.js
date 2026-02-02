const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');
const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'src');
const version = pkg.version;

[path.join(srcDir, 'manifest.firefox.json'), path.join(srcDir, 'manifest.chrome.json')].forEach((filePath) => {
  if (!fs.existsSync(filePath)) return;
  const m = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  m.version = version;
  fs.writeFileSync(filePath, JSON.stringify(m, null, 2));
});

const updatesJsonPath = path.join(root, 'updates.json');
if (fs.existsSync(updatesJsonPath)) {
  const data = JSON.parse(fs.readFileSync(updatesJsonPath, 'utf8'));
  if (data.addons && typeof data.addons === 'object') {
    for (const addon of Object.values(data.addons)) {
      if (addon && Array.isArray(addon.updates) && addon.updates.length > 0) {
        addon.updates[0].version = version;
        break;
      }
    }
    fs.writeFileSync(updatesJsonPath, JSON.stringify(data, null, 2));
  }
}

const updatesXmlPath = path.join(root, 'updates.xml');
if (fs.existsSync(updatesXmlPath)) {
  let xml = fs.readFileSync(updatesXmlPath, 'utf8');
  xml = xml.replace(/<\?xml version='[^']*'/, "<?xml version='1.0'");
  xml = xml.replace(/(<updatecheck\s+[^>]*\s)version='[^']*'(\s*\/>)/, "$1version='" + version + "'$2");
  fs.writeFileSync(updatesXmlPath, xml);
}

const changelogPath = path.join(root, 'CHANGELOG.md');
const date = new Date().toISOString().slice(0, 10);
const newEntry = `## [${version}] - ${date}\n- Update details here.\n\n`;

let oldContent;
if (fs.existsSync(changelogPath)) {
  oldContent = fs.readFileSync(changelogPath, 'utf8');
} else {
  oldContent = '# Changelog\n\n';
}

if (!oldContent.includes(`## [${version}]`)) {
  let newContent;
  if (oldContent.startsWith('# Changelog')) {
    const idx = oldContent.indexOf('\n\n');
    if (idx !== -1) {
      newContent = oldContent.slice(0, idx) + '\n\n' + newEntry + oldContent.slice(idx + 2);
    } else {
      newContent = oldContent + '\n\n' + newEntry;
    }
  } else {
    newContent = '# Changelog\n\n' + newEntry + oldContent;
  }
  fs.writeFileSync(changelogPath, newContent);
}
