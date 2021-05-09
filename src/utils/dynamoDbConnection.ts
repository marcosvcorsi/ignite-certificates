import { DynamoDB } from 'aws-sdk';

const options = process.env.IS_OFFLINE ? {
  region: 'localhost',
  endpoint: 'http://localhost:8000'
} : null;

export const document = new DynamoDB.DocumentClient(options);