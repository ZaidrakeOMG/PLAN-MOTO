import { createClient } from '@supabase/supabase-js'
import { initialPlan } from '../src/data.js'
import type { PlanWeek, TaskKey, TaskStates, WeekStatus } from '../src/types.js'

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

const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, '') ?? ''
const supabaseSecret = process.env.SUPABASE_SECRET_KEY?.trim() ?? ''

function getSupabase() {
  if (!supabaseUrl || !supabaseSecret) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en Vercel')
  }

  return createClient(supabaseUrl, supabaseSecret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function statusValue(value: unknown): WeekStatus {
  return value === 'Listo' || value === 'Hecho' ? 'Listo' : 'Pendiente'
}

function toDbRow(row: PlanWeek) {
  return {
    semana: row.id,
    fecha: row.date,
    ingreso: row.ingreso ?? 0,
    licencia_placas: row.licenciaPlacas ?? 0,
    moto_apartado: row.motoApartado ?? 0,
    quincena_moto: row.quincenaMoto || null,
    cascos: row.cascos ?? 0,
    gasolina: row.gasolina ?? 0,
    saldo_novia: row.saldoNovia ?? 0,
    dar_novia: row.darNovia ?? 0,
    gym: row.gym ?? 0,
    ahorro: row.ahorro ?? 0,
    amazon_music: row.amazonMusic ?? 0,
    estado: statusValue(row.status),
  }
}

function fromDbRow(row: Record<string, unknown>): PlanWeek {
  const weekNumber = Number(row.semana)
  const original = initialPlan.find((item) => item.id === weekNumber)

  return {
    id: weekNumber,
    excelRow: original?.excelRow ?? weekNumber + 4,
    date: String(row.fecha ?? original?.date ?? ''),
    ingreso: numberValue(row.ingreso),
    licenciaPlacas: numberValue(row.licencia_placas),
    motoApartado: numberValue(row.moto_apartado),
    quincenaMoto: String(row.quincena_moto ?? original?.quincenaMoto ?? ''),
    cascos: numberValue(row.cascos),
    gasolina: numberValue(row.gasolina),
    saldoNovia: numberValue(row.saldo_novia),
    darNovia: numberValue(row.dar_novia),
    gym: numberValue(row.gym),
    ahorro: numberValue(row.ahorro),
    amazonMusic: numberValue(row.amazon_music),
    status: statusValue(row.estado),
    tone: original?.tone ?? 'plain',
  }
}

function isTaskKey(value: string): value is TaskKey {
  return TASK_KEYS.includes(value as TaskKey)
}

function activeTaskKeys(week: PlanWeek): TaskKey[] {
  return TASK_KEYS.filter((key) => {
    const value = week[key]
    return typeof value === 'number' && value > 0
  })
}

async function ensurePlan() {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('plan_semanal')
    .select('semana,fecha,ingreso,licencia_placas,moto_apartado,quincena_moto,cascos,gasolina,saldo_novia,dar_novia,gym,ahorro,amazon_music,estado')
    .order('semana', { ascending: true })

  if (error) throw error

  if (data?.length) return data.map((row) => fromDbRow(row as Record<string, unknown>))

  const { error: seedError } = await supabase
    .from('plan_semanal')
    .upsert(initialPlan.map(toDbRow), { onConflict: 'semana' })

  if (seedError) throw seedError
  return initialPlan.map((row) => ({ ...row, amazonMusic: row.amazonMusic ?? 0 }))
}

export async function GET() {
  try {
    const supabase = getSupabase()
    const plan = await ensurePlan()

    const { data: tasks, error } = await supabase
      .from('plan_tareas')
      .select('semana,apartado,listo')
      .order('semana', { ascending: true })

    if (error) throw error

    const taskStates: TaskStates = {}

    for (const row of tasks ?? []) {
      const week = Number(row.semana)
      const task = String(row.apartado)
      if (!Number.isInteger(week) || !isTaskKey(task)) continue

      taskStates[week] = {
        ...(taskStates[week] ?? {}),
        [task]: Boolean(row.listo),
      }
    }

    return Response.json({ source: 'supabase', plan, taskStates })
  } catch (error) {
    console.error('GET /api/plan failed:', error)
    return Response.json({ error: 'No se pudo cargar el plan' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const url = new URL(request.url)
    const weekNumber = Number(url.searchParams.get('week'))
    const task = url.searchParams.get('task') ?? ''
    const body = await request.json().catch(() => null) as { listo?: unknown } | null
    const listo = body?.listo

    if (!Number.isInteger(weekNumber) || weekNumber < 1 || !isTaskKey(task)) {
      return Response.json({ error: 'Apartado inválido' }, { status: 400 })
    }

    if (typeof listo !== 'boolean') {
      return Response.json({ error: 'Estado inválido' }, { status: 400 })
    }

    const supabase = getSupabase()
    const plan = await ensurePlan()
    const week = plan.find((row) => row.id === weekNumber)

    if (!week) {
      return Response.json({ error: 'Semana no encontrada' }, { status: 404 })
    }

    const { error: saveError } = await supabase
      .from('plan_tareas')
      .upsert(
        { semana: weekNumber, apartado: task, listo },
        { onConflict: 'semana,apartado' },
      )

    if (saveError) throw saveError

    const { data: weekTasks, error: tasksError } = await supabase
      .from('plan_tareas')
      .select('apartado,listo')
      .eq('semana', weekNumber)

    if (tasksError) throw tasksError

    const states = new Map<string, boolean>()
    for (const row of weekTasks ?? []) {
      states.set(String(row.apartado), Boolean(row.listo))
    }

    const activeKeys = activeTaskKeys(week)
    const weekStatus: WeekStatus =
      activeKeys.length > 0 && activeKeys.every((key) => states.get(key) === true)
        ? 'Listo'
        : 'Pendiente'

    const { error: statusError } = await supabase
      .from('plan_semanal')
      .update({ estado: weekStatus })
      .eq('semana', weekNumber)

    if (statusError) throw statusError

    return Response.json({
      saved: true,
      week: weekNumber,
      task,
      listo,
      weekStatus,
    })
  } catch (error) {
    console.error('PATCH /api/plan failed:', error)
    return Response.json({ error: 'No se pudo guardar el apartado' }, { status: 500 })
  }
}
