import { builder } from "./builder";

import "./user/index";
import "./todo/index";
import "./ai/index";

export const schema = builder.toSchema();
