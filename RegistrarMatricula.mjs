import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
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
      const errorBody =
        typeof response.body === "string"
          ? JSON.parse(response.body)
          : response.body;

      console.error("ValidarTokenAcceso Response:", errorBody);

      throw new Error(errorBody.error || "Token inválido o expirado.");
    }

    return typeof response.body === "string"
      ? JSON.parse(response.body)
      : response.body;
  } catch (err) {
    console.error("Error en validateToken:", err.message || err);
    throw new Error(`Error validando el token: ${err.message}`);
  }
}

export const handler = async (event) => {
  try {
    // Validar el token
    const token = event.headers.Authorization.replace("Bearer ", "");
    let tokenData;
    try {
      tokenData = await validateToken(token);
    } catch (err) {
      return {
        statusCode: 401, // Código 401 para token inválido o expirado
        body: JSON.stringify({ error: err.message }),
      };
    }

    const { tenantId, userId, role } = tokenData;

    // Verificar el rol del usuario
    if (role !== "student") {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Solo los estudiantes pueden matricularse." }),
      };
    }

    // Manejar el cuerpo de la solicitud
    const body =
      typeof event.body === "string" ? JSON.parse(event.body) : event.body;

    const { tenant_id, user_id, period, courses, total_credits } = body;

    // Validar datos requeridos
    if (!tenant_id || !user_id || !period || !courses || courses.length === 0 || !total_credits) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Faltan datos requeridos: tenant_id, user_id, period, courses o total_credits.",
        }),
      };
    }

    // Validar estructura de cada curso
    for (const course of courses) {
      if (!course.CourseID || !course.ProfessorID) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: "Cada curso debe incluir CourseID y ProfessorID.",
          }),
        };
      }
    }

    // Crear la entrada para DynamoDB con las claves correctas
    const matriculaData = {
      "tenant_id#user_id": `${tenant_id}#${user_id}`, // Clave primaria compuesta
      periodo: period, // Sort Key
      Courses: courses,
      TotalCredits: total_credits,
    };

    // Guardar la matrícula en DynamoDB
    try {
      const putParams = {
        TableName: MATRICULAS_TABLE,
        Item: matriculaData,
      };

      await docClient.send(new PutCommand(putParams));
    } catch (err) {
      console.error("Error al guardar en DynamoDB:", err.message || err);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Error guardando la matrícula en la base de datos.",
        }),
      };
    }

    // Respuesta exitosa
    return {
      statusCode: 201,
      body: JSON.stringify({ message: "Matrícula registrada exitosamente." }),
    };
  } catch (err) {
    console.error("Error detectado en handler:", err.message || err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message || "Error interno.",
      }),
    };
  }
};
