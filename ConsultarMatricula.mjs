import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
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
    const rawPayload = new TextDecoder("utf-8").decode(result.Payload);
    const response = JSON.parse(rawPayload);

    if (response.statusCode !== 200) {
      const errorBody =
        typeof response.body === "string"
          ? JSON.parse(response.body)
          : response.body;
      throw new Error(errorBody.error || "Token inválido o expirado.");
    }

    return typeof response.body === "string"
      ? JSON.parse(response.body)
      : response.body;
  } catch (err) {
    console.error("Error en validateToken:", err);
    throw new Error(
      `Error validando el token: ${err.message || "Token inválido."}`
    );
  }
}

export const handler = async (event) => {
  try {
    // Validar el token
    const token = event.headers.Authorization.replace("Bearer ", "");
    const tokenData = await validateToken(token);
    const { role } = tokenData;

    // Validar permisos por rol
    if (role !== "student" && role !== "admin") {
      return {
        statusCode: 403,
        body: { error: "No tiene permisos para consultar matrículas." },
      };
    }

    // Parsear el cuerpo de la solicitud
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    const { tenant_id, user_id, period } = body;

    // Validar datos requeridos
    if (!tenant_id || !user_id || !period) {
      return {
        statusCode: 400,
        body: { error: "Faltan datos requeridos: tenant_id, user_id o period." },
      };
    }

    // Preparar la clave para la consulta
    const key = {
      "tenant_id#user_id": `${tenant_id}#${user_id}`,
      periodo: period,
    };

    // Consultar DynamoDB
    const getParams = {
      TableName: MATRICULAS_TABLE,
      Key: key,
    };

    const result = await docClient.send(new GetCommand(getParams));

    // Validar si la matrícula existe
    if (!result.Item) {
      return {
        statusCode: 404,
        body: { error: "Matrícula no encontrada." },
      };
    }

    // Mapear los datos al formato solicitado
    const mappedResponse = {
      tenant_id: tenant_id,
      user_id: user_id,
      period: result.Item.periodo,
      courses: result.Item.Courses,
      total_credits: result.Item.TotalCredits,
    };

    // Devolver los datos encontrados en el nuevo formato
    return {
      statusCode: 200,
      body: mappedResponse, // Devuelve el objeto directamente
    };
  } catch (err) {
    console.error("Error detectado en handler:", err);
    return {
      statusCode: 500,
      body: { error: err.message || "Error interno." },
    };
  }
};
