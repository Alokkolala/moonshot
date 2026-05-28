import express from 'express'
import cors from 'cors'
import 'dotenv/config'

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors())
app.use(express.json())
app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.listen(PORT, () =>
  console.log(`Moonshot server running on http://localhost:${PORT}`)
)
