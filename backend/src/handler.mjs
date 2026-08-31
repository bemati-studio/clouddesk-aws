import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import {
  ValidationError,
  summarizeTickets,
  validateCreateTicket,
  validateTicketUpdate
} from "./domain.mjs";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true }
});
const sns = new SNSClient({});
const tableName = process.env.TABLE_NAME;
const topicArn = process.env.TOPIC_ARN;

const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*"
};

export async function handler(event) {
  try {
    const user = getUser(event);
    const routeKey = event.routeKey;

    if (routeKey === "GET /tickets") return ok(await listTickets());
    if (routeKey === "POST /tickets") return created(await createTicket(event, user));
    if (routeKey === "GET /tickets/{id}") return ok(await getTicket(event.pathParameters?.id));
    if (routeKey === "PATCH /tickets/{id}") return ok(await updateTicket(event, user));
    if (routeKey === "GET /metrics") return ok(await getMetrics());

    return response(404, { message: "Ruta no encontrada." });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      requestId: event.requestContext?.requestId,
      name: error.name,
      message: error.message
    }));

    if (error instanceof ValidationError || error instanceof SyntaxError) {
      return response(400, { message: error.message });
    }
    if (error.name === "ConditionalCheckFailedException") {
      return response(404, { message: "El ticket no existe." });
    }

    return response(500, { message: "Ocurrió un error interno." });
  }
}

function getUser(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims ?? {};
  return {
    id: claims.sub ?? "unknown",
    email: claims.email ?? claims.username ?? "usuario"
  };
}

async function listTickets() {
  const items = [];
  let ExclusiveStartKey;

  do {
    const result = await db.send(new ScanCommand({ TableName: tableName, ExclusiveStartKey }));
    items.push(...(result.Items ?? []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function getTicket(id) {
  if (!id) throw new ValidationError("Falta el identificador del ticket.");
  const result = await db.send(new GetCommand({ TableName: tableName, Key: { ticketId: id } }));
  if (!result.Item) {
    const error = new Error("El ticket no existe.");
    error.name = "ConditionalCheckFailedException";
    throw error;
  }
  return result.Item;
}

async function createTicket(event, user) {
  const input = validateCreateTicket(parseBody(event));
  const now = new Date().toISOString();
  const ticket = {
    ticketId: randomUUID(),
    ...input,
    status: "OPEN",
    assignedTo: "",
    createdAt: now,
    updatedAt: now,
    createdBy: user.email,
    createdById: user.id,
    history: [{ action: "CREATED", at: now, by: user.email }]
  };

  await db.send(new PutCommand({
    TableName: tableName,
    Item: ticket,
    ConditionExpression: "attribute_not_exists(ticketId)"
  }));

  await notify(`Nuevo ticket ${ticket.priority}: ${ticket.title}`, ticket);
  return ticket;
}

async function updateTicket(event, user) {
  const id = event.pathParameters?.id;
  if (!id) throw new ValidationError("Falta el identificador del ticket.");

  const changes = validateTicketUpdate(parseBody(event));
  const updatedAt = new Date().toISOString();
  const names = { "#updatedAt": "updatedAt", "#history": "history" };
  const values = {
    ":updatedAt": updatedAt,
    ":empty": [],
    ":historyEntry": [{ action: "UPDATED", at: updatedAt, by: user.email, changes }]
  };
  const setters = [
    "#updatedAt = :updatedAt",
    "#history = list_append(if_not_exists(#history, :empty), :historyEntry)"
  ];

  Object.entries(changes).forEach(([key, value], index) => {
    names[`#field${index}`] = key;
    values[`:value${index}`] = value;
    setters.push(`#field${index} = :value${index}`);
  });

  const result = await db.send(new UpdateCommand({
    TableName: tableName,
    Key: { ticketId: id },
    UpdateExpression: `SET ${setters.join(", ")}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ConditionExpression: "attribute_exists(ticketId)",
    ReturnValues: "ALL_NEW"
  }));

  if (changes.priority === "CRITICAL" || changes.status === "RESOLVED") {
    await notify(`Ticket actualizado: ${result.Attributes.title}`, result.Attributes);
  }
  return result.Attributes;
}

async function getMetrics() {
  return summarizeTickets(await listTickets());
}

async function notify(subject, ticket) {
  if (!topicArn) return;
  try {
    await sns.send(new PublishCommand({
      TopicArn: topicArn,
      Subject: subject.slice(0, 100),
      Message: JSON.stringify({
        ticketId: ticket.ticketId,
        title: ticket.title,
        priority: ticket.priority,
        status: ticket.status,
        updatedAt: ticket.updatedAt
      }, null, 2)
    }));
  } catch (error) {
    console.warn(JSON.stringify({ level: "warn", message: "No se pudo enviar la notificación SNS", detail: error.message }));
  }
}

function parseBody(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64").toString("utf8")
    : event.body;
  return JSON.parse(raw || "{}");
}

function response(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

const ok = (body) => response(200, body);
const created = (body) => response(201, body);

