const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const releaseRoot = path.join(projectRoot, "windows-release");

function removeIfExists(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

console.log("Node.js 없이 실행되는 Windows용 앱을 빌드하는 중입니다...");
execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
  cwd: projectRoot,
  stdio: "inherit",
});

removeIfExists(releaseRoot);

execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["electron-builder", "--win", "portable", "--x64", "--publish", "never"],
  { cwd: projectRoot, stdio: "inherit" },
);

fs.copyFileSync(path.join(projectRoot, "Windows-실행방법.txt"), path.join(releaseRoot, "Windows-실행방법.txt"));
console.log(`\n완료: ${path.relative(projectRoot, releaseRoot)}`);
console.log("windows-release 폴더 안의 EXE를 Windows 컴퓨터에서 더블클릭하세요.");