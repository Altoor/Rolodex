import { builder } from "./builder";

import "./user/index";
import "./todo/index";

export const schema = builder.toSchema();
