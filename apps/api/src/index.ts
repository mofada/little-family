import { app } from './app'
import { config } from './config'
import { startBirthdayReminderScheduler } from './birthdayReminders'

app.listen(config.port, () => {
  console.log(`Little Family API listening on http://localhost:${config.port}`)
  startBirthdayReminderScheduler()
})
