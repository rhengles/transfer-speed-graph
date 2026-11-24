// Packs core/ with `npm pack`, installs the tarball in a temporary project and checks
// that the package loads through require() and import(), and that the expected
// files are inside. Run with: npm run test:package (after npm run build).
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const coreDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'core')
const pkg = JSON.parse(fs.readFileSync(path.join(coreDir, 'package.json'), 'utf8'))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const REQUIRED_FILES = [
	'LICENSE',
	'README.md',
	'package.json',
	'dist/arijs-transfer-speed-graph.js',
	'dist/arijs-transfer-speed-graph.umd.cjs',
	'dist/arijs-transfer-speed-graph.umd.js',
]

function run(cmd, args, cwd) {
	return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' })
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tsg-package-'))
try {
	const packJson = JSON.parse(run(npm, ['pack', '--json', '--pack-destination', tmp], coreDir))
	const tarball = path.join(tmp, packJson[0].filename)
	const files = packJson[0].files.map((f) => f.path)
	console.log(`packed ${packJson[0].filename} (${files.length} files)`)
	for (const file of REQUIRED_FILES) {
		if (!files.includes(file)) throw new Error(`${file} is missing from the tarball`)
	}

	const project = path.join(tmp, 'project')
	fs.mkdirSync(project)
	fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'tsg-check', private: true }))
	run(npm, ['install', '--no-audit', '--no-fund', '--ignore-scripts', tarball], project)

	const requireOut = run(process.execPath, ['-e', [
		`const m = require('${pkg.name}')`,
		`if (typeof m.TransferGraph !== 'function') throw new Error('require: TransferGraph is ' + typeof m.TransferGraph)`,
		`new m.TransferGraph()`,
		`console.log('require ok:', typeof m.TransferGraph, require('${pkg.name}/package.json').version)`,
	].join('\n')], project)
	process.stdout.write(requireOut)

	const importOut = run(process.execPath, ['--input-type=module', '-e', [
		`const m = await import('${pkg.name}')`,
		`if (typeof m.TransferGraph !== 'function') throw new Error('import: TransferGraph is ' + typeof m.TransferGraph)`,
		`new m.TransferGraph()`,
		`console.log('import ok:', typeof m.TransferGraph)`,
	].join('\n')], project)
	process.stdout.write(importOut)
} finally {
	fs.rmSync(tmp, { recursive: true, force: true })
}
