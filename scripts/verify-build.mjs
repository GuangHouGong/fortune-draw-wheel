import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { error, log } from 'node:console';
import process from 'node:process';
import ts from 'typescript';

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = resolve(process.argv[2] ?? resolve(projectDirectory, 'dist'));
const siteBase = new URL('https://offline-check.invalid/fortune-draw-wheel/');
const requiredArtwork = [
  'mascot-welcome.webp', 'mascot-cheer.webp', 'mascot-celebrate.webp',
  'temple-desktop.webp', 'temple-mobile.webp', 'wheel-frame.png', 'wheel-center.png',
  'pwa-192.png', 'pwa-512.png', 'logo.svg', 'favicon.svg', 'og-image.svg',
].map((name) => `assets/${name}`);

function parseJavaScript(contents, filename) {
  const source = ts.createSourceFile(filename, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (source.parseDiagnostics.length) throw new Error(`${filename} 不是完整可解析的 JavaScript。`);
  return source;
}

function literalString(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
}

function property(node, name) {
  if (!ts.isObjectLiteralExpression(node)) return undefined;
  return node.properties.find((item) => ts.isPropertyAssignment(item)
    && (ts.isIdentifier(item.name) ? item.name.text : literalString(item.name)) === name)?.initializer;
}

/** Read the actual array passed to generated Workbox precache registration. */
function precacheEntries(source) {
  const entries = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      for (const argument of node.arguments) {
        if (!ts.isArrayLiteralExpression(argument) || !argument.elements.length) continue;
        if (!argument.elements.every((entry) => property(entry, 'url')) || !argument.elements.some((entry) => property(entry, 'revision'))) continue;
        for (const entry of argument.elements) {
          const url = literalString(property(entry, 'url'));
          const revisionNode = property(entry, 'revision');
          const revision = revisionNode?.kind === ts.SyntaxKind.NullKeyword ? null : literalString(revisionNode);
          if (!url || (revisionNode && revisionNode.kind !== ts.SyntaxKind.NullKeyword && revision === null)) {
            throw new Error('sw.js 的 precache 清單包含無法驗證的 URL 或 revision，請確認生成格式。');
          }
          entries.push({ url, revision });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!entries.length) throw new Error('sw.js 中找不到實際的 Workbox precache 清單，不能確認離線版本。');
  return entries;
}

function assetPath(rawUrl, parent = siteBase) {
  const url = new URL(rawUrl, parent);
  if (url.origin !== siteBase.origin || !url.pathname.startsWith(siteBase.pathname) || url.search || url.hash) {
    throw new Error(`離線資源超出 GitHub Pages base 或含非預期 URL：${rawUrl}`);
  }
  const path = decodeURIComponent(url.pathname.slice(siteBase.pathname.length));
  const absolute = resolve(buildDirectory, path);
  if (!path || (absolute !== buildDirectory && !absolute.startsWith(`${buildDirectory}${sep}`))) throw new Error(`離線資源路徑不正確：${rawUrl}`);
  return path;
}

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(relative(buildDirectory, path).split(sep).join('/'));
  }
  return files;
}

async function verify() {
  const sw = await readFile(resolve(buildDirectory, 'sw.js'), 'utf8');
  const manifest = precacheEntries(parseJavaScript(sw, 'sw.js'));
  const revisions = new Map();
  const failures = [];
  for (const entry of manifest) {
    const path = assetPath(entry.url);
    const revision = entry.revision || null;
    if (revisions.has(path) && revisions.get(path) !== revision) failures.push(`precache 同 URL revision 衝突：${path}（${revisions.get(path) ?? 'null'} / ${revision ?? 'null'}）`);
    revisions.set(path, revision);
  }
  for (const path of revisions.keys()) {
    try { if (!(await stat(resolve(buildDirectory, path))).isFile()) failures.push(`precache 指向非檔案：${path}`); }
    catch { failures.push(`precache 檔案不存在：${path}`); }
  }
  const requireCached = (path, label) => { if (!revisions.has(path)) failures.push(`${label}未列入 precache：${path}`); };
  requireCached('index.html', '頁面入口');
  requireCached('manifest.webmanifest', 'PWA manifest');
  for (const path of ['index.html', 'manifest.webmanifest']) {
    if (revisions.has(path) && revisions.get(path) === null) failures.push(`固定檔名入口缺少 revision：${path}`);
  }
  for (const path of requiredArtwork) {
    requireCached(path, '主視覺或品牌資源');
    if (revisions.has(path) && revisions.get(path) === null) failures.push(`固定檔名圖片缺少 revision，更新後可能保留舊圖：${path}`);
  }

  const index = await readFile(resolve(buildDirectory, 'index.html'), 'utf8');
  const entryScripts = [...index.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/giu)].map((match) => assetPath(match[1]));
  const entryStyles = [...index.matchAll(/<link\b[^>]*>/giu)].filter((match) => /\brel\s*=\s*["']stylesheet["']/iu.test(match[0])).map((match) => {
    const href = /\bhref\s*=\s*["']([^"']+)["']/iu.exec(match[0]);
    if (!href) throw new Error('index.html stylesheet 缺少 href。');
    return assetPath(href[1]);
  });
  if (!entryScripts.length || !entryStyles.length) failures.push('index.html 缺少必要的 JavaScript 或 CSS 入口。');
  entryScripts.forEach((path) => requireCached(path, '頁面 JavaScript'));
  entryStyles.forEach((path) => requireCached(path, '頁面 CSS'));

  const files = await listFiles(buildDirectory);
  const bundles = files.filter((path) => path.startsWith('assets/') && /\.(?:m?js|css)$/iu.test(path));
  const imports = new Set();
  for (const path of bundles) {
    requireCached(path, '應用程式 bundle');
    if (!/\.m?js$/iu.test(path)) continue;
    const source = parseJavaScript(await readFile(resolve(buildDirectory, path), 'utf8'), path);
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const target = literalString(node.arguments[0]);
        if (!target) failures.push(`${path} 含無法確認離線資源的動態 import。`);
        else imports.add(assetPath(target, new URL(path, siteBase)));
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  let excelChunks = 0;
  for (const path of imports) {
    requireCached(path, 'lazy import');
    try {
      const contents = await readFile(resolve(buildDirectory, path), 'utf8');
      if (contents.includes('xl/workbook.xml')) excelChunks += 1;
    } catch { failures.push(`lazy import 檔案不存在：${path}`); }
  }
  if (!excelChunks) failures.push('找不到已列入 precache 的 lazy Excel 解析 chunk（xl/workbook.xml）。');
  if (failures.length) throw new Error([...new Set(failures)].map((message) => `- ${message}`).join('\n'));
  log(`離線建置檢查通過：${revisions.size} 個 precache 資源、${bundles.length} 個 JS/CSS bundle、${excelChunks} 個 lazy Excel chunk。`);
}

try { await verify(); }
catch (cause) { error(`離線建置檢查失敗：\n${cause instanceof Error ? cause.message : cause}`); process.exitCode = 1; }
