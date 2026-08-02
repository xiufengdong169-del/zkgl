import { REMINDER_TRIGGER_NAME, main } from "./scheduled-reminder.js";

main({
  Type: "Timer",
  TriggerName: REMINDER_TRIGGER_NAME,
  Time: new Date().toISOString(),
})
  .then((result) => {
    console.log(JSON.stringify(result));
  })
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "scheduled reminder failed",
    );
    process.exitCode = 1;
  });
