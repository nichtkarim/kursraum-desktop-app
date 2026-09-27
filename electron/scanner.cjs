const fs = require('node:fs/promises');
const path = require('node:path');

const relPath = value => value.split(path.sep).join('/');
const isInside = (root, target) => {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};
function fileKind(name) {
  const extension = path.extname(name).toLocaleLowerCase('de');
  if (extension === '.pdf') return 'pdf';
  if (extension === '.md' || extension === '.markdown') return 'markdown';
  if (extension === '.txt') return 'text';
  if (extension === '.docx') return 'docx';
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension)) return 'image';
  if (['.mp4', '.webm', '.m4v', '.ogv'].includes(extension)) return 'video';
  return 'other';
}

async function scanTree(root, onProgress = () => {}, cancelled = () => false, start = root) {
  const dirs = new Set();
  const files = new Map();
  const stack = [start];
  let inspected = 0;
  while (stack.length) {
    if (cancelled()) throw new Error('SCAN_CANCELLED');
    const absoluteDir = stack.pop();
    let realDir;
    try { realDir = await fs.realpath(absoluteDir); } catch (error) {
      if (['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) continue;
      throw error;
    }
    if (!isInside(root, realDir)) continue;
    try { if (absoluteDir !== root && (await fs.lstat(absoluteDir)).isSymbolicLink()) continue; }
    catch (error) { if (['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) continue; throw error; }
    const dirRel = relPath(path.relative(root, absoluteDir));
    dirs.add(dirRel);
    let handle;
    try { handle = await fs.opendir(absoluteDir); } catch (error) {
      if (['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) continue;
      throw error;
    }
    try {
      for await (const entry of handle) {
        if (cancelled()) throw new Error('SCAN_CANCELLED');
        if (entry.isSymbolicLink() || entry.name.startsWith('.kursraum-sync-')) continue;
        const absolute = path.join(absoluteDir, entry.name);
        if (entry.isDirectory()) {
          stack.push(absolute);
        } else if (entry.isFile()) {
          try {
            const stat = await fs.lstat(absolute);
            if (!stat.isFile()) continue;
            const relative = relPath(path.relative(root, absolute));
            files.set(relative, { relative, name: entry.name, size: stat.size, modified: stat.mtimeMs, kind: fileKind(entry.name) });
          } catch (error) {
            if (!['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) throw error;
          }
        }
        inspected++;
        if (inspected % 120 === 0) {
          onProgress({ files: files.size, folders: dirs.size, current: dirRel });
          await new Promise(resolve => setImmediate(resolve));
        }
      }
    } finally {
      // for-await closes its handle; a second close would throw ERR_DIR_CLOSED.
    }
  }
  onProgress({ files: files.size, folders: dirs.size, current: '' });
  return { dirs, files };
}

module.exports = { scanTree, fileKind, isInside, relPath };
