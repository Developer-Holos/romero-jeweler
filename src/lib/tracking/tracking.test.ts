import { expect, test } from 'vitest'
import { buildTracking } from './tracking.ts'

test('etapa intermedia', () => {
  const t = buildTracking("Fundición", { "Diseño": 1, "Fundición": 2, "Engaste": 3 })
  expect(t.label).toBe("Fundición")
  expect(t.percent).toBe(40)
  expect(t.steps[0]).toEqual({ name: "Diseño", date: 1, state: "done" })
  expect(t.steps[4]).toEqual({ name: "Fundición", date: 2, state: "current" })
  expect(t.steps[6]).toEqual({ name: "Engaste", date: undefined, state: "pending" })
})

test('entregado, post-entrega y ganado cuentan como 100%', () => {
  for (const stage of ["Entregado", "Post-Entrega", "Lead Ganado"]) {
    const t = buildTracking(stage)
    expect(t.percent).toBe(100)
    expect(t.label).toBe("Pieza entregada")
    expect(t.steps.every((s) => s.state === "done")).toBe(true)
  }
})

test('perdido = cancelado', () => {
  const t = buildTracking("Lead Perdido")
  expect(t.cancelled).toBe(true)
  expect(t.steps.every((s) => s.state === "pending")).toBe(true)
})
