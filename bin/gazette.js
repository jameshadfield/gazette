#!/usr/bin/env node
import { Command } from "commander";
import { buildCommand } from "../src/commands/build.js";
import { devCommand } from "../src/commands/dev.js";
import { snapshotCommand } from "../src/commands/snapshot.js";
import { runtimeCommand } from "../src/commands/runtime.js";

const program = new Command();

program
  .name("gazette")
  .description("Compile a single Markdown source into a self-contained, interactive scientific document.")
  .version("0.1.0");

program
  .command("build")
  .argument("<input>", "Markdown entry file")
  .option("--target <target>", "static | next | pdf | all", "static")
  .option("--out <dir>", "output directory (default: <root>/dist)")
  .option("--base-path <path>", "asset base path (next/static)")
  .option("--bib <file>", "BibTeX file (default: <root>/references.bib)")
  .option("--figures <dir>", "figures source dir (default: <root>/figures)")
  .option("--theme <dir>", "theme-override dir (tokens.css + optional fonts/)")
  .option("--no-fallback-hide", "keep the static fallback visible under the island (debug)")
  .option("--snapshot", "regenerate raster figure fallbacks (headless Chrome) before building")
  .action(async (input, opts) => {
    try {
      await buildCommand(input, opts);
    } catch (err) {
      console.error(`gazette: ${err.message}`);
      process.exitCode = 1;
    }
  });

program
  .command("dev")
  .argument("<input>", "Markdown entry file")
  .option("--port <port>", "port", "8080")
  .option("--bib <file>", "BibTeX file")
  .option("--figures <dir>", "figures source dir")
  .option("--theme <dir>", "theme-override dir (tokens.css + optional fonts/)")
  .action(async (input, opts) => {
    try {
      await devCommand(input, opts);
    } catch (err) {
      console.error(`gazette: ${err.message}`);
      process.exitCode = 1;
    }
  });

program
  .command("snapshot")
  .description("Render interactive figures to raster fallback PNGs (headless Chrome) in the source figures/ dir")
  .argument("<input>", "Markdown entry file")
  .option("--only <fig>", "snapshot a single figure by slug (e.g. fig:demo-trend)")
  .option("--figures <dir>", "figures source dir (default: <root>/figures)")
  .option("--bib <file>", "BibTeX file (default: <root>/references.bib)")
  .option("--theme <dir>", "theme-override dir (tokens.css + optional fonts/)")
  .option("--snapshot-width <px>", "rendered figure width target in CSS px (default: 800)")
  .option("--snapshot-scale <n>", "raster density multiplier (default: 2)")
  .action(async (input, opts) => {
    try {
      await snapshotCommand(input, opts);
    } catch (err) {
      console.error(`gazette: ${err.message}`);
      process.exitCode = 1;
    }
  });

program
  .command("runtime")
  .description("Copy a target's companion runtime components into a project")
  .option("--target <target>", "next", "next")
  .option("--out <dir>", "destination directory for the components")
  .action(async (opts) => {
    try {
      await runtimeCommand(opts);
    } catch (err) {
      console.error(`gazette: ${err.message}`);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
