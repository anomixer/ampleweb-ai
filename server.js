import { spawn } from 'child_process'
import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Detect OS ──
const platform = process.platform // 'win32' | 'linux' | 'darwin'

// ── Check if node_modules exists ──
const nodeModulesPath = join(__dirname, 'node_modules')
const needsInstall = !existsSync(nodeModulesPath)

if (needsInstall) {
  console.log('\n📦 Installing dependencies...\n')
  try {
    execSync('npm install', { cwd: __dirname, stdio: 'inherit' })
  } catch (e) {
    console.error('\n❌ npm install failed.')
    if (platform === 'win32') {
      console.error('   Make sure Node.js is installed. Download from: https://nodejs.org/')
    } else {
      console.error('   Try: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt install -y nodejs')
    }
    process.exit(1)
  }
}

// ── Start dev server ──
console.log('\n🚀 Starting AmpleWeb dev server on http://localhost:5173\n')
console.log('   Press Ctrl+C to stop.\n')

const dev = platform === 'win32'
  ? spawn('cmd', ['/c', 'npm', 'run', 'dev'], { cwd: __dirname, stdio: 'inherit' })
  : spawn('npm', ['run', 'dev'], { cwd: __dirname, stdio: 'inherit' })

dev.on('error', (err) => {
  console.error('Failed to start dev server:', err)
  process.exit(1)
})

// ── Auto-open browser after server starts ──
setTimeout(() => {
  const url = 'http://localhost:5173'
  let openCmd = ''

  if (platform === 'win32') {
    openCmd = `start "" "${url}"`
  } else if (platform === 'darwin') {
    openCmd = `open "${url}"`
  } else {
    // Linux: try xdg-open, then firefox, then chromium
    openCmd = 'xdg-open "${url}" || firefox "${url}" || chromium "${url}"'
  }

  try {
    execSync(openCmd, { stdio: 'ignore' })
    console.log(`\n✅ Browser opened: ${url}\n`)
  } catch (e) {
    console.log(`\n🌐 Open this URL in your browser: ${url}\n`)
  }
}, 3000)
