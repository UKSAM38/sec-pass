const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");
module.exports = async (context) => {
  if (context.electronPlatformName !== "darwin") return;
  const binary = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  const infoPlist = path.join(binary, "Contents", "Info.plist");
  for (const command of [
    "Set :NSAppTransportSecurity:NSAllowsArbitraryLoads false",
    "Set :NSAppTransportSecurity:NSAllowsLocalNetworking false",
    "Delete :NSAppTransportSecurity:NSExceptionDomains",
  ]) {
    execFileSync("/usr/libexec/PlistBuddy", ["-c", command, infoPlist], {
      stdio: "pipe",
    });
  }
  // Build-only Finder metadata can invalidate macOS code signatures.
  for (const attr of ["com.apple.FinderInfo", "com.apple.ResourceFork"]) {
    try {
      execFileSync("/usr/bin/xattr", ["-dr", attr, binary], { stdio: "pipe" });
    } catch {}
  }
  await flipFuses(binary, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });
};
