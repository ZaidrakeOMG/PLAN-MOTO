import 'dotenv/config'
import dotenv from 'dotenv'
import express from 'express'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initialPlan } from '../src/data'
import type { PlanWeek, TaskKey, TaskStates, WeekStatus } from '../src/types'

dotenv.config({ path: '.env.local', override: true })

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const localDataPath = path.join(projectRoot, 'server', 'data', 'plan.json')
const localTasksPath = path.join(projectRoot, 'server', 'data', 'tasks.json')
const port = Number(process.env.PORT || 8787)

const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, '') || ''
const supabaseSecret = process.env.SUPABASE_SECRET_KEY?.trim() || ''
let supabase: SupabaseClient | null = null

const TASK_KEYS: TaskKey[] = [
  'licenciaPlacas',
  'motoApartado',
  'cascos',
  'gasolina',
  'saldoNovia',
  'darNovia',
  'gym',
  'ahorro',
  'amazonMusic',
]

type DbPlanWeek = {
  semana: number
  fecha: string | null
  ingreso: number | string | null
  licencia_placas: number | string | null
  moto_apartado: number | string | null
  quincena_moto: string | null
  cascos: number | string | null
  gasolina: number | string | null
  saldo_novia: number | string | null
  dar_novia: number | string | null
  gym: number | string | null
  ahorro: number | string | null
  amazon_music: number | string | null
  estado: string | null
}

type DbTask = {
  semana: number
  apartado: TaskKey
  listo: boolean
}

function getSupabase() {
  if (!supabaseUrl || !supabaseSecret) return null
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  }
  return supabase
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeStatus(value: unknown): WeekStatus {
  return value === 'Listo' || value === 'Hecho' ? 'Listo' : 'Pendiente'
}

function toDbRow(row: PlanWeek) {
  return {
    semana: row.id,
    fecha: row.date,
    ingreso: row.ingreso,
    licencia_placas: row.licenciaPlacas,
    moto_apartado: row.motoApartado,
    quincena_moto: row.quincenaMoto || null,
    cascos: row.cascos,
    gasolina: row.gasolina,
    saldo_novia: row.saldoNovia,
    dar_novia: row.darNovia,
    gym: row.gym,
    ahorro: row.ahorro,
    amazon_music: row.amazonMusic ?? 0,
    estado: normalizeStatus(row.status),
  }
}

function fromDbRow(row: DbPlanWeek): PlanWeek {
  const original = initialPlan.find((item) => item.id === Number(row.semana))
  return {
    id: Number(row.semana),
    excelRow: original?.excelRow ?? Number(row.semana) + 4,
    date: row.fecha || original?.date || '',
    ingreso: toNumber(row.ingreso),
    licenciaPlacas: toNumber(row.licencia_placas),
    motoApartado: toNumber(row.moto_apartado),
    quincenaMoto: row.quincena_moto ?? original?.quincenaMoto ?? '',
    cascos: toNumber(row.cascos),
    gasolina: toNumber(row.gasolina),
    saldoNovia: toNumber(row.saldo_novia),
    darNovia: toNumber(row.dar_novia),
    gym: toNumber(row.gym),
    ahorro: toNumber(row.ahorro),
    amazonMusic: row.amazon_music === null || row.amazon_music === undefined ? null : toNumber(row.amazon_music),
    status: normalizeStatus(row.estado),
    tone: original?.tone ?? 'plain',
  }
}

function isTaskKey(value: unknown): value is TaskKey {
  return typeof value === 'string' && TASK_KEYS.includes(value as TaskKey)
}

function activeTaskKeys(week: PlanWeek): TaskKey[] {
  return TASK_KEYS.filter((key) => {
    const value = week[key]
    return typeof value === 'number' && value > 0
  })
}

async function ensureLocalData() {
  await fs.mkdir(path.dirname(localDataPath), { recursive: true })
  if (!existsSync(localDataPath)) {
    await fs.writeFile(localDataPath, JSON.stringify(initialPlan, null, 2), 'utf8')
  }
  if (!existsSync(localTasksPath)) {
    await fs.writeFile(localTasksPath, JSON.stringify({}, null, 2), 'utf8')
  }
}

async function readLocalPlan(): Promise<PlanWeek[]> {
  await ensureLocalData()
  const raw = await fs.readFile(localDataPath, 'utf8')
  return (JSON.parse(raw) as PlanWeek[]).map((row) => ({ ...row, status: normalizeStatus(row.status) }))
}

async function writeLocalPlan(plan: PlanWeek[]) {
  await ensureLocalData()
  await fs.writeFile(localDataPath, JSON.stringify(plan, null, 2), 'utf8')
}

async function readLocalTasks(): Promise<TaskStates> {
  await ensureLocalData()
  return JSON.parse(await fs.readFile(localTasksPath, 'utf8')) as TaskStates
}

async function writeLocalTasks(states: TaskStates) {
  await ensureLocalData()
  await fs.writeFile(localTasksPath, JSON.stringify(states, null, 2), 'utf8')
}

async function readSupabasePlan(client: SupabaseClient): Promise<PlanWeek[]> {
  const { data, error } = await client
    .from('plan_semanal')
    .select('semana,fecha,ingreso,licencia_placas,moto_apartado,quincena_moto,cascos,gasolina,saldo_novia,dar_novia,gym,ahorro,amazon_music,estado')
    .order('semana', { ascending: true })
  if (error) throw error
  return ((data ?? []) as DbPlanWeek[]).map(fromDbRow)
}

async function upsertSupabasePlan(client: SupabaseClient, plan: PlanWeek[]) {
  const { error } = await client.from('plan_semanal').upsert(plan.map(toDbRow), { onConflict: 'semana' })
  if (error) throw error
}

async function readSupabaseTasks(client: SupabaseClient): Promise<TaskStates> {
  const { data, error } = await client
    .from('plan_tareas')
    .select('semana,apartado,listo')
    .order('semana', { ascending: true })
  if (error) throw error

  const states: TaskStates = {}
  for (const row of (data ?? []) as DbTask[]) {
    if (!isTaskKey(row.apartado)) continue
    states[row.semana] = { ...(states[row.semana] ?? {}), [row.apartado]: Boolean(row.listo) }
  }
  return states
}

async function seedPlanIfEmpty(client: SupabaseClient) {
  const remote = await readSupabasePlan(client)
  if (remote.length) return remote
  const local = await readLocalPlan()
  await upsertSupabasePlan(client, local)
  return local
}

async function calculateAndSaveWeekStatus(client: SupabaseClient | null, weekNumber: number, plan: PlanWeek[], states: TaskStates) {
  const week = plan.find((row) => row.id === weekNumber)
  if (!week) return 'Pendiente' as WeekStatus

  const keys = activeTaskKeys(week)
  const status: WeekStatus = keys.length > 0 && keys.every((key) => Boolean(states[weekNumber]?.[key])) ? 'Listo' : 'Pendiente'

  const localPlan = plan.map((row) => (row.id === weekNumber ? { ...row, status } : row))
  await writeLocalPlan(localPlan)

  if (client) {
    const { error } = await client.from('plan_semanal').update({ estado: status }).eq('semana', weekNumber)
    if (error) throw error
  }
  return status
}

const app = express()
app.use(express.json({ limit: '1mb' }))

app.get('/api/config', (_req, res) => {
  res.json({
    connected: Boolean(getSupabase()),
    url: supabaseUrl || null,
    table: 'plan_semanal',
    tasksTable: 'plan_tareas',
  })
})

app.get('/api/plan', async (_req, res) => {
  const client = getSupabase()

  try {
    if (client) {
      const plan = await seedPlanIfEmpty(client)
      const taskStates = await readSupabaseTasks(client)
      await writeLocalPlan(plan)
      await writeLocalTasks(taskStates)
      return res.json({ source: 'supabase', plan, taskStates })
    }

    return res.json({ source: 'local', plan: await readLocalPlan(), taskStates: await readLocalTasks() })
  } catch (error) {
    console.error('Supabase read failed:', error)
    return res.json({ source: 'local', plan: await readLocalPlan(), taskStates: await readLocalTasks() })
  }
})

app.put('/api/plan', async (req, res) => {
  const plan = req.body?.plan
  if (!Array.isArray(plan)) return res.status(400).json({ error: 'Plan inválido' })

  try {
    await writeLocalPlan(plan)
    const client = getSupabase()
    if (client) await upsertSupabasePlan(client, plan)
    return res.json({ saved: true })
  } catch (error) {
    console.error('Plan save failed:', error)
    return res.status(500).json({ error: 'No se pudo guardar' })
  }
})

app.patch('/api/plan/:week/tasks/:task', async (req, res) => {
  const weekNumber = Number(req.params.week)
  const task = req.params.task
  const listo = req.body?.listo

  if (!Number.isInteger(weekNumber) || weekNumber < 1 || !isTaskKey(task)) {
    return res.status(400).json({ error: 'Apartado inválido' })
  }
  if (typeof listo !== 'boolean') {
    return res.status(400).json({ error: 'Estado inválido' })
  }

  try {
    const localStates = await readLocalTasks()
    const nextStates: TaskStates = {
      ...localStates,
      [weekNumber]: {
        ...(localStates[weekNumber] ?? {}),
        [task]: listo,
      },
    }
    await writeLocalTasks(nextStates)

    const client = getSupabase()
    let plan = await readLocalPlan()
    let statesForStatus = nextStates

    if (client) {
      const { error } = await client
        .from('plan_tareas')
        .upsert({ semana: weekNumber, apartado: task, listo }, { onConflict: 'semana,apartado' })
      if (error) throw error

      plan = await seedPlanIfEmpty(client)
      statesForStatus = await readSupabaseTasks(client)
      await writeLocalTasks(statesForStatus)
    }

    const weekStatus = await calculateAndSaveWeekStatus(client, weekNumber, plan, statesForStatus)
    return res.json({ saved: true, week: weekNumber, task, listo, weekStatus })
  } catch (error) {
    console.error('Task save failed:', error)
    return res.status(500).json({ error: 'No se pudo guardar el apartado' })
  }
})

const distPath = path.join(projectRoot, 'dist')
if (existsSync(path.join(distPath, 'index.html'))) {
  app.use(express.static(distPath))
  app.get('/*splat', (_req, res) => res.sendFile(path.join(distPath, 'index.html')))
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Plan Moto listo en http://localhost:${port}`)
})
