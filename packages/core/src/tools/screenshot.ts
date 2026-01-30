/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { Config } from '../config/config.js';
import { ToolErrorType } from './tool-error.js';
import { ToolDisplayNames, ToolNames } from './tool-names.js';

/**
 * Parameters for the Screenshot tool
 */
export interface ScreenshotToolParams {
  /**
   * Optional region to capture [x, y, width, height]
   * If not provided, captures full screen
   */
  region?: [number, number, number, number];
}

/**
 * Screenshot tool invocation implementation
 */
class ScreenshotToolInvocation extends BaseToolInvocation<
  ScreenshotToolParams,
  ToolResult
> {
  constructor(_config: Config, params: ScreenshotToolParams) {
    super(params);
  }

  /**
   * Gets a description of the screenshot operation
   */
  getDescription(): string {
    if (this.params.region) {
      const [x, y, w, h] = this.params.region;
      return `Screenshot region [${x},${y},${w},${h}]`;
    }
    return 'Screenshot full screen';
  }

  /**
   * Executes the screenshot operation
   */
  async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      // Dynamic import to avoid loading on startup
      const { captureScreen } = await import('../utils/screenCapture.js');

      const imageBuffer = await captureScreen(this.params.region);
      const base64Data = imageBuffer.toString('base64');

      return {
        llmContent: [
          { text: '当前屏幕截图：' },
          {
            inlineData: {
              data: base64Data,
              mimeType: 'image/png',
            },
          },
        ],
        returnDisplay: '📸 屏幕截图已捕获',
      };
    } catch (error) {
      const errorMsg = `截图失败: ${error instanceof Error ? error.message : String(error)}`;
      return {
        llmContent: errorMsg,
        returnDisplay: `❌ ${errorMsg}`,
        error: {
          message: errorMsg,
          type: ToolErrorType.SCREENSHOT_ERROR,
        },
      };
    }
  }
}

/**
 * Screenshot tool - captures screen region or full screen
 */
export class ScreenshotTool extends BaseDeclarativeTool<
  ScreenshotToolParams,
  ToolResult
> {
  static readonly Name = ToolNames.SCREENSHOT;

  constructor(private config: Config) {
    super(
      ScreenshotTool.Name,
      ToolDisplayNames.SCREENSHOT,
      '捕获屏幕截图。可以截取全屏或指定区域，返回图像供AI分析。',
      Kind.Other,
      {
        type: 'object',
        properties: {
          region: {
            type: 'array',
            description: '可选的截图区域 [x, y, width, height]，不传则截取全屏',
            items: { type: 'number' },
            minItems: 4,
            maxItems: 4,
          },
        },
      },
      false, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  /**
   * Validates the parameters for the tool
   */
  protected override validateToolParamValues(
    params: ScreenshotToolParams,
  ): string | null {
    if (params.region) {
      if (params.region.length !== 4) {
        return 'Region must be an array of 4 numbers: [x, y, width, height]';
      }
      const [x, y, width, height] = params.region;
      if (width <= 0 || height <= 0) {
        return 'Width and height must be positive numbers';
      }
      if (x < 0 || y < 0) {
        return 'X and Y coordinates must be non-negative';
      }
    }
    return null;
  }

  protected createInvocation(
    params: ScreenshotToolParams,
  ): ToolInvocation<ScreenshotToolParams, ToolResult> {
    return new ScreenshotToolInvocation(this.config, params);
  }
}
