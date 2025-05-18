#!/usr/bin/env node

import { execSync, spawnSync } from "child_process";
import { mkdirSync, createWriteStream, existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { pipeline } from "stream";
import { promisify } from "util";
import { createGunzip } from "zlib";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import rbush from "geojson-rbush";
import * as turf from "@turf/turf";

const __dirname = dirname(fileURLToPath(import.meta.url));

const buildDir = resolve(__dirname, "../build");
const topoUrl =
  "https://int.nyt.com/newsgraphics/elections/map-data/2024/national/precincts-with-results.topojson.gz";
const topoGzPath = `${buildDir}/precincts-with-results.topojson.gz`; // unused but retained for completeness
const topoPath = `${buildDir}/precincts-with-results.topojson`;
const mercatorPath = `${buildDir}/temp-mercator.geojson`;
const geojsonPath = `${buildDir}/precincts-with-results.geojson`;
const spatialIndexPath = `${buildDir}/precincts-with-results-spatial-index.json`;

const pipelineAsync = promisify(pipeline);

async function checkGDAL() {
  const result = spawnSync("ogr2ogr", ["--version"]);
  if (result.error || result.status !== 0) {
    console.error("❌ GDAL (ogr2ogr) is not installed.");
    console.error("👉 On macOS, install it with: brew install gdal");
    process.exit(1);
  }
  console.log("✅ GDAL is installed.");
}

async function ensureBuildDir() {
  if (!existsSync(buildDir)) {
    mkdirSync(buildDir, { recursive: true });
    console.log(`📁 Created build directory: ${buildDir}`);
  }
}

async function downloadAndExtract() {
  if (existsSync(topoPath)) {
    console.log("📦 TopoJSON already downloaded and extracted.");
    return;
  }

  console.log(`🌐 Downloading: ${topoUrl}`);
  const response = await fetch(topoUrl);

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  const gunzip = createGunzip();
  const output = createWriteStream(topoPath);

  await pipelineAsync(response.body, gunzip, output);
  console.log(`✅ Downloaded and extracted to: ${topoPath}`);
}

async function convertTopoToGeoJSON() {
  console.log(
    "🔄 Converting TopoJSON to GeoJSON (Mercator) - this could take awhile..."
  );
  execSync(
    `ogr2ogr -f GeoJSON "${mercatorPath}" "${topoPath}" -s_srs EPSG:4326 -t_srs EPSG:3857`,
    { stdio: "inherit" }
  );

  console.log("🔄 Reprojecting to EPSG:4326 and simplifying...");
  execSync(
    `ogr2ogr -f GeoJSON "${geojsonPath}" "${mercatorPath}" -s_srs EPSG:3857 -t_srs EPSG:4326 -simplify 100 -lco COORDINATE_PRECISION=5`,
    { stdio: "inherit" }
  );

  console.log(`✅ Final GeoJSON saved to: ${geojsonPath}`);
}

async function buildSpatialIndex() {
  console.log(`📥 Reading ${geojsonPath}...`);
  const raw = await readFile(geojsonPath, "utf8");
  const geojson = JSON.parse(raw);

  // Add bboxes if missing
  for (const feature of geojson.features) {
    if (!feature.bbox) {
      feature.bbox = turf.bbox(feature);
    }
  }

  console.log(`🌲 Indexing ${geojson.features.length} features...`);

  const tree = rbush();
  tree.load(geojson);

  const indexedFeatures = tree.all();
  await writeFile(
    spatialIndexPath,
    JSON.stringify({ type: "FeatureCollection", features: indexedFeatures }),
    "utf8"
  );
}

async function main() {
  await checkGDAL();
  await ensureBuildDir();
  await downloadAndExtract();
  await convertTopoToGeoJSON();
  await buildSpatialIndex();
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
