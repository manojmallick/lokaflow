import fs from "fs";
import path from "path";

function findTsFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === "node_modules" || file === "dist") continue;

    const fullPath = path.join(dir, file);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue; // skip unreadable paths or broken symlinks
    }
    if (stat.isDirectory()) {
      findTsFiles(fullPath, fileList);
    } else if ([".ts", ".tsx", ".mts", ".cts"].some((ext) => fullPath.endsWith(ext))) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const allTsFiles = [...findTsFiles("src"), ...findTsFiles("packages"), ...findTsFiles("tests")];

allTsFiles.forEach((file) => {
  try {
    let content = fs.readFileSync(file, "utf8");
    let changed = false;

    // Find imports pointing to packages/route/src/router back to src/router
    const regex = /(import|export)\s+.*from\s+['"](.*\/packages\/route\/src\/router\/.*)['"]/g;
    let newContent = content.replace(regex, (match, type, capture) => {
      const dir = path.dirname(file);
      const targetPath = path.resolve(dir, capture);
      const normalizedTargetPath = targetPath.split(path.sep).join("/");
      const targetIsBadRouter = normalizedTargetPath.includes("/packages/route/src/router/");

      if (targetIsBadRouter) {
        const normalizedDestPath = normalizedTargetPath.replace(
          "/packages/route/src/router/",
          "/src/router/",
        );
        const destPath = normalizedDestPath.split("/").join(path.sep);
        let newRel = path.relative(dir, destPath);
        newRel = newRel.split(path.sep).join("/"); // normalise to POSIX separators for import specifiers
        if (!newRel.startsWith(".")) newRel = "./" + newRel;

        changed = true;
        let repl = match.replace(capture, newRel);
        return repl;
      }
      return match;
    });

    if (changed) {
      fs.writeFileSync(file, newContent, "utf8");
      console.log(`Restored imports in ${file}`);
    }
  } catch (err) {
    console.error(`Failed to process ${file}:`, err);
  }
});
