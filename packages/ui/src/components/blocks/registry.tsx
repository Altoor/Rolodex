import { todoBlock } from "./todo-block";
import type { BlockDefinition } from "./types";

export const blocks: BlockDefinition[] = [todoBlock];

export const blocksById = new Map(blocks.map((block) => [block.id, block]));
