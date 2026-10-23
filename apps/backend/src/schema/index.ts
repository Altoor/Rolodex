import { builder } from "./builder";

import "./user/index";
import "./todo/index";
import "./ai/index";
import "./llmModel/index";

export const schema = builder.toSchema();
