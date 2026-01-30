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
 * Parameters for MoveMouse tool
 */
export interface MoveMouseParams {
  /**
   * Target position [x, y]
   */
  position: [number, number];
}

/**
 * Parameters for Click tool
 */
export interface ClickParams {
  /**
   * Click position [x, y], optional (uses current position if not provided)
   */
  position?: [number, number];
  /**
   * Button type
   */
  button?: 'left' | 'right' | 'middle';
  /**
   * Click type
   */
  type?: 'click' | 'double' | 'down' | 'up';
}

/**
 * Parameters for Drag tool
 */
export interface DragParams {
  /**
   * Start position [x, y]
   */
  from: [number, number];
  /**
   * End position [x, y]
   */
  to: [number, number];
  /**
   * Duration in milliseconds
   */
  duration?: number;
}

// ============================================
// MoveMouse Tool
// ============================================

class MoveMouseInvocation extends BaseToolInvocation<
  MoveMouseParams,
  ToolResult
> {
  constructor(_config: Config, params: MoveMouseParams) {
    super(params);
  }

  getDescription(): string {
    const [x, y] = this.params.position;
    return `Move mouse to (${x}, ${y})`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const { moveMouse } = await import('../utils/mouseControl.js');
      const [x, y] = this.params.position;
      await moveMouse(x, y);

      return {
        llmContent: `鼠标已移动到 (${x}, ${y})`,
        returnDisplay: `🖱️ 移动到 (${x}, ${y})`,
      };
    } catch (error) {
      const errorMsg = `移动鼠标失败: ${error instanceof Error ? error.message : String(error)}`;
      return {
        llmContent: errorMsg,
        returnDisplay: `❌ ${errorMsg}`,
        error: {
          message: errorMsg,
          type: ToolErrorType.MOUSE_CONTROL_ERROR,
        },
      };
    }
  }
}

export class MoveMouseTool extends BaseDeclarativeTool<
  MoveMouseParams,
  ToolResult
> {
  static readonly Name = ToolNames.MOVE_MOUSE;

  constructor(private config: Config) {
    super(
      MoveMouseTool.Name,
      ToolDisplayNames.MOVE_MOUSE,
      '移动鼠标到指定坐标位置',
      Kind.Other,
      {
        type: 'object',
        properties: {
          position: {
            type: 'array',
            description: '目标位置 [x, y]',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2,
          },
        },
        required: ['position'],
      },
      false,
      false,
    );
  }

  protected override validateToolParamValues(
    params: MoveMouseParams,
  ): string | null {
    if (!params.position || params.position.length !== 2) {
      return 'Position must be an array of 2 numbers: [x, y]';
    }
    return null;
  }

  protected createInvocation(
    params: MoveMouseParams,
  ): ToolInvocation<MoveMouseParams, ToolResult> {
    return new MoveMouseInvocation(this.config, params);
  }
}

// ============================================
// Click Tool
// ============================================

class ClickInvocation extends BaseToolInvocation<ClickParams, ToolResult> {
  constructor(_config: Config, params: ClickParams) {
    super(params);
  }

  getDescription(): string {
    const { position, button = 'left', type = 'click' } = this.params;
    const posStr = position
      ? `at (${position[0]}, ${position[1]})`
      : 'at current position';
    return `${type} ${button} ${posStr}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const { click } = await import('../utils/mouseControl.js');
      const { position, button = 'left', type = 'click' } = this.params;

      await click(position?.[0], position?.[1], button, type);

      const posStr = position ? ` (${position[0]}, ${position[1]})` : '';
      return {
        llmContent: `已${type === 'double' ? '双击' : '点击'}${button}按钮${posStr}`,
        returnDisplay: `🖱️ ${type} ${button}${posStr}`,
      };
    } catch (error) {
      const errorMsg = `点击失败: ${error instanceof Error ? error.message : String(error)}`;
      return {
        llmContent: errorMsg,
        returnDisplay: `❌ ${errorMsg}`,
        error: {
          message: errorMsg,
          type: ToolErrorType.MOUSE_CONTROL_ERROR,
        },
      };
    }
  }
}

export class ClickTool extends BaseDeclarativeTool<ClickParams, ToolResult> {
  static readonly Name = ToolNames.CLICK;

  constructor(private config: Config) {
    super(
      ClickTool.Name,
      ToolDisplayNames.CLICK,
      '在指定位置点击鼠标，如果不指定位置则在当前位置点击',
      Kind.Other,
      {
        type: 'object',
        properties: {
          position: {
            type: 'array',
            description: '点击位置 [x, y]，不传则使用当前位置',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2,
          },
          button: {
            type: 'string',
            description: '鼠标按钮',
            enum: ['left', 'right', 'middle'],
            default: 'left',
          },
          type: {
            type: 'string',
            description: '点击类型',
            enum: ['click', 'double', 'down', 'up'],
            default: 'click',
          },
        },
      },
      false,
      false,
    );
  }

  protected createInvocation(
    params: ClickParams,
  ): ToolInvocation<ClickParams, ToolResult> {
    return new ClickInvocation(this.config, params);
  }
}

// ============================================
// Drag Tool
// ============================================

class DragInvocation extends BaseToolInvocation<DragParams, ToolResult> {
  constructor(_config: Config, params: DragParams) {
    super(params);
  }

  getDescription(): string {
    const [x1, y1] = this.params.from;
    const [x2, y2] = this.params.to;
    return `Drag from (${x1}, ${y1}) to (${x2}, ${y2})`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const { drag } = await import('../utils/mouseControl.js');
      const { from, to, duration = 500 } = this.params;

      await drag(from[0], from[1], to[0], to[1], duration);

      return {
        llmContent: `已从 (${from[0]}, ${from[1]}) 拖拽到 (${to[0]}, ${to[1]})`,
        returnDisplay: `🖱️ 拖拽 (${from[0]}, ${from[1]}) → (${to[0]}, ${to[1]})`,
      };
    } catch (error) {
      const errorMsg = `拖拽失败: ${error instanceof Error ? error.message : String(error)}`;
      return {
        llmContent: errorMsg,
        returnDisplay: `❌ ${errorMsg}`,
        error: {
          message: errorMsg,
          type: ToolErrorType.MOUSE_CONTROL_ERROR,
        },
      };
    }
  }
}

export class DragTool extends BaseDeclarativeTool<DragParams, ToolResult> {
  static readonly Name = ToolNames.DRAG;

  constructor(private config: Config) {
    super(
      DragTool.Name,
      ToolDisplayNames.DRAG,
      '从起始位置拖拽到目标位置',
      Kind.Other,
      {
        type: 'object',
        properties: {
          from: {
            type: 'array',
            description: '起始位置 [x, y]',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2,
          },
          to: {
            type: 'array',
            description: '目标位置 [x, y]',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2,
          },
          duration: {
            type: 'number',
            description: '拖拽持续时间（毫秒）',
            default: 500,
          },
        },
        required: ['from', 'to'],
      },
      false,
      false,
    );
  }

  protected override validateToolParamValues(
    params: DragParams,
  ): string | null {
    if (!params.from || params.from.length !== 2) {
      return 'From must be an array of 2 numbers: [x, y]';
    }
    if (!params.to || params.to.length !== 2) {
      return 'To must be an array of 2 numbers: [x, y]';
    }
    return null;
  }

  protected createInvocation(
    params: DragParams,
  ): ToolInvocation<DragParams, ToolResult> {
    return new DragInvocation(this.config, params);
  }
}
