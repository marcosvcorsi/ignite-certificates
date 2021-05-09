
import path from 'path';
import fs from 'fs';
import handlebars from 'handlebars';
import dayjs from 'dayjs';
import { document } from "src/utils/dynamoDbConnection"
import chromium from 'chrome-aws-lambda';

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

const generateCertificateContent = async (data: CreateCertificate) => {
  const medalPath = path.join(process.cwd(), 'src', 'templates', 'selo.png');
  const medal = fs.readFileSync(medalPath, 'base64');

  const content = await compile({
    ...data,
    medal,
    date: dayjs().format('DD/MM/YYYY'),
  })

  return content;
}

const generateCertificatePdf = async (content: string) => {
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

const saveCertificate = async (item: CreateCertificate) => document.put({
  TableName: 'certificates',
  Item: item,
}).promise();


export const handler = async (event) => {
  try {
    const { id, name, grade } = JSON.parse(event.body) as CreateCertificate;

    const certificateData = {
      id,
      name,
      grade
    }

    await saveCertificate(certificateData);

    const certificateContent = await generateCertificateContent(certificateData)

    await generateCertificatePdf(certificateContent);

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: 'Certificate was created'
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