import * as assert from 'assert';
import * as chai from 'chai';
const expect = chai.expect;

import { AppContext } from '../src/appContext';
import { SQSClient, SQSQueueInfo } from '../src/aws/sqsClient';
import { ServiceCreationArgs } from '../src/services/serviceCreationArgs';
import { SQSMocks } from './sqsMocks';

describe('SQS getQueueInfos', () =>
{
  it ('should return some info about queues', () =>
  {
    AppContext.IsMocking = true;
    const mock = SQSMocks.Instance();

    const serviceCreationArgs: ServiceCreationArgs = { Settings: undefined, ServiceType: 'AWS', Name: 'Test SQS Client', Attrs: { noPreloadInfo: true } };
    const sqsClient: SQSClient = new SQSClient(serviceCreationArgs);

    return sqsClient.getAllInfo().then((info) =>
    {
      // tslint:disable-next-line:no-unused-expression
      expect(info).to.not.be.null;
      mock.dispose();
    });
  }).timeout(5 * 1000);
});

describe('SQS publish', () =>
{
  it ('should return the message id of the message that was just queued', () =>
  {
    AppContext.IsMocking = true;
    const mock = SQSMocks.Instance();

    const serviceCreationArgs: ServiceCreationArgs = { Settings: undefined, ServiceType: 'AWS', Name: 'Test SQS Client', Attrs: { noPreloadInfo: true } };
    const sqsClient: SQSClient = new SQSClient(serviceCreationArgs);
    const queueInfo: SQSQueueInfo = new SQSQueueInfo('foo-baz', 'https://foo-baz', null);

    const createQueueResult = sqsClient.createQueue(queueInfo.Name);

    return sqsClient.publish(queueInfo, 'Hello Marc').then((sendMessageResult) =>
    {
      // tslint:disable-next-line:no-unused-expression
      expect(sendMessageResult).to.not.be.null;
      // tslint:disable-next-line:no-unused-expression
      expect(sendMessageResult.MessageId).to.not.be.null;
      mock.dispose();
    });
  }).timeout(5 * 1000);
});

describe('SQS publish and receive', () =>
{
  it ('should return the message that was published', () =>
  {
    AppContext.IsMocking = true;
    const mock = SQSMocks.Instance();

    const serviceCreationArgs: ServiceCreationArgs = { Settings: undefined, ServiceType: 'AWS', Name: 'Test SQS Client', Attrs: { noPreloadInfo: true } };
    const sqsClient: SQSClient = new SQSClient(serviceCreationArgs);
    const queueInfo: SQSQueueInfo = new SQSQueueInfo('foo-baz', 'https://foo-baz', null);

    const createQueueResult = sqsClient.createQueue(queueInfo.Name);

    return sqsClient.publish(queueInfo, 'Hello Marc').then((sendMessageResult) =>
    {
      // tslint:disable-next-line:no-unused-expression
      expect(sendMessageResult).to.not.be.null;
      // tslint:disable-next-line:no-unused-expression
      expect(sendMessageResult.MessageId).to.not.be.null;

      sqsClient.receiveMessage(queueInfo, {}, (msg) =>
      {
        expect(msg.Body).equal('Hello Marc');
        mock.dispose();
      });

    });
  }).timeout(10 * 1000);
});
