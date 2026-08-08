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
  const srcHtmlDir = path.join(root, 'html');
  const destHtmlDir = path.join(distDir, 'html');

  ensureDir(destHtmlDir);

  const entries = fs.readdirSync(srcHtmlDir, { withFileTypes: true });
  entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .forEach((entry) => {
      fs.copyFileSync(
        path.join(srcHtmlDir, entry.name),
        path.join(destHtmlDir, entry.name)
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

function writeRootIndexRedirect() {
  const redirectHtml = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta http-equiv="refresh" content="0; url=html/index.html">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <title>JenniB</title>',
    '</head>',
    '<body>',
    '  <p>Redirecting to <a href="html/index.html">html/index.html</a>...</p>',
    '</body>',
    '</html>'
  ].join('\n');

  fs.writeFileSync(path.join(distDir, 'index.html'), redirectHtml, 'utf8');
}

function main() {
  resetDir(distDir);

  copyHtml();
  copyDir(path.join(root, 'css'), path.join(distDir, 'css'));
  copyClientJs();
  copyDir(path.join(root, 'images'), path.join(distDir, 'images'));

  writeRootIndexRedirect();

  console.log('Static deploy bundle generated at dist/.');
}

main();
