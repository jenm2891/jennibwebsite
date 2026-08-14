const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');

function resetDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureDir(dirPath) {
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

function copyHtml() {
  // CHANGED: Now looks for HTML files directly in the root folder
  // and copies them directly into the root of the dist bundle!
  const entries = fs.readdirSync(root, { withFileTypes: true });
  
  entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .forEach((entry) => {
      fs.copyFileSync(
        path.join(root, entry.name),
        path.join(distDir, entry.name)
      );
    });
}

function copyClientJs() {
  const srcJsDir = path.join(root, 'js');
  const destJsDir = path.join(distDir, 'js');

  ensureDir(destJsDir);

  const entries = fs.readdirSync(srcJsDir, { withFileTypes: true });

  entries.forEach((entry) => {
    const srcPath = path.join(srcJsDir, entry.name);
    const destPath = path.join(destJsDir, entry.name);

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
  resetDir(distDir);

  copyHtml();
  copyDir(path.join(root, 'css'), path.join(distDir, 'css'));
  copyClientJs();
  copyDir(path.join(root, 'images'), path.join(distDir, 'images'));
  
  // Safely copy robots and sitemap if they exist
  if (fs.existsSync(path.join(root, 'robots.txt'))) {
    fs.copyFileSync(path.join(root, 'robots.txt'), path.join(distDir, 'robots.txt'));
  }
  if (fs.existsSync(path.join(root, 'sitemap.xml'))) {
    fs.copyFileSync(path.join(root, 'sitemap.xml'), path.join(distDir, 'sitemap.xml'));
  }

  console.log('Static deploy bundle generated at dist/.');
}

main();