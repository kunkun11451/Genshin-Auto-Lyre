import { spawn, ChildProcess, exec } from 'child_process'
import { join } from 'path'
import { existsSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'

let helperProcess: ChildProcess | null = null
let isCompiling = false

const CSHARP_CODE = `
using System;
using System.Runtime.InteropServices;

namespace GenshinAutoLyre
{
    class KeyboardHelper
    {
        [StructLayout(LayoutKind.Sequential)]
        public struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct MOUSEINPUT 
        {
            public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct HARDWAREINPUT 
        {
            public uint uMsg; public ushort wParamL; public ushort wParamH;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct INPUT
        {
            public uint type;
            public InputUnion u;
        }

        [StructLayout(LayoutKind.Explicit)]
        struct InputUnion
        {
            [FieldOffset(0)] public MOUSEINPUT mi;
            [FieldOffset(0)] public KEYBDINPUT ki;
            [FieldOffset(0)] public HARDWAREINPUT hi;
        }

        [DllImport("user32.dll")]
        static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        static extern uint MapVirtualKey(uint uCode, uint uMapType);

        const uint INPUT_KEYBOARD = 1;
        const uint KEYEVENTF_KEYUP = 0x0002;
        const uint KEYEVENTF_SCANCODE = 0x0008;

        static void Main(string[] args)
        {
            Console.SetOut(new System.IO.StreamWriter(Console.OpenStandardOutput()) { AutoFlush = true });

            string line;
            while ((line = Console.ReadLine()) != null)
            {
                if (line == "exit") break;

                string[] parts = line.Split(' ');
                if (parts.Length != 2) continue;

                string action = parts[0];
                string keyStr = parts[1];
                
                if (keyStr.Length != 1) continue;
                
                char keyChar = char.ToUpper(keyStr[0]);
                ushort vkCode = (ushort)keyChar;
                ushort scanCode = (ushort)MapVirtualKey(vkCode, 0);

                bool isDown = action == "down";

                INPUT[] inputs = new INPUT[1];
                inputs[0].type = INPUT_KEYBOARD;
                inputs[0].u.ki.wVk = vkCode; 
                inputs[0].u.ki.wScan = scanCode;
                // 某些应用需要 KEYEVENTF_SCANCODE，另一些需要 VK，我们同时设置
                inputs[0].u.ki.dwFlags = KEYEVENTF_SCANCODE | (isDown ? 0 : KEYEVENTF_KEYUP);
                inputs[0].u.ki.time = 0;
                inputs[0].u.ki.dwExtraInfo = IntPtr.Zero;

                SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
            }
        }
    }
}
`

export async function initKeyboardSimulator(): Promise<void> {
  const tempDir = tmpdir()
  const csFile = join(tempDir, 'GenshinAutoLyreKeyboardHelper_v4.cs')
  const exePath = join(tempDir, 'GenshinAutoLyreKeyboardHelper_v4.exe')

  if (isCompiling) return

  if (!existsSync(exePath)) {
    isCompiling = true
    try {
      console.log('Writing C# source code...')
      writeFileSync(csFile, CSHARP_CODE, 'utf8')
      console.log('Compiling KeyboardHelper.cs...')
      await compileCSharp(csFile, exePath)
      console.log('Compilation successful.')
    } catch (e) {
      console.error('Failed to compile KeyboardHelper:', e)
      isCompiling = false
      return
    }
    isCompiling = false
  }

  if (!helperProcess || helperProcess.killed) {
    helperProcess = spawn(exePath)
    
    helperProcess.on('error', (err) => {
      console.error('KeyboardHelper process error:', err)
    })

    helperProcess.on('exit', () => {
      console.log('KeyboardHelper process exited')
      helperProcess = null
    })
  }
}

function compileCSharp(csFile: string, outExe: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cscPaths = [
      'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
      'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
    ]

    let csc = ''
    for (const p of cscPaths) {
      if (existsSync(p)) {
        csc = p
        break
      }
    }

    if (!csc) {
      reject(new Error('Could not find csc.exe. Please ensure .NET Framework is installed.'))
      return
    }

    exec(`"${csc}" /out:"${outExe}" "${csFile}"`, (error, stdout, stderr) => {
      if (error) {
        console.error(stdout)
        console.error(stderr)
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

export function simulateKeyDown(key: string): void {
  if (helperProcess && helperProcess.stdin) {
    helperProcess.stdin.write(`down ${key}\n`)
  }
}

export function simulateKeyUp(key: string): void {
  if (helperProcess && helperProcess.stdin) {
    helperProcess.stdin.write(`up ${key}\n`)
  }
}

export function simulateKeyBatch(downs: string[], ups: string[]): void {
  if (helperProcess && helperProcess.stdin) {
    let payload = ''
    for (const key of downs) payload += `down ${key}\n`
    for (const key of ups) payload += `up ${key}\n`
    if (payload) {
      helperProcess.stdin.write(payload)
    }
  }
}

export function destroyKeyboardSimulator(): void {
  if (helperProcess && helperProcess.stdin) {
    helperProcess.stdin.write('exit\n')
    helperProcess.kill()
    helperProcess = null
  }
}
