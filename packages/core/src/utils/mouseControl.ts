/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { platform } from 'node:os';

/**
 * Move mouse to position
 */
export async function moveMouse(x: number, y: number): Promise<void> {
  const os = platform();

  switch (os) {
    case 'darwin':
      return moveMouseMac(x, y);
    case 'win32':
      return moveMouseWindows(x, y);
    case 'linux':
      return moveMouseLinux(x, y);
    default:
      throw new Error(`Unsupported platform: ${os}`);
  }
}

/**
 * Click mouse
 */
export async function click(
  x?: number,
  y?: number,
  button: 'left' | 'right' | 'middle' = 'left',
  type: 'click' | 'double' | 'down' | 'up' = 'click',
): Promise<void> {
  const os = platform();

  // If position specified, move first
  if (x !== undefined && y !== undefined) {
    await moveMouse(x, y);
  }

  switch (os) {
    case 'darwin':
      return clickMac(button, type);
    case 'win32':
      return clickWindows(button, type);
    case 'linux':
      return clickLinux(button, type);
    default:
      throw new Error(`Unsupported platform: ${os}`);
  }
}

/**
 * Drag from one position to another
 */
export async function drag(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  duration = 500,
): Promise<void> {
  const os = platform();

  switch (os) {
    case 'darwin':
      return dragMac(fromX, fromY, toX, toY, duration);
    case 'win32':
      return dragWindows(fromX, fromY, toX, toY, duration);
    case 'linux':
      return dragLinux(fromX, fromY, toX, toY, duration);
    default:
      throw new Error(`Unsupported platform: ${os}`);
  }
}

// ============================================
// macOS implementations
// ============================================

async function moveMouseMac(x: number, y: number): Promise<void> {
  // Use cliclick if available, otherwise fallback to osascript
  try {
    await execCommand('cliclick', ['m:', `${x},${y}`]);
  } catch {
    // Fallback to AppleScript - just move to position using cliclick is preferred
    // If cliclick is not available, we need to install it
    throw new Error('cliclick is required on macOS: brew install cliclick');
  }
}

async function clickMac(
  button: 'left' | 'right' | 'middle',
  type: 'click' | 'double' | 'down' | 'up',
): Promise<void> {
  try {
    const args: string[] = [];
    if (type === 'double') {
      args.push('dc:');
    } else if (type === 'down') {
      args.push('dd:');
    } else if (type === 'up') {
      args.push('du:');
    } else {
      // single click
      if (button === 'right') {
        args.push('rc:');
      } else if (button === 'middle') {
        args.push('mc:');
      } else {
        args.push('c:');
      }
    }
    await execCommand('cliclick', args);
  } catch {
    // Fallback to AppleScript
    const asScript = `tell application "System Events"
      ${type === 'double' ? 'double click' : 'click'}
    end tell`;
    await execAppleScript(asScript);
  }
}

async function dragMac(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  duration: number,
): Promise<void> {
  try {
    // Move to start, press down, move to end, release
    await execCommand('cliclick', ['m:', `${fromX},${fromY}`]);
    await execCommand('cliclick', ['dd:']);

    // Smooth movement
    const steps = 10;
    const stepDuration = duration / steps;
    for (let i = 1; i <= steps; i++) {
      const x = fromX + ((toX - fromX) * i) / steps;
      const y = fromY + ((toY - fromY) * i) / steps;
      await execCommand('cliclick', [
        'm:',
        `${Math.round(x)},${Math.round(y)}`,
      ]);
      await sleep(stepDuration);
    }

    await execCommand('cliclick', ['du:']);
  } catch {
    throw new Error(
      'Drag requires cliclick to be installed: brew install cliclick',
    );
  }
}

// ============================================
// Windows implementations
// ============================================

async function moveMouseWindows(x: number, y: number): Promise<void> {
  const psScript = `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})`;
  await execPowerShell(psScript);
}

async function clickWindows(
  button: 'left' | 'right' | 'middle',
  type: 'click' | 'double' | 'down' | 'up',
): Promise<void> {
  const buttonMap = {
    left: 'Left',
    right: 'Right',
    middle: 'Middle',
  };

  const btn = buttonMap[button];

  let psScript: string;
  if (type === 'double') {
    psScript = `[System.Windows.Forms.MouseButtons]::${btn} | ForEach-Object { [System.Windows.Forms.SendKeys]::SendWait('') }`;
  } else if (type === 'down') {
    psScript = `[System.Windows.Forms.MouseButtons]::${btn} -bor [System.Windows.Forms.MouseButtons]::${btn}`;
  } else if (type === 'up') {
    psScript = `return`; // No-op for up
  } else {
    // single click
    psScript = `Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MouseButtons]::$btn | ForEach-Object {
      # Click simulation
    }`;
  }

  // Simpler approach using SendMouseClick from AutoIt or similar
  psScript = `
    Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    public class MouseClick {
      [DllImport("user32.dll")]
      public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
    }
    "@
    ${type === 'down' ? `[MouseClick]::mouse_event(0x0002, 0, 0, 0, 0)` : `[MouseClick]::mouse_event(0x02, 0, 0, 0, 0); [MouseClick]::mouse_event(0x04, 0, 0, 0, 0)`}
  `;

  await execPowerShell(psScript);
}

async function dragWindows(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  duration: number,
): Promise<void> {
  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${fromX}, ${fromY})

    # Mouse down
    Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    public class MouseDrag {
      [DllImport("user32.dll")]
      public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
      [DllImport("user32.dll")]
      public static extern bool SetCursorPos(int x, int y);
    }
    "@

    [MouseDrag]::mouse_event(0x0002, 0, 0, 0, 0)  # LBUTTONDOWN

    # Smooth drag
    $steps = 10
    $sleepMs = ${duration} / $steps
    for ($i = 1; $i -le $steps; $i++) {
      $x = ${fromX} + ((${toX} - ${fromX}) * $i / $steps)
      $y = ${fromY} + ((${toY} - ${fromY}) * $i / $steps)
      [MouseDrag]::SetCursorPos([int]$x, [int]$y)
      Start-Sleep -Milliseconds $sleepMs
    }

    [MouseDrag]::mouse_event(0x0004, 0, 0, 0, 0)  # LBUTTONUP
  `;

  await execPowerShell(psScript);
}

// ============================================
// Linux implementations
// ============================================

async function moveMouseLinux(x: number, y: number): Promise<void> {
  try {
    await execCommand('xdotool', ['mousemove', String(x), String(y)]);
  } catch {
    throw new Error('xdotool is required on Linux: sudo apt install xdotool');
  }
}

async function clickLinux(
  button: 'left' | 'right' | 'middle',
  type: 'click' | 'double' | 'down' | 'up',
): Promise<void> {
  const buttonMap = {
    left: '1',
    right: '3',
    middle: '2',
  };

  const btn = buttonMap[button];

  try {
    if (type === 'double') {
      await execCommand('xdotool', ['click', '--repeat', '2', btn]);
    } else if (type === 'down') {
      await execCommand('xdotool', ['mousedown', btn]);
    } else if (type === 'up') {
      await execCommand('xdotool', ['mouseup', btn]);
    } else {
      await execCommand('xdotool', ['click', btn]);
    }
  } catch {
    throw new Error('xdotool is required on Linux: sudo apt install xdotool');
  }
}

async function dragLinux(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  duration: number,
): Promise<void> {
  try {
    // Move to start and press
    await execCommand('xdotool', ['mousemove', String(fromX), String(fromY)]);
    await execCommand('xdotool', ['mousedown', '1']);

    // Smooth movement
    const steps = 10;
    const stepDuration = duration / steps;
    for (let i = 1; i <= steps; i++) {
      const x = fromX + ((toX - fromX) * i) / steps;
      const y = fromY + ((toY - fromY) * i) / steps;
      await execCommand('xdotool', [
        'mousemove',
        String(Math.round(x)),
        String(Math.round(y)),
      ]);
      await sleep(stepDuration);
    }

    await execCommand('xdotool', ['mouseup', '1']);
  } catch {
    throw new Error('xdotool is required on Linux: sudo apt install xdotool');
  }
}

// ============================================
// Utility functions
// ============================================

function execCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}`));
      } else {
        resolve();
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

function execAppleScript(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('osascript', ['-e', script]);

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`osascript exited with code ${code}`));
      } else {
        resolve();
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

function execPowerShell(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('powershell.exe', ['-NoProfile', '-Command', script]);

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`PowerShell exited with code ${code}`));
      } else {
        resolve();
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
