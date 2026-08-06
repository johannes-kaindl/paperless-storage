// Build → main.js. obsidian/electron stellt der Host bereit und sind deshalb extern.
import esbuild from "esbuild";

const prod = process.argv.includes("--production");

const ctx = await esbuild.context({
  entryPoints: ["src/obsidian/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "node:*"],
  format: "cjs",
  target: "es2022",
  sourcemap: prod ? false : "inline",
  minify: prod,
  treeShaking: true,
  outfile: "main.js",
});

if (prod) {
  await ctx.rebuild();
  await ctx.dispose();
} else {
  await ctx.watch();
  console.log("esbuild: watching…");
}
