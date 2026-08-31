export const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export function validateCreateTicket(input = {}) {
  const title = String(input.title ?? "").trim();
  const description = String(input.description ?? "").trim();
  const priority = String(input.priority ?? "MEDIUM").toUpperCase();

  if (title.length < 5 || title.length > 120) {
    throw new ValidationError("El título debe tener entre 5 y 120 caracteres.");
  }
  if (description.length < 10 || description.length > 2000) {
    throw new ValidationError("La descripción debe tener entre 10 y 2000 caracteres.");
  }
  if (!PRIORITIES.includes(priority)) {
    throw new ValidationError("La prioridad no es válida.");
  }

  return { title, description, priority };
}

export function validateTicketUpdate(input = {}) {
  const allowed = {};

  if (input.status !== undefined) {
    const status = String(input.status).toUpperCase();
    if (!STATUSES.includes(status)) throw new ValidationError("El estado no es válido.");
    allowed.status = status;
  }

  if (input.priority !== undefined) {
    const priority = String(input.priority).toUpperCase();
    if (!PRIORITIES.includes(priority)) throw new ValidationError("La prioridad no es válida.");
    allowed.priority = priority;
  }

  if (input.assignedTo !== undefined) {
    const assignedTo = String(input.assignedTo).trim();
    if (assignedTo.length > 100) throw new ValidationError("El responsable es demasiado largo.");
    allowed.assignedTo = assignedTo;
  }

  if (Object.keys(allowed).length === 0) {
    throw new ValidationError("No se proporcionaron cambios permitidos.");
  }

  return allowed;
}

export function summarizeTickets(tickets) {
  return {
    total: tickets.length,
    open: tickets.filter((ticket) => ticket.status === "OPEN").length,
    inProgress: tickets.filter((ticket) => ticket.status === "IN_PROGRESS").length,
    resolved: tickets.filter((ticket) => ticket.status === "RESOLVED").length,
    critical: tickets.filter((ticket) => ticket.priority === "CRITICAL").length
  };
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}
