let esbuild;
try {
  esbuild = await import("esbuild");
} catch (err) {
  console.error(
    "Worker compile requires esbuild (a devDependency).\n" +
      "Build phase must use `npm ci` (devDependencies included), not `npm ci --omit=dev`.\n" +
      "Runtime may then use `npm ci --omit=dev` with the already-built dist/worker.js.",
  );
  throw err;
}

await esbuild.build({
  entryPoints: ["src/worker.ts"],
  bundle: true,
  platform: "node",
  packages: "external",
  outfile: "dist/worker.js",
  format: "cjs",
  sourcemap: false,
  logLevel: "info",
});
