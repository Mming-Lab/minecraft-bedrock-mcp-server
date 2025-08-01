import { BaseTool } from '../../base/tool';
import { ToolCallResult, InputSchema } from '../../../types';

/**
 * 立方体構造物を建築するツール
 * 
 * @description
 * 指定された2点間に立方体または中空立方体を建築します。
 * 大量のブロック操作に対するボリューム制限（最大32768ブロック）があり、
 * 安全性とパフォーマンスを確保します。
 * 
 * @extends BaseTool
 * 
 * @example
 * ```typescript
 * const tool = new BuildCubeTool();
 * 
 * // 実体の石の立方体を建築
 * await tool.execute({
 *   x1: 0, y1: 64, z1: 0,
 *   x2: 10, y2: 74, z2: 10,
 *   material: "stone",
 *   hollow: false
 * });
 * 
 * // 中空のガラスの立方体を建築
 * await tool.execute({
 *   x1: 20, y1: 64, z1: 20,
 *   x2: 30, y2: 80, z2: 30,
 *   material: "glass",
 *   hollow: true
 * });
 * ```
 * 
 * @since 1.0.0
 * @author mcbk-mcp contributors
 */
export class BuildCubeTool extends BaseTool {
    readonly name = 'build_cube';
    readonly description = 'Build CUBE/RECTANGLE: box, rectangle, wall, platform, room, house frame. Define with 2 corners (x1,y1,z1) to (x2,y2,z2). Coordinates can be positive or negative (e.g. x:-50, z:-100). Supports sequences for automation.';
    readonly inputSchema: InputSchema = {
        type: 'object',
        properties: {
            action: {
                type: 'string',
                description: 'Build action to perform',
                enum: ['build'],
                default: 'build'
            },
            x1: {
                type: 'number',
                description: 'Starting X coordinate (east-west, can be negative like -50)'
            },
            y1: {
                type: 'number',
                description: 'Starting Y coordinate (height, usually 64-100 for ground level)'
            },
            z1: {
                type: 'number',
                description: 'Starting Z coordinate (north-south, can be negative like -100)'
            },
            x2: {
                type: 'number',
                description: 'Ending X coordinate (east-west, can be negative)'
            },
            y2: {
                type: 'number',
                description: 'Ending Y coordinate (height, can be higher than y1 for tall structures)'
            },
            z2: {
                type: 'number',
                description: 'Ending Z coordinate (north-south, can be negative)'
            },
            material: {
                type: 'string',
                description: 'Block material to use',
                default: 'minecraft:stone'
            },
            hollow: {
                type: 'boolean',
                description: 'Create hollow cube (default: false)',
                default: false
            }
        },
        required: ['x1', 'y1', 'z1', 'x2', 'y2', 'z2']
    };

    /**
     * 立方体構造物を建築します
     * 
     * @param args - 建築パラメータ
     * @param args.x1 - 開始点のX座標
     * @param args.y1 - 開始点のY座標
     * @param args.z1 - 開始点のZ座標
     * @param args.x2 - 終了点のX座標
     * @param args.y2 - 終了点のY座標
     * @param args.z2 - 終了点のZ座標
     * @param args.material - 使用するブロック素材（デフォルト: "minecraft:stone"）
     * @param args.hollow - 中空にするかどうか（デフォルト: false）
     * @returns 建築実行結果
     * 
     * @throws Y座標が範囲外の場合
     * @throws ボリュームが制限を超える場合（32768ブロック超過）
     * 
     * @example
     * ```typescript
     * // 小さな石の家を建築
     * const result = await tool.execute({
     *   x1: 0, y1: 64, z1: 0,
     *   x2: 5, y2: 68, z2: 5,
     *   material: "cobblestone",
     *   hollow: true
     * });
     * 
     * if (result.success) {
     *   console.log(`建築完了: ${result.data.volume}ブロック使用`);
     * }
     * ```
     */
    async execute(args: {
        action?: string;
        x1: number;
        y1: number;
        z1: number;
        x2: number;
        y2: number;
        z2: number;
        material?: string;
        hollow?: boolean;
    }): Promise<ToolCallResult> {
        try {
            const { action = 'build', x1, y1, z1, x2, y2, z2, material = 'minecraft:stone', hollow = false } = args;
            
            // actionパラメータをサポート（現在は build のみ）
            if (action !== 'build') {
                return this.createErrorResponse(`Unknown action: ${action}. Only 'build' is supported.`);
            }
            
            // 座標の整数化
            const coords = {
                x1: Math.floor(x1),
                y1: Math.floor(y1),
                z1: Math.floor(z1),
                x2: Math.floor(x2),
                y2: Math.floor(y2),
                z2: Math.floor(z2)
            };
            
            // Y座標の検証
            if (coords.y1 < -64 || coords.y1 > 320 || coords.y2 < -64 || coords.y2 > 320) {
                return {
                    success: false,
                    message: 'Y coordinates must be between -64 and 320'
                };
            }
            
            // 範囲の検証
            const volume = Math.abs(coords.x2 - coords.x1 + 1) * Math.abs(coords.y2 - coords.y1 + 1) * Math.abs(coords.z2 - coords.z1 + 1);
            if (volume > 32768) {
                return {
                    success: false,
                    message: 'Volume too large (maximum 32768 blocks)'
                };
            }
            
            // Socket-BE APIを使用してブロック配置
            if (!this.world) {
                return { success: false, message: 'World not available. Ensure Minecraft is connected.' };
            }

            // ブロックIDの正規化
            let blockId = material;
            if (!blockId.includes(':')) {
                blockId = `minecraft:${blockId}`;
            }

            try {
                let blocksPlaced = 0;
                
                if (hollow) {
                    // 中空立方体: 外壁を作成してから内部を削除
                    // 1. まず外壁全体を作成
                    blocksPlaced = await this.world.fillBlocks(
                        {x: coords.x1, y: coords.y1, z: coords.z1},
                        {x: coords.x2, y: coords.y2, z: coords.z2},
                        blockId
                    );
                    
                    // 2. 内部を空洞にする（1ブロック内側）
                    const innerX1 = Math.min(coords.x1, coords.x2) + 1;
                    const innerY1 = Math.min(coords.y1, coords.y2) + 1;
                    const innerZ1 = Math.min(coords.z1, coords.z2) + 1;
                    const innerX2 = Math.max(coords.x1, coords.x2) - 1;
                    const innerY2 = Math.max(coords.y1, coords.y2) - 1;
                    const innerZ2 = Math.max(coords.z1, coords.z2) - 1;
                    
                    // 内部に空洞があるかチェック
                    if (innerX1 <= innerX2 && innerY1 <= innerY2 && innerZ1 <= innerZ2) {
                        const removedBlocks = await this.world.fillBlocks(
                            {x: innerX1, y: innerY1, z: innerZ1},
                            {x: innerX2, y: innerY2, z: innerZ2},
                            'minecraft:air'
                        );
                        blocksPlaced -= removedBlocks;
                    }
                } else {
                    // 実体立方体: Socket-BE fillBlocks使用
                    blocksPlaced = await this.world.fillBlocks(
                        {x: coords.x1, y: coords.y1, z: coords.z1},
                        {x: coords.x2, y: coords.y2, z: coords.z2},
                        blockId
                    );
                }

                return {
                    success: true,
                    message: `${hollow ? 'Hollow' : 'Solid'} cube built with ${blockId} from (${coords.x1},${coords.y1},${coords.z1}) to (${coords.x2},${coords.y2},${coords.z2}). Placed ${blocksPlaced} blocks.`,
                    data: {
                        type: 'cube',
                        from: { x: coords.x1, y: coords.y1, z: coords.z1 },
                        to: { x: coords.x2, y: coords.y2, z: coords.z2 },
                        material: blockId,
                        hollow: hollow,
                        volume: blocksPlaced,
                        apiUsed: 'Socket-BE'
                    }
                };
            } catch (error) {
                return {
                    success: false,
                    message: `Building error: ${error instanceof Error ? error.message : String(error)}`
                };
            }

        } catch (error) {
            return {
                success: false,
                message: `Error building cube: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}