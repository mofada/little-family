import { app } from './app'
import { config } from './config'

app.listen(config.port, () => {
  console.log(`Little Family API listening on http://localhost:${config.port}`)
})
