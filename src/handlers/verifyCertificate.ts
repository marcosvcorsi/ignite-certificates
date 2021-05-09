import { APIGatewayProxyHandler } from "aws-lambda";
import { document } from "src/utils/dynamoDbConnection";

const checkCertificate = async (id: string): Promise<boolean> => {
  const result = await document.query({
    TableName: 'certificates',
    KeyConditionExpression: "id = :id",
    ExpressionAttributeValues: {
      ":id": id
    }
  }).promise();

  return result.Items.length > 0;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { id } = event.pathParameters;
    
    const foundCertificate = await checkCertificate(id);

    if(!foundCertificate) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          message: 'Certificate not found',
        })
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Certificate is valid',
        url: `https://mvc-ignite-certificates.s3.amazonaws.com/${id}.pdf`
      })
    }

  } catch(error) {
    console.error('Error', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Internal Server Error',
      })
    }
  }
} 