import { todoBlock } from "./todo-block";
import { fileBlock } from "./file-block";
import type { BlockDefinition } from "./types";

export const blocks: BlockDefinition[] = [fileBlock, todoBlock];

export const blocksById = new Map(blocks.map((block) => [block.id, block]));
