import fs from 'fs';
import path from 'path';

function findTsFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === 'dist' || file === 'packages/route') continue;

    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      // Don't go into packages/route
      if (!fullPath.includes('packages/route')) {
        findTsFiles(fullPath, fileList);
      }
    } else if (fullPath.endsWith('.ts')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const allTsFiles = [
  ...findTsFiles('src'),
  ...findTsFiles('packages'),
  ...findTsFiles('tests')
];

allTsFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // We are looking for any import or export that contains "/router/"
  // and we will dynamically resolve it
  const regex = /(import|export)\s+.*from\s+['"](.*\/router\/.*)['"]/g;
  let newContent = content.replace(regex, (match, type, capture) => {
    const dir = path.dirname(file);
    const targetPath = path.resolve(dir, capture);
    const targetIsRouter = targetPath.includes('/src/router/');

    if (targetIsRouter) {
      // It points to the old src/router, re-route to packages/route/src/router
      const destPath = targetPath.replace('/src/router/', '/packages/route/src/router/');
      let newRel = path.relative(dir, destPath);
      if (!newRel.startsWith('.')) newRel = './' + newRel;

      changed = true;
      let repl = match.replace(capture, newRel);
      return repl;
    }
    return match;
  });

  if (changed) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Updated imports in ${file}`);
  }
});
