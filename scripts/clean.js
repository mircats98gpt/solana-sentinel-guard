#!/usr/bin/env node
// Removes orphaned coral-spawned agent containers.
//
// CoralOS launches a fresh agent container (seller / buyer / user-proxy / broker) per session and
// does NOT reap them, so they accumulate as you test. This prunes them by image ancestry — it never
// touches coral, the bridge, or anything not built from an agent image. Safe to run anytime; it's
// also run automatically at the start of `just dev`.

import { execSync } from 'node:child_process'

// Containers spawned from these images are the per-session agents coral leaves behind.
const AGENT_IMAGES = ['seller-agent:0.1.0', 'buyer-agent:0.1.0', 'user-proxy:0.1.0', 'broker:0.1.0']

function sh(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

// No Docker? Nothing to clean — don't fail the build.
try {
  execSync('docker info', { stdio: 'ignore' })
} catch {
  console.log('Docker not running — nothing to clean.')
  process.exit(0)
}

const filters = AGENT_IMAGES.map((i) => `--filter ancestor=${i}`).join(' ')
const ids = sh(`docker ps -aq ${filters}`).split(/\s+/).filter(Boolean)

if (ids.length === 0) {
  console.log('No orphaned agent containers to clean.')
} else {
  sh(`docker rm -f ${ids.join(' ')}`)
  console.log(`Cleaned ${ids.length} orphaned agent container(s).`)
}
