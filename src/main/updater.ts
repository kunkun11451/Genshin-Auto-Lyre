import { app, net } from 'electron'
import { join, dirname } from 'path'
import { createWriteStream, writeFileSync } from 'fs'
import { spawn } from 'child_process'
import * as os from 'os'

const REPO = 'kunkun11451/Genshin-Auto-Lyre'

export interface UpdateInfo {
  version: string
  url: string
  releaseNotes: string
  assetName: string
  downloadUrl: string
}

function isNewerVersion(latest: string, current: string): boolean {
  const lParts = latest.split('.').map(Number)
  const cParts = current.split('.').map(Number)
  for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
    const l = lParts[i] || 0
    const c = cParts[i] || 0
    if (l > c) return true
    if (l < c) return false
  }
  return false
}

export async function checkUpdate(): Promise<UpdateInfo | null> {
  const currentVersion = app.getVersion()
    
  // 本地更新调试开关：若为 true 且启动了本地服务器，软件将优先向本地请求更新，方便本地极速断网测试
  const USE_LOCAL_MOCK = false
  
  if (USE_LOCAL_MOCK) {
    try {
      const response = await net.fetch('http://127.0.0.1:3000/latest')
      if (response.ok) {
        const data: any = await response.json()
        let latestVersion = data.tag_name || ''
        if (latestVersion.startsWith('v')) {
          latestVersion = latestVersion.substring(1)
        }
        
        if (isNewerVersion(latestVersion, currentVersion)) {
          const asset = data.assets?.find((a: any) => a.name.endsWith('.zip'))
          if (asset) {
            console.log('本地更新测试：检测到最新测试版本 v' + latestVersion)
            return {
              version: latestVersion,
              url: data.html_url,
              releaseNotes: data.body || '本地测试版本',
              assetName: asset.name,
              downloadUrl: asset.browser_download_url
            }
          }
        }
        return null // 已是最新，无需更新
      }
    } catch (e) {
      console.log('未检测到本地模拟更新源，自动切换回 GitHub 官方源...')
    }
  }

  const response = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
  
  if (!response.ok) {
    throw new Error('网络请求失败或无可用更新')
  }
  
  const data: any = await response.json()
  let latestVersion = data.tag_name || ''
  if (latestVersion.startsWith('v')) {
    latestVersion = latestVersion.substring(1)
  }
  
  if (isNewerVersion(latestVersion, currentVersion)) {
    const asset = data.assets?.find((a: any) => a.name.endsWith('.zip'))
    if (!asset) return null
    
    let releaseNotes = data.body || '无更新日志'
    // 剔除 GitHub 自动生成的 Full Changelog 链接
    releaseNotes = releaseNotes.replace(/\*\*Full Changelog\*\*: https:\/\/github\.com\/[^\s]+/gi, '').trim()
    
    return {
      version: latestVersion,
      url: data.html_url,
      releaseNotes: releaseNotes,
      assetName: asset.name,
      downloadUrl: asset.browser_download_url
    }
  }
  return null
}

export function downloadUpdate(url: string, destPath: string, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = net.request(url)
    request.on('response', (response) => {
      // 处理重定向
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectUrl = Array.isArray(response.headers.location) 
          ? response.headers.location[0] 
          : response.headers.location
        downloadUpdate(redirectUrl, destPath, onProgress).then(resolve).catch(reject)
        return
      }

      if (response.statusCode !== 200) {
        reject(new Error(`下载失败，状态码: ${response.statusCode}`))
        return
      }
      
      const contentLength = response.headers['content-length']
      const total = contentLength ? parseInt(Array.isArray(contentLength) ? contentLength[0] : contentLength, 10) : 0
      let downloaded = 0
      
      const file = createWriteStream(destPath)
      
      response.on('data', (chunk) => {
        downloaded += chunk.length
        if (total > 0) {
          onProgress(Math.round((downloaded / total) * 100))
        }
        file.write(chunk)
      })
      
      response.on('end', () => {
        file.end()
        
        const { spawn } = require('child_process')
        const { extractDir } = getUpdatePaths()
        
        // 捕获目录非空或文件占用错误，防止主进程崩溃
        try {
          require('fs').rmSync(extractDir, { recursive: true, force: true })
        } catch (rmErr) {
          console.warn('清空临时解压目录失败，尝试直接覆盖解压:', rmErr)
        }
        
        // 调用 Windows PowerShell 原生解压命令，无需依赖外部 exe，避免自愈死锁
        const p = spawn('powershell.exe', [
          '-NoProfile',
          '-Command',
          `Expand-Archive -Path "${destPath}" -DestinationPath "${extractDir}" -Force`
        ], { windowsHide: true })
        
        p.on('close', (code: number) => {
          if (code === 0) resolve()
          else reject(new Error('解压失败，退出码: ' + code))
        })
      })
      
      response.on('error', (err) => {
        file.close()
        reject(err)
      })
    })
    
    request.on('error', reject)
    request.end()
  })
}

export function getUpdatePaths() {
  const appDir = dirname(process.execPath)
  const baseDir = !app.isPackaged ? process.cwd() : appDir
  const zipPath = join(baseDir, 'genshin_lyre_update.zip')
  const extractDir = zipPath + '_extracted'
  return { appDir, zipPath, extractDir }
}

export function applyUpdate(appDir: string, extractDir: string, restartNow: boolean = false) {
  const vbsPath = join(os.tmpdir(), 'genshin_lyre_update.vbs')
  const batPath = join(os.tmpdir(), 'genshin_lyre_update.bat')
  
  // 获取 zipPath 绝对路径，用于在替换复制完成后彻底擦除临时包
  const { zipPath } = getUpdatePaths()

  // 使用批处理调用 xcopy 进行强制覆盖，能最大程度保留用户私有文件（如 midi 文件夹）
  let batScript = `@echo off\r\n`
  batScript += `chcp 65001 > nul\r\n`
  batScript += `ping 127.0.0.1 -n 3 > nul\r\n`
  batScript += `xcopy /Y /E /C /Q /H /R "${extractDir}\\*" "${appDir}\\"\r\n`
  
  // 在替换复制完成后，立刻在后台将根目录下的临时 ZIP 更新包和解压文件夹彻底强制清空删除！
  batScript += `del /f /q /a "${zipPath}" > nul 2>&1\r\n`
  batScript += `rmdir /s /q "${extractDir}" > nul 2>&1\r\n`
  
  if (restartNow) {
    // 覆盖替换完成后，在后台独立重新唤起新版本的可执行程序，支持各种改名和快捷方式运行
    batScript += `start "" "${process.execPath}"\r\n`
  }

  batScript += `del /f /q "%~f0"\r\n`
  
  writeFileSync(batPath, batScript, 'utf-8')

  // 使用 VBS 隐式执行批处理，防止闪烁黑框
  let vbsScript = `Set WshShell = CreateObject("WScript.Shell")\r\n`
  vbsScript += `WshShell.Run chr(34) & "${batPath}" & Chr(34), 0\r\n`
  vbsScript += `Set fso = CreateObject("Scripting.FileSystemObject")\r\n`
  vbsScript += `On Error Resume Next\r\n`
  vbsScript += `fso.DeleteFile WScript.ScriptFullName, True\r\n`
  
  writeFileSync(vbsPath, vbsScript, 'utf-8')
  
  const p = spawn('wscript.exe', [vbsPath], {
    detached: true,
    windowsHide: true,
    stdio: 'ignore'
  })
  p.unref()
}

export function cleanUpdateTempFiles() {
  try {
    const { zipPath, extractDir } = getUpdatePaths()
    const fs = require('fs')
    if (fs.existsSync(zipPath)) {
      fs.rmSync(zipPath, { force: true })
    }
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true })
    }
  } catch (err) {
    console.error('静默清理更新临时文件失败:', err)
  }
}
