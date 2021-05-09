
import path from 'path';
import fs from 'fs';
import handlebars from 'handlebars';
import dayjs from 'dayjs';
import { document } from "src/utils/dynamoDbConnection"
import chromium from 'chrome-aws-lambda';
import { S3 } from 'aws-sdk';
import { APIGatewayProxyHandler } from 'aws-lambda';

type CreateCertificate = {
  id: string;
  name: string;
  grade: number;
}

type Template = {
  id: string;
  name: string;
  grade: number;
  date: string;
  medal: string;
}

const compile = async (data: Template) => {
  const filePath = path.join(process.cwd(), 'src', 'templates', 'certificate.hbs');
  const html = fs.readFileSync(filePath, 'utf-8');

  return handlebars.compile(html)(data);
}

const generateCertificateContent = async (data: CreateCertificate): Promise<string> => {
  const medalPath = path.join(process.cwd(), 'src', 'templates', 'selo.png');
  const medal = fs.readFileSync(medalPath, 'base64');

  const content = await compile({
    ...data,
    medal,
    date: dayjs().format('DD/MM/YYYY'),
  })

  return content;
}

const generateCertificatePdf = async (content: string): Promise<Buffer> => {
  const browser = await chromium.puppeteer.launch({
    headless: true,
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath,
  })

  const page = await browser.newPage();

  await page.setContent(content);

  const pdf = await page.pdf({
    format: 'a4',
    landscape: true,
    path: process.env.IS_OFFLINE ? 'certificate.pdf' : null,
    printBackground: true,
    preferCSSPageSize: true
  })

  await browser.close();

  return pdf;
}

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

const saveCertificate = async (item: CreateCertificate) => document.put({
  TableName: 'certificates',
  Item: item,
}).promise();

const uploadCertificateToS3 = async (key: string, pdf: Buffer): Promise<string> => {
  const s3 = new S3();

  await s3.putObject({
    Bucket: 'mvc-ignite-certificates',
    Key: `${key}.pdf`,
    ACL: 'public-read',
    Body: pdf,
    ContentType: 'application/pdf'
  }).promise();
  
  return `https://mvc-ignite-certificates.s3.amazonaws.com/${key}.pdf`
}


export const handle: APIGatewayProxyHandler = async (event) => {
  try {
    const { id, name, grade } = JSON.parse(event.body) as CreateCertificate;

    const certificateAlreadyExists = await checkCertificate(id);

    if(certificateAlreadyExists) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: 'Certificate already exists',
        }) 
      }
    }
    
    const certificateData = {
      id,
      name,
      grade
    }



    await saveCertificate(certificateData);

    const certificateContent = await generateCertificateContent(certificateData)

    const certificatePdf = await generateCertificatePdf(certificateContent);

    const certificateUrl = await uploadCertificateToS3(id, certificatePdf);

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: 'Certificate was created',
        url: certificateUrl,
      })
    }
 } catch(error) {
    console.error('Error', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Internal Server Error'
      })
    }
 }
}