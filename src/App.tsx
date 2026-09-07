import { useEffect, useMemo, useRef, useState } from 'react'
import { initialPlan } from './data'
import type { PlanWeek, TaskKey, TaskStates } from './types'

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const shortDateFormatter = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
})

type TaskDefinition = {
  key: TaskKey
  label: string
  shortLabel: string
  icon: string
  amount: (week: PlanWeek) => number
  detail?: (week: PlanWeek) => string | null
}

const TASKS: TaskDefinition[] = [
  {
    key: 'licenciaPlacas',
    label: 'Licencia / placas',
    shortLabel: 'Licencia',
    icon: '🪪',
    amount: (week) => week.licenciaPlacas,
  },
  {
    key: 'motoApartado',
    label: 'Apartado moto',
    shortLabel: 'Moto',
    icon: '🏍️',
    amount: (week) => week.motoApartado,
    detail: (week) => (week.quincenaMoto ? `Mensualidad ${week.quincenaMoto}` : null),
  },
  {
    key: 'cascos',
    label: 'Cascos',
    shortLabel: 'Cascos',
    icon: '⛑️',
    amount: (week) => week.cascos,
  },
  {
    key: 'gasolina',
    label: 'Gasolina',
    shortLabel: 'Gasolina',
    icon: '⛽',
    amount: (week) => week.gasolina,
  },
  {
    key: 'saldoNovia',
    label: 'Saldo novia',
    shortLabel: 'Saldo',
    icon: '📱',
    amount: (week) => week.saldoNovia,
  },
  {
    key: 'darNovia',
    label: 'Dar a novia',
    shortLabel: 'Novia',
    icon: '❤️',
    amount: (week) => week.darNovia,
  },
  {
    key: 'gym',
    label: 'Gym',
    shortLabel: 'Gym',
    icon: '🏋️',
    amount: (week) => week.gym,
  },
  {
    key: 'ahorro',
    label: 'Ahorro',
    shortLabel: 'Ahorro',
    icon: '💰',
    amount: (week) => week.ahorro,
  },
  {
    key: 'amazonMusic',
    label: 'Amazon Music',
    shortLabel: 'Amazon',
    icon: '🎵',
    amount: (week) => week.amazonMusic ?? 0,
  },
]

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0)
}

function getCurrentWeekIndex(plan: PlanWeek[]) {
  const today = new Date()
  today.setHours(12, 0, 0, 0)

  const first = parseLocalDate(plan[0]?.date ?? '')
  if (today < first) return 0

  for (let index = plan.length - 1; index >= 0; index -= 1) {
    if (today >= parseLocalDate(plan[index].date)) return index
  }

  return 0
}

function activeTasks(week: PlanWeek) {
  return TASKS.filter((task) => task.amount(week) > 0)
}

function weekSpent(week: PlanWeek) {
  return activeTasks(week).reduce((sum, task) => sum + task.amount(week), 0)
}

function Icon({ path, className = 'h-5 w-5' }: { path: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  )
}

function App() {
  const [plan, setPlan] = useState<PlanWeek[]>(initialPlan)
  const [taskStates, setTaskStates] = useState<TaskStates>({})
  const [selectedIndex, setSelectedIndex] = useState(() => getCurrentWeekIndex(initialPlan))
  const [loading, setLoading] = useState(true)
  const [savingTask, setSavingTask] = useState<string | null>(null)
  const lastAutomaticWeekIndex = useRef(getCurrentWeekIndex(initialPlan))

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const response = await fetch('/api/plan')
        if (!response.ok) throw new Error('No se pudo cargar')
        const data = await response.json()
        if (!active) return
        const nextPlan = Array.isArray(data.plan) && data.plan.length ? data.plan : initialPlan
        const currentIndex = getCurrentWeekIndex(nextPlan)
        setPlan(nextPlan)
        setTaskStates(data.taskStates ?? {})
        setSelectedIndex(currentIndex)
        lastAutomaticWeekIndex.current = currentIndex
      } catch {
        if (!active) return
        const currentIndex = getCurrentWeekIndex(initialPlan)
        setPlan(initialPlan)
        setSelectedIndex(currentIndex)
        lastAutomaticWeekIndex.current = currentIndex
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    function selectNewCurrentWeek() {
      const currentIndex = getCurrentWeekIndex(plan)
      if (currentIndex === lastAutomaticWeekIndex.current) return

      lastAutomaticWeekIndex.current = currentIndex
      setSelectedIndex(currentIndex)
    }

    const intervalId = window.setInterval(selectNewCurrentWeek, 60_000)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') selectNewCurrentWeek()
    }

    window.addEventListener('focus', selectNewCurrentWeek)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', selectNewCurrentWeek)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [plan])

  const week = plan[selectedIndex] ?? plan[0]
  const tasks = useMemo(() => activeTasks(week), [week])
  const completed = tasks.filter((task) => taskStates[week.id]?.[task.key]).length
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 100
  const spent = weekSpent(week)
  const free = week.ingreso - spent

  async function toggleTask(task: TaskDefinition) {
    const current = Boolean(taskStates[week.id]?.[task.key])
    const next = !current
    const saveKey = `${week.id}:${task.key}`

    setTaskStates((previous) => ({
      ...previous,
      [week.id]: {
        ...(previous[week.id] ?? {}),
        [task.key]: next,
      },
    }))
    setSavingTask(saveKey)

    try {
      const response = await fetch(`/api/plan/${week.id}/tasks/${task.key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listo: next }),
      })

      if (!response.ok) throw new Error('No se pudo guardar')
      const data = await response.json()

      if (data.weekStatus) {
        setPlan((previous) =>
          previous.map((item) =>
            item.id === week.id ? { ...item, status: data.weekStatus } : item,
          ),
        )
      }
    } catch {
      setTaskStates((previous) => ({
        ...previous,
        [week.id]: {
          ...(previous[week.id] ?? {}),
          [task.key]: current,
        },
      }))
    } finally {
      setSavingTask(null)
    }
  }

  if (!week) return null

  return (
    <main className="min-h-dvh bg-[#f4f6f8] text-slate-950">
      <div className="mx-auto min-h-dvh w-full max-w-md bg-[#f4f6f8] pb-[calc(28px+env(safe-area-inset-bottom))] sm:max-w-2xl lg:max-w-4xl">
        <header className="sticky top-0 z-30 border-b border-black/5 bg-[#f4f6f8]/95 px-4 pb-3 pt-[calc(14px+env(safe-area-inset-top))] backdrop-blur-xl sm:px-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Plan moto</p>
              <h1 className="mt-0.5 text-[22px] font-black tracking-tight">Semana {week.id}</h1>
            </div>

            <button
              type="button"
              onClick={() => setSelectedIndex(getCurrentWeekIndex(plan))}
              className="rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white active:scale-95"
            >
              Hoy
            </button>
          </div>
        </header>

        <section className="px-4 pt-4 sm:px-6">
          <div className="overflow-hidden rounded-[28px] bg-slate-950 p-5 text-white shadow-xl shadow-slate-950/10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold capitalize text-white/55">{dateFormatter.format(parseLocalDate(week.date))}</p>
                <p className="mt-2 text-3xl font-black tracking-tight">{money.format(spent)}</p>
                <p className="mt-1 text-xs font-semibold text-white/45">de {money.format(week.ingreso)} de ingreso</p>
              </div>

              <div className="grid h-[74px] w-[74px] shrink-0 place-items-center rounded-full bg-white/10">
                <div className="text-center">
                  <p className="text-xl font-black">{completed}/{tasks.length}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-white/45">listos</p>
                </div>
              </div>
            </div>

            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-white transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Libre</p>
                <p className={`mt-1 text-lg font-black ${free < 0 ? 'text-red-300' : ''}`}>{money.format(free)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Progreso</p>
                <p className="mt-1 text-lg font-black">{progress}%</p>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pt-4 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Semana anterior"
              disabled={selectedIndex === 0}
              onClick={() => setSelectedIndex((index) => Math.max(0, index - 1))}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-black/5 disabled:opacity-30 active:scale-95"
            >
              <Icon path="m15 18-6-6 6-6" />
            </button>

            <label className="relative min-w-0 flex-1">
              <select
                value={selectedIndex}
                onChange={(event) => setSelectedIndex(Number(event.target.value))}
                className="h-11 w-full appearance-none rounded-2xl border-0 bg-white pl-4 pr-10 text-sm font-extrabold shadow-sm outline-none ring-1 ring-black/5"
              >
                {plan.map((item, index) => (
                  <option key={item.id} value={index}>
                    Semana {item.id} · {shortDateFormatter.format(parseLocalDate(item.date))}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">⌄</span>
            </label>

            <button
              type="button"
              aria-label="Semana siguiente"
              disabled={selectedIndex === plan.length - 1}
              onClick={() => setSelectedIndex((index) => Math.min(plan.length - 1, index + 1))}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-black/5 disabled:opacity-30 active:scale-95"
            >
              <Icon path="m9 18 6-6-6-6" />
            </button>
          </div>
        </section>

        <section className="px-4 pt-5 sm:px-6">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-lg font-black tracking-tight">Apartados</h2>
            <span className="text-xs font-bold text-slate-400">{completed} de {tasks.length}</span>
          </div>

          <div className="space-y-3">
            {tasks.map((task) => {
              const done = Boolean(taskStates[week.id]?.[task.key])
              const isSaving = savingTask === `${week.id}:${task.key}`
              const detail = task.detail?.(week)

              return (
                <button
                  key={task.key}
                  type="button"
                  disabled={isSaving || loading}
                  onClick={() => toggleTask(task)}
                  className={`flex w-full items-center gap-3 rounded-[22px] p-3.5 text-left shadow-sm ring-1 transition active:scale-[0.985] ${
                    done
                      ? 'bg-emerald-50 ring-emerald-200'
                      : 'bg-white ring-black/5'
                  }`}
                >
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xl ${done ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                    {task.icon}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className={`block text-[15px] font-extrabold ${done ? 'text-emerald-950' : 'text-slate-950'}`}>
                      {task.label}
                    </span>
                    <span className="mt-0.5 block text-xs font-semibold text-slate-400">
                      {detail ?? money.format(task.amount(week))}
                    </span>
                  </span>

                  <span className="text-right">
                    {detail ? (
                      <span className="mb-1 block text-sm font-black tabular-nums text-slate-900">
                        {money.format(task.amount(week))}
                      </span>
                    ) : null}
                    <span
                      className={`inline-flex h-8 min-w-[72px] items-center justify-center rounded-full px-3 text-xs font-black ${
                        done ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {isSaving ? '...' : done ? '✓ Listo' : 'Marcar'}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
