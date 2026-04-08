# How the public repo catches up automatically

## Required release artifacts from the private repo
1. `schemas/*.json`
2. `public-openapi.yaml`
3. example fixtures
4. typed client signatures

## Required CI checks in this repo
1. Block merge if schema hashes change without sync
2. Block release if example fixture validation fails
3. Block release if endpoint signatures drift from `public-openapi.yaml`
4. Keep all public examples pinned to one published contract version

## Why this matters
The public repo must always teach the current product shape, but it must never become the place where product truth is invented.
