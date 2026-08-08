const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlCssDir = path.join(root, 'html', 'css');
const htmlJsDir = path.join(root, 'html', 'js');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) {
    return;
  }

  ensureDir(destDir);

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  entries.forEach((entry) => {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
      return;
    }

    fs.copyFileSync(srcPath, destPath);
  });
}

function copyWebsiteJs() {
  const sourceJsDir = path.join(root, 'js');
  const entries = fs.readdirSync(sourceJsDir, { withFileTypes: true });

  entries.forEach((entry) => {
    const srcPath = path.join(sourceJsDir, entry.name);
    const destPath = path.join(htmlJsDir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'vendor') {
        copyDir(srcPath, destPath);
      }
      return;
    }

    if (!entry.name.endsWith('.js')) {
      return;
    }

    if (entry.name === 'server.js' || entry.name.endsWith('.test.js')) {
      return;
    }

    fs.copyFileSync(srcPath, destPath);
  });
}

function main() {
  cleanDir(htmlCssDir);
  cleanDir(htmlJsDir);

  copyDir(path.join(root, 'css'), htmlCssDir);
  copyWebsiteJs();

  console.log('Synced website assets to html/css and html/js.');
}

main();
