import * as AWS from 'aws-sdk';
import * as AWSMock from 'aws-sdk-mock';
import * as uuid from 'uuid';
import { IDisposable } from '../src/framework/using';
import { TSLogger } from '../src/logging/tslogger';
import { Queue } from './queue';
import { SNSMocks } from './snsMocks';

interface IQMessage
{
  MessageId: string;
  MessageBody: string;
}

export class SQSMocks implements IDisposable
{
  private Logger: any;
  private static Queues: Map<string, Queue<IQMessage>>;
  private static instance: SQSMocks;

  private constructor()
  {
    SQSMocks.Queues = new Map<string, Queue<IQMessage>>();
  }

  public static Instance(): SQSMocks
  {
    if (SQSMocks.instance)
    {
      return SQSMocks.instance;
    }

    SQSMocks.instance = new SQSMocks();
    SQSMocks.instance.Create();

    return SQSMocks.instance;
  }

  private Create()
  {
    this.Logger = new TSLogger().createLogger(`SQSMock`);

    AWSMock.setSDKInstance(AWS);

    SNSMocks.TopicEventEmitter.on('TopicSubscribed', (params) =>
    {
      const queueArn = params.Endpoint;
      this.Logger.info(`SQSMock Event Received: - The queue ${queueArn} has been subscribed to topic ${params.TopicArn}`);
    });

    AWSMock.mock('SQS', 'createQueue', (params, callback) =>
    {
      const queueName: string = params.QueueName;
      const url: string = `https://${queueName}`;
      SQSMocks.Queues[url] = new Queue<IQMessage>(url);
      callback(null, { QueueUrl: url });
    });

    AWSMock.mock('SQS', 'deleteMessage', (params, callback) =>
    {
      const url = params.QueueUrl;

      const queue: Queue<IQMessage> = SQSMocks.Queues[url];
      if (queue)
      {
        queue.dequeue();
        callback(null, {});
      }
      else
      {
        callback(`The queue ${url} does not exist`, null);
      }
    });

    AWSMock.mock('SQS', 'deleteQueue', (params, callback) =>
    {
      const url = params.QueueUrl;

      const queue: Queue<IQMessage> = SQSMocks.Queues[url];
      if (queue)
      {
        SQSMocks.Queues.delete(url);
        callback(null, {});
      }
      else
      {
        callback(`The queue ${url} does not exist`, null);
      }
    });

    AWSMock.mock('SQS', 'getQueueAttributes', (params, callback) =>
    {
      const sArn = params.QueueUrl.replace("https://", "arn:aws:").replace(/\//g, ":");
      callback(null, { Attributes: { QueueArn: sArn } });
    });

    AWSMock.mock('SQS', 'listQueues', (params, callback) =>
    {
      callback(null,
        {
          QueueUrls:
            [
              `https://sqs.us-west-2.amazonaws.com/901643335044/foo-baz-queue`,
              `https://sqs.us-west-2.amazonaws.com/901643335044/nut-case-queue`,
            ],
        });
    });

    AWSMock.mock('SQS', 'purgeQueue', (params, callback) =>
    {
      const url: string = params.QueueUrl;

      const queue: Queue<IQMessage> = SQSMocks.Queues[url];
      if (queue)
      {
        queue.clear();
        callback(null, {});
      }
      else
      {
        callback(`The queue ${url} does not exist`, null);
      }
    });

    AWSMock.mock('SQS', 'receiveMessage', (params, callback) =>
    {
      const url = params.QueueUrl;

      const queue: Queue<IQMessage> = SQSMocks.Queues[url];
      if (queue)
      {
        const msg: IQMessage = queue.peek();
        if (msg)
        {
          callback(null, { Messages:
            [
              { Body: msg.MessageBody, MessageId: msg.MessageId, ReceiptHandle: uuid.v1() },
            ]});
        }
        else
        {
          callback(null, {});
        }
      }
      else
      {
        callback(`The queue ${url} does not exist`, null);
      }
    });

    AWSMock.mock('SQS', 'sendMessage', (params, callback) =>
    {
      const url: string = params.QueueUrl;
      const body: string = params.MessageBody;

      const queue: Queue<IQMessage> = SQSMocks.Queues[url];
      if (queue)
      {
        const messageId: string = uuid.v1();
        queue.enqueue({ MessageId: messageId, MessageBody: body });
        callback(null, { MessageId: messageId });
      }
      else
      {
        callback(`The queue ${url} does not exist`, null);
      }
    });

    AWSMock.mock('SQS', 'setQueueAttributes', (params, callback) =>
    {
      callback(null, {});
    });
  }

  public dispose(): void
  {
    SNSMocks.TopicEventEmitter.removeListener('TopicSubscribed', () => {});
  }
}
