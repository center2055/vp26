import { execFileSync, execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(scriptDir, '..')
const projectRoot = resolve(frontendRoot, '..')
const backendRoot = join(projectRoot, 'backend')
const binariesDir = join(frontendRoot, 'src-tauri', 'binaries')
const buildDir = join(frontendRoot, 'src-tauri', '.sidecar-build')
const specDir = join(buildDir, 'spec')
const workDir = join(buildDir, 'work')
const distDir = join(buildDir, 'dist')
const backendEntry = join(backendRoot, 'sidecar.py')
const venvDir = join(backendRoot, '.venv')
const requirementsFile = join(backendRoot, 'requirements.txt')
const venvPythonCandidates = [
  join(venvDir, 'Scripts', 'python.exe'),
  join(venvDir, 'bin', 'python3'),
  join(venvDir, 'bin', 'python'),
]
const systemPythonCandidates = process.platform === 'win32' ? ['python'] : ['python3', 'python']

function ensureDir(path) {
  mkdirSync(path, { recursive: true })
}

function removeDir(path) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true })
  }
}

function findExistingVenvPython() {
  return venvPythonCandidates.find((candidate) => existsSync(candidate)) ?? null
}

function resolveSystemPython() {
  for (const candidate of systemPythonCandidates) {
    try {
      execFileSync(candidate, ['--version'], {
        cwd: backendRoot,
        stdio: 'ignore',
      })
      return candidate
    } catch {
      // try next candidate
    }
  }

  throw new Error('Kein Python-Interpreter gefunden. Bitte installiere Python 3.')
}

function ensureBackendVenv() {
  const existing = findExistingVenvPython()
  if (existing) {
    return existing
  }

  const systemPython = resolveSystemPython()
  execFileSync(systemPython, ['-m', 'venv', venvDir], {
    cwd: backendRoot,
    stdio: 'inherit',
  })

  const created = findExistingVenvPython()
  if (!created) {
    throw new Error(`Backend-Venv wurde angelegt, aber Python fehlt weiterhin: ${venvDir}`)
  }

  return created
}

function hostTarget() {
  try {
    return execSync('rustc --print host-tuple', { cwd: projectRoot, encoding: 'utf8' }).trim()
  } catch {
    const details = execSync('rustc -Vv', { cwd: projectRoot, encoding: 'utf8' })
    const match = details.match(/^host:\s+(.+)$/m)
    if (!match) {
      throw new Error('Rust target triple konnte nicht bestimmt werden.')
    }
    return match[1].trim()
  }
}

removeDir(buildDir)
ensureDir(specDir)
ensureDir(workDir)
ensureDir(distDir)
ensureDir(binariesDir)

const python = ensureBackendVenv()

execFileSync(python, ['-m', 'pip', 'install', '--upgrade', 'pip'], {
  cwd: backendRoot,
  stdio: 'inherit',
})

execFileSync(python, ['-m', 'pip', 'install', '-r', requirementsFile, 'pyinstaller'], {
  cwd: backendRoot,
  stdio: 'inherit',
})

execFileSync(
  python,
  [
    '-m',
    'PyInstaller',
    '--onefile',
    '--name',
    'vp26-backend',
    '--distpath',
    distDir,
    '--workpath',
    workDir,
    '--specpath',
    specDir,
    backendEntry,
  ],
  {
    cwd: backendRoot,
    stdio: 'inherit',
  },
)

const extension = process.platform === 'win32' ? '.exe' : ''
const sourceBinary = join(distDir, `vp26-backend${extension}`)
const targetBinary = join(binariesDir, `vp26-backend-${hostTarget()}${extension}`)

if (!existsSync(sourceBinary)) {
  throw new Error(`Sidecar wurde nicht erzeugt: ${sourceBinary}`)
}

removeDir(targetBinary)
ensureDir(dirname(targetBinary))
copyFileSync(sourceBinary, targetBinary)

console.log(`Sidecar bereit: ${targetBinary}`)
