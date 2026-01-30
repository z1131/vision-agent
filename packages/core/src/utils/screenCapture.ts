/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { platform } from 'node:os';

/**
 * Capture screen using platform-specific commands
 * @param region Optional region [x, y, width, height]
 * @returns Buffer containing PNG image data
 */
export async function captureScreen(
  region?: [number, number, number, number],
): Promise<Buffer> {
  const os = platform();

  switch (os) {
    case 'darwin':
      return captureScreenMac(region);
    case 'win32':
      return captureScreenWindows(region);
    case 'linux':
      return captureScreenLinux(region);
    default:
      throw new Error(`Unsupported platform: ${os}`);
  }
}

/**
 * Capture screen on macOS using screencapture
 */
async function captureScreenMac(
  region?: [number, number, number, number],
): Promise<Buffer> {
  const args = ['-x', '-t', 'png'];

  if (region) {
    const [x, y, width, height] = region;
    // screencapture uses -R<x,y,w,h> format
    args.push(`-R${x},${y},${width},${height}`);
  }

  // Output to stdout
  args.push('-');

  return new Promise((resolve, reject) => {
    const proc = spawn('screencapture', args);
    const chunks: Buffer[] = [];

    proc.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    proc.stderr.on('data', (data: Buffer) => {
      reject(new Error(`screencapture error: ${data.toString()}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`screencapture exited with code ${code}`));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn screencapture: ${err.message}`));
    });
  });
}

/**
 * Capture screen on Windows using PowerShell and .NET
 */
async function captureScreenWindows(
  region?: [number, number, number, number],
): Promise<Buffer> {
  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    ${
      region
        ? `
    $x = ${region[0]}
    $y = ${region[1]}
    $width = ${region[2]}
    $height = ${region[3]}
    $bounds = [System.Drawing.Rectangle]::FromLTRB($x, $y, $x + $width, $y + $height)
    `
        : `
    $screen = [System.Windows.Forms.Screen]::PrimaryScreen
    $bounds = $screen.Bounds
    `
    }

    $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)

    $stream = New-Object System.IO.MemoryStream
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $stream.ToArray()
    $base64 = [Convert]::ToBase64String($bytes)
    Write-Output $base64

    $graphics.Dispose()
    $bitmap.Dispose()
    $stream.Dispose()
  `;

  return new Promise((resolve, reject) => {
    const proc = spawn('powershell.exe', ['-NoProfile', '-Command', psScript]);
    let output = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      reject(new Error(`PowerShell error: ${data.toString()}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`PowerShell exited with code ${code}`));
      } else {
        // PowerShell outputs base64 with newlines, remove them
        const base64 = output.replace(/\r?\n/g, '');
        resolve(Buffer.from(base64, 'base64'));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn PowerShell: ${err.message}`));
    });
  });
}

/**
 * Capture screen on Linux using gnome-screenshot or import (ImageMagick)
 */
async function captureScreenLinux(
  region?: [number, number, number, number],
): Promise<Buffer> {
  // Try gnome-screenshot first, then fall back to import
  try {
    return await captureScreenGnome(region);
  } catch {
    return captureScreenImageMagick(region);
  }
}

/**
 * Capture screen using gnome-screenshot
 */
async function captureScreenGnome(
  _region?: [number, number, number, number],
): Promise<Buffer> {
  const args: string[] = ['-f', '-'];

  // Note: gnome-screenshot doesn't support direct coordinates via command line
  // For region capture, consider using a different tool or implementing coordinate-based capture
  // For now, region parameter is accepted but full screen is captured

  return new Promise((resolve, reject) => {
    const proc = spawn('gnome-screenshot', args);
    const chunks: Buffer[] = [];

    proc.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    proc.stderr.on('data', (data: Buffer) => {
      reject(new Error(`gnome-screenshot error: ${data.toString()}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`gnome-screenshot exited with code ${code}`));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });

    proc.on('error', () => {
      reject(new Error('gnome-screenshot not available'));
    });
  });
}

/**
 * Capture screen using ImageMagick's import command
 */
async function captureScreenImageMagick(
  region?: [number, number, number, number],
): Promise<Buffer> {
  const args = ['-silent', 'png:-'];

  if (region) {
    const [x, y, width, height] = region;
    // import uses crop geometry
    args.unshift('-crop', `${width}x${height}+${x}+${y}`);
  } else {
    args.unshift('root');
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('import', args);
    const chunks: Buffer[] = [];

    proc.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    proc.stderr.on('data', (data: Buffer) => {
      reject(new Error(`import error: ${data.toString()}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`import exited with code ${code}`));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn import: ${err.message}`));
    });
  });
}
