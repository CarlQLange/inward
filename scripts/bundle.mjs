#!/usr/bin/env node
// Packs the game into one self-contained page, for publishing as an artifact.
//   node scripts/bundle.mjs
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const assetsDir = join(root, 'assets')

const script = execFileSync('npx', ['--yes', 'esbuild@0.24.2', 'src/main.js', '--bundle', '--format=esm', '--minify', '--target=es2022'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'inherit'],
})

const images = Object.fromEntries(readdirSync(assetsDir)
  .filter(file => extname(file) === '.png')
  .map(file => [file, `data:image/png;base64,${readFileSync(join(assetsDir, file)).toString('base64')}`]))
const castData = JSON.parse(readFileSync(join(assetsDir, 'cast.json'), 'utf8'))

const page = `<title>Inward</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  body { position: fixed; inset: 0; display: grid; place-items: center; }
  canvas { display: block; }
  #insets { position: fixed; visibility: hidden; padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px); }
</style>
<div id="insets"></div>
<canvas id="screen"></canvas>
<script>window.INLINE_ASSETS = ${JSON.stringify({ ...images, castData })}</script>
<script type="module">${script.replace(/<\/script/g, '<\\/script')}</script>
`

mkdirSync(join(root, 'dist'), { recursive: true })
writeFileSync(join(root, 'dist/inward.html'), page)
console.log(`dist/inward.html ${(page.length / 1024).toFixed(0)} KB`)
