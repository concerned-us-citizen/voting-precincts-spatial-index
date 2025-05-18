# Precinct Data Spatial Index Generation

This project converts detailed NY Times [precinct-level election data](https://github.com/nytimes/presidential-precinct-map-2024) from a .topoJSON file to a lightweight R-tree spatial index, and saves it in a .json file. 

It also provides a script to generate a GitHub Release that contains a link to the resulting output file. 

## Background

NY Times precinct-level election data is provided as a large TopoJSON file (approximately 0.5 GB). Querying this file directly to find voting results for specific geographic coordinates (latitude/longitude) would be inefficient and slow, especially for a web application or a script that needs to perform many such lookups.

To optimize this lookup process, a spatial index is pre-built. This index allows for much faster querying of voting results based on geographic points.

## Spatial Index Creation

```bash
  npm run build
```

## Create Release
```
  npm run upload -- <tag-name>
```