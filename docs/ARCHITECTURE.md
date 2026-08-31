# Arquitectura de CloudDesk AWS

## Flujo de una solicitud

1. El usuario abre la interfaz distribuida por CloudFront desde un bucket S3 privado.
2. Amazon Cognito autentica al usuario mediante OAuth 2.0 Authorization Code con PKCE.
3. El navegador envía el ID token en el encabezado `Authorization`.
4. API Gateway valida la firma, el emisor y la audiencia del JWT.
5. Lambda valida el contenido y ejecuta la operación solicitada.
6. DynamoDB conserva el ticket y su historial.
7. SNS envía una notificación cuando corresponde.
8. CloudWatch y X-Ray registran la ejecución y sus errores.

## Servicios y responsabilidades

| Servicio | Responsabilidad |
|---|---|
| Amazon Cognito | Registro, verificación e inicio de sesión |
| Amazon API Gateway HTTP API | Rutas HTTPS, CORS y validación JWT |
| AWS Lambda | Reglas comerciales y acceso a datos |
| Amazon DynamoDB | Tickets e historial de cambios |
| Amazon SNS | Alertas por correo |
| Amazon S3 | Archivos estáticos privados |
| Amazon CloudFront | HTTPS, caché y entrega pública |
| Amazon CloudWatch | Logs y métricas operativas |
| AWS X-Ray | Trazabilidad de solicitudes |
| AWS Budgets | Alerta opcional de gasto mensual |

## Modelo de ticket

| Campo | Tipo | Descripción |
|---|---|---|
| `ticketId` | UUID | Clave primaria |
| `title` | string | Resumen del incidente |
| `description` | string | Contexto e impacto |
| `priority` | enum | LOW, MEDIUM, HIGH o CRITICAL |
| `status` | enum | OPEN, IN_PROGRESS, RESOLVED o CLOSED |
| `assignedTo` | string | Responsable opcional |
| `createdBy` | string | Correo entregado por Cognito |
| `createdAt` | ISO-8601 | Fecha de creación |
| `updatedAt` | ISO-8601 | Última modificación |
| `history` | array | Auditoría de cambios |

## Decisiones de seguridad

- No existen claves estáticas en el frontend o repositorio.
- Cognito utiliza PKCE y el cliente no tiene secreto.
- Lambda aplica validación de longitud y listas permitidas.
- El rol de Lambda solo puede leer y modificar la tabla del proyecto y publicar en su tema SNS.
- DynamoDB y S3 tienen cifrado habilitado.
- S3 bloquea completamente el acceso público.
- DynamoDB mantiene recuperación a un punto en el tiempo.
- Los mensajes enviados al navegador no incluyen detalles internos de los errores.

## Límites actuales

- La lista usa `Scan`, apropiado para una primera versión con pocos tickets. En una fase de crecimiento debe reemplazarse por consultas con índices.
- Todos los usuarios autenticados pueden consultar los tickets. La siguiente fase puede incorporar grupos de Cognito y autorización por rol.
- La asignación de responsables existe en la API, pero todavía no tiene un control específico en la interfaz.

