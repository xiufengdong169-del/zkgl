import tcb from "@cloudbase/node-sdk";

import {
  findSessionUserByCloudbaseUid,
  getPool,
  MySqlAuditWriter,
} from "./database.js";
import {
  type CloudContext,
  type HttpLikeEvent,
  normalizeFunctionEvent,
} from "./cloud-function-event.js";
import { handle } from "./handler.js";
import { MySqlActionExecutor } from "./persistence.js";

export async function main(
  rawEvent: HttpLikeEvent,
  context: CloudContext = {},
) {
  const pool = getPool();
  const storage = tcb.init({
    env: process.env.CLOUDBASE_ENV_ID || tcb.SYMBOL_CURRENT_ENV,
  });
  const executor = new MySqlActionExecutor(pool, async (fileId, maxAge) => {
    const result = await storage.getTempFileURL({
      fileList: [{ fileID: fileId, maxAge }],
    });
    const url = result.fileList?.[0]?.tempFileURL;
    if (!url) throw new Error("未获取到文件临时地址");
    return url;
  });

  const normalizedEvent = normalizeFunctionEvent(rawEvent, context);
  return handle(normalizedEvent, {
    audit: new MySqlAuditWriter(pool),
    findUserByCloudbaseUid: (uid) => findSessionUserByCloudbaseUid(pool, uid),
    execute: (action, input, user) => executor.execute(action, input, user),
  });
}
