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
    const { tenantId, userId, role } = tokenData;

    if (role !== "student") {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Solo los estudiantes pueden registrar matrículas." }),
      };
    }

    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    const { tenant_id, user_id, period, courses, total_credits } = body;

    if (!tenant_id || !user_id || !period || !courses || courses.length === 0 || !total_credits) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Faltan datos requeridos: tenant_id, user_id, period, courses o total_credits.",
        }),
      };
    }

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

    const updatedData = {
      "tenant_id#user_id": `${tenant_id}#${user_id}`,
      periodo: period,
      Courses: courses,
      TotalCredits: total_credits,
    };

    const putParams = {
      TableName: MATRICULAS_TABLE,
      Item: updatedData,
    };

    await docClient.send(new PutCommand(putParams));

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Matrícula actualizada exitosamente." }),
    };
  } catch (err) {
    console.error("Error detectado:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Error interno." }),
    };
  }
};
