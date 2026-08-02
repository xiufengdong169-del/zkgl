import { EXPORT_TRIGGER_NAME, main } from "./scheduled-export.js";

main({
  Type: "Timer",
  TriggerName: EXPORT_TRIGGER_NAME,
  Time: new Date().toISOString(),
})
  .then((result) => {
    console.log(JSON.stringify(result));
  })
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "scheduled export failed",
    );
    process.exitCode = 1;
  });
