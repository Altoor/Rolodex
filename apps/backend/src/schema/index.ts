import { builder } from "./builder";

import "./user/index";
import "./todo/index";
import "./ai/index";
import "./task/index";
import "./tool/index";
import "./llmModel/index";
import "./file/index";

export const schema = builder.toSchema();
