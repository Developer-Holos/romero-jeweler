import { expect, test } from 'vitest'
import { buildTracking } from './tracking.ts'

test('etapa intermedia', () => {
  const t = buildTracking("Fundición", [
    { name: "Fundición", at: 2 },
    { name: "Diseño", at: 1 },
    { name: "Engaste", at: 0 }, // historial posterior a la etapa actual: no se muestra
  ])
  expect(t.label).toBe("Fundición")
  expect(t.percent).toBe(40)
  expect(t.steps[0]).toEqual({ name: "Diseño", date: 1, state: "done" })
  expect(t.steps[4]).toEqual({ name: "Fundición", date: 2, state: "current" })
  expect(t.steps[6]).toEqual({ name: "Engaste", date: undefined, state: "pending" })
})

test('volver atrás borra las fechas de la pasada anterior', () => {
  const t = buildTracking("Fundición", [
    { name: "Diseño", at: 1 },
    { name: "Impresión 3D", at: 2 },
    { name: "Diseño", at: 3 },
    { name: "Fundición", at: 4 },
  ])
  expect(t.steps.map((s) => s.date).slice(0, 5)).toEqual([3, undefined, undefined, undefined, 4])
})

test('cambios en el mismo segundo: gana el avance', () => {
  const t = buildTracking("Lista de Espera", [
    { name: "Lista de Espera", at: 5 },
    { name: "Aprobación de Diseño", at: 5 },
    { name: "Diseño", at: 1 },
  ])
  expect(t.steps.map((s) => s.date).slice(0, 3)).toEqual([1, 5, 5])
})

test('entregado, post-entrega y ganado cuentan como 100%, con la fecha de entrega', () => {
  for (const stage of ["Entregado", "Post-Entrega", "Lead Ganado"]) {
    const t = buildTracking(stage, [
      { name: "Entregado", at: 5 },
      { name: "Post-Entrega", at: 6 },
      { name: "Lead Ganado", at: 7 },
    ])
    expect(t.percent).toBe(100)
    expect(t.label).toBe("Pieza entregada")
    expect(t.steps.every((s) => s.state === "done")).toBe(true)
    expect(t.steps.at(-1)?.date).toBe(5)
  }
})

test('perdido = cancelado', () => {
  const t = buildTracking("Lead Perdido", [{ name: "Diseño", at: 1 }])
  expect(t.cancelled).toBe(true)
  expect(t.steps.every((s) => s.state === "pending" && !s.date)).toBe(true)
})

test('etapa desconocida falla en vez de mostrar Diseño', () => {
  expect(() => buildTracking("Impresion 3D")).toThrow()
})
