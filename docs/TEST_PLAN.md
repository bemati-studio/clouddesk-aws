# Plan de pruebas de CloudDesk AWS

## Objetivo

Comprobar que los usuarios autenticados pueden administrar tickets y que los servicios de AWS mantienen seguridad, trazabilidad y consistencia de datos.

## Pruebas automatizadas incluidas

| ID | Componente | Escenario | Resultado esperado |
|---|---|---|---|
| AUT-001 | Validación | Ticket con datos correctos | Datos normalizados |
| AUT-002 | Validación | Título demasiado corto | Error de validación |
| AUT-003 | Actualización | Estado permitido | Se acepta únicamente el campo autorizado |
| AUT-004 | Validación | Prioridad desconocida | Error de validación |
| AUT-005 | Actualización | Sin campos permitidos | Error de validación |
| AUT-006 | Métricas | Conjunto de tickets | Totales correctos por estado y prioridad |

Se ejecutan con `npm test` y en cada push o pull request mediante GitHub Actions.

## Pruebas de integración después del despliegue

| ID | Servicio | Procedimiento | Resultado esperado |
|---|---|---|---|
| INT-001 | Cognito | Registrar y verificar un correo | Inicio de sesión exitoso |
| INT-002 | API Gateway | Solicitar `/tickets` sin token | HTTP 401 |
| INT-003 | API + DynamoDB | Crear un ticket válido | HTTP 201 y registro persistido |
| INT-004 | API | Crear un ticket con título corto | HTTP 400 |
| INT-005 | DynamoDB | Recargar la aplicación | El ticket continúa visible |
| INT-006 | SNS | Crear ticket y confirmar suscripción | Correo recibido |
| INT-007 | CloudWatch | Ejecutar una operación | Log con requestId y estado |
| INT-008 | CloudFront | Abrir URL mediante HTTP | Redirección a HTTPS |
| INT-009 | S3 | Intentar abrir el objeto directamente | Acceso público denegado |
| INT-010 | Interfaz | Usar pantalla de 375 px | Navegación y formulario utilizables |

## Pruebas de regresión

Repetir AUT-001 a AUT-006 e INT-002 a INT-005 después de cada cambio en reglas comerciales, infraestructura o autenticación.

## Evidencia recomendada

- Captura del workflow de GitHub Actions aprobado.
- Captura de un ticket persistido en DynamoDB ocultando datos personales.
- Respuesta HTTP 401 sin token y HTTP 200 con token.
- Evento de CloudWatch con identificadores sensibles ocultos.
- Pull request con revisión del segundo integrante.
