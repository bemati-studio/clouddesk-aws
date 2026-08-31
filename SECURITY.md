# Política de seguridad

No publiques vulnerabilidades como issues. Comunícalas de manera privada a los responsables de Bemati Studio.

Nunca incluyas en commits:

- Access keys o secret keys de AWS.
- Tokens de sesión.
- Correos o datos reales de usuarios de prueba.
- Archivos `.env` o `frontend/config.js` generados.

Si una credencial se publica accidentalmente, revócala inmediatamente en AWS IAM y revisa CloudTrail.

