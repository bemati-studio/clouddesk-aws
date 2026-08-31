import test from "node:test";
import assert from "node:assert/strict";
import {
  ValidationError,
  summarizeTickets,
  validateCreateTicket,
  validateTicketUpdate
} from "../src/domain.mjs";

test("normaliza una solicitud válida", () => {
  assert.deepEqual(validateCreateTicket({
    title: "  Error al iniciar sesión  ",
    description: "El usuario recibe un mensaje de acceso denegado.",
    priority: "high"
  }), {
    title: "Error al iniciar sesión",
    description: "El usuario recibe un mensaje de acceso denegado.",
    priority: "HIGH"
  });
});

test("rechaza títulos demasiado cortos", () => {
  assert.throws(
    () => validateCreateTicket({ title: "Err", description: "Descripción válida del error." }),
    ValidationError
  );
});

test("acepta solo campos editables", () => {
  assert.deepEqual(validateTicketUpdate({ status: "resolved", ignored: true }), { status: "RESOLVED" });
});

test("rechaza una prioridad desconocida", () => {
  assert.throws(
    () => validateCreateTicket({ title: "Error de acceso", description: "Descripción válida del error.", priority: "urgent" }),
    ValidationError
  );
});

test("rechaza una actualización sin campos permitidos", () => {
  assert.throws(() => validateTicketUpdate({ title: "Cambio no permitido" }), ValidationError);
});

test("calcula métricas desde tickets reales", () => {
  const summary = summarizeTickets([
    { status: "OPEN", priority: "CRITICAL" },
    { status: "IN_PROGRESS", priority: "HIGH" },
    { status: "RESOLVED", priority: "LOW" }
  ]);
  assert.deepEqual(summary, { total: 3, open: 1, inProgress: 1, resolved: 1, critical: 1 });
});
