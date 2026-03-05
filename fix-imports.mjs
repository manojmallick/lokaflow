import fs from "fs";
import path from "path";

function findTsFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    // Compute fullPath first so exclusion comparisons are path-based and consistent.
    const fullPath = path.join(dir, file);
    // Normalise to forward-slashes so the check works on Windows too (where
    // path.join returns back-slash separated paths).
    const normalizedFullPath = fullPath.split(path.sep).join("/");
    if (file === "node_modules" || file === "dist" || normalizedFullPath.includes("packages/route"))
      continue;

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
  let content = fs.readFileSync(file, "utf8");
  let changed = false;

  // We are looking for any import or export that contains "/router/"
  // and we will dynamically resolve it
  const regex = /(?:import|export)\s+.*from\s+(['"])(\..*\/router\/.*)\1/g;
  let newContent = content.replace(regex, (match, _quote, capture) => {
    const dir = path.dirname(file);
    const targetPath = path.resolve(dir, capture);
    // Normalize to POSIX-style separators so string checks are cross-platform.
    const normalizedTargetPath = targetPath.split(path.sep).join("/");
    const targetIsRouter = normalizedTargetPath.includes("/src/router/");

    if (targetIsRouter) {
      // It points to the old src/router, re-route to packages/route/src/router
      const normalizedDestPath = normalizedTargetPath.replace(
        "/src/router/",
        "/packages/route/src/router/",
      );
      const destPath = path.normalize(normalizedDestPath);
      let newRel = path.relative(dir, destPath).split(path.sep).join("/");
      if (!newRel.startsWith(".")) newRel = "./" + newRel;

      changed = true;
      let repl = match.replace(capture, newRel);
      return repl;
    }
    return match;
  });

  if (changed) {
    fs.writeFileSync(file, newContent, "utf8");
    console.log(`Updated imports in ${file}`);
  }
});
