import fs from 'fs';
import path from 'path';

function findTsFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === 'dist') continue;
    
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
        findTsFiles(fullPath, fileList);
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

  // Find imports pointing to packages/route/src/router back to src/router
  const regex = /(import|export)\s+.*from\s+['"](.*\/packages\/route\/src\/router\/.*)['"]/g;
  let newContent = content.replace(regex, (match, type, capture) => {
    const dir = path.dirname(file);
    const targetPath = path.resolve(dir, capture);
    const targetIsBadRouter = targetPath.includes('/packages/route/src/router/');
    
    if (targetIsBadRouter) {
      const destPath = targetPath.replace('/packages/route/src/router/', '/src/router/');
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
    console.log(`Restored imports in ${file}`);
  }
});
