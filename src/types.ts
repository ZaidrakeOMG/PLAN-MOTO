export type RowTone = 'dark' | 'yellow' | 'green' | 'plain'
export type WeekStatus = 'Pendiente' | 'Listo'

export type TaskKey =
  | 'licenciaPlacas'
  | 'motoApartado'
  | 'cascos'
  | 'gasolina'
  | 'saldoNovia'
  | 'darNovia'
  | 'gym'
  | 'ahorro'
  | 'amazonMusic'

export type TaskStates = Record<number, Partial<Record<TaskKey, boolean>>>

export interface PlanWeek {
  id: number
  excelRow: number
  date: string
  ingreso: number
  licenciaPlacas: number
  motoApartado: number
  quincenaMoto: string
  cascos: number
  gasolina: number
  saldoNovia: number
  darNovia: number
  gym: number
  ahorro: number
  amazonMusic: number | null
  status: WeekStatus
  tone: RowTone
}
