import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const lambdaClient = new LambdaClient({});
const MATRICULAS_TABLE = "t_matriculas";

// Helper para validar el token
async function validateToken(token) {
  const params = {
    FunctionName: "ValidarTokenAcceso",
    Payload: JSON.stringify({ token }),
  };

  try {
    const result = await lambdaClient.send(new InvokeCommand(params));
    const response = JSON.parse(new TextDecoder("utf-8").decode(result.Payload));

    if (response.statusCode !== 200) {
      throw new Error(response.body || "Token inválido o expirado.");
    }

    return typeof response.body === "string" ? JSON.parse(response.body) : response.body;
  } catch (err) {
    console.error("Error en validateToken:", err);
    throw new Error(`Error validando el token: ${err.message}`);
  }
}

export const handler = async (event) => {
  try {
    const token = event.headers.Authorization.replace("Bearer ", "");
    const tokenData = await validateToken(token);
    const { role } = tokenData;

    if (role !== "admin") {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Solo los administradores pueden eliminar matrículas." }),
      };
    }

    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    const { tenant_id, user_id, period } = body;

    if (!tenant_id || !user_id || !period) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Faltan datos requeridos: tenant_id, user_id o period." }),
      };
    }

    const key = {
      "tenant_id#user_id": `${tenant_id}#${user_id}`,
      periodo: period,
    };

    const deleteParams = {
      TableName: MATRICULAS_TABLE,
      Key: key,
    };

    await docClient.send(new DeleteCommand(deleteParams));

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Matrícula eliminada exitosamente." }),
    };
  } catch (err) {
    console.error("Error detectado:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Error interno." }),
    };
  }
};
