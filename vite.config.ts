import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

// 🆕**§5.6 `C-0`（2026-09-16）＝バグ報告が「どのビルドの話か」を確定するための git sha。**
//   ⚠git が無い環境（配布物からのビルド等）でも**ビルドを落とさない**＝不明は 'nogit' にする。
const gitSha = (() => {
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() }
  catch { return 'nogit' }
})()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(`v${pkg.version}`),
    __GIT_SHA__: JSON.stringify(gitSha),
  },
})
