import * as assert from 'assert';
import * as chai from 'chai';
const expect = chai.expect;

import { AppContext } from '../src/appContext';
import { SNSClient, SNSTopicInfo } from '../src/aws/snsClient';
import { SQSClient, SQSQueueInfo } from '../src/aws/sqsClient';
import { SNSMocks } from './snsMocks';
import { SQSMocks } from './sqsMocks';
import { ServiceCreationArgs } from '../src/services/serviceCreationArgs';

describe('SNS getTopicInfos', () =>
{
  it ('should return some info about topics', () =>
  {
    AppContext.IsMocking = true;
    const snsMock = SNSMocks.Instance();

    const serviceCreationArgs: ServiceCreationArgs = { Settings: undefined, ServiceType: 'AWS', Name: 'Test SNS Client', Attrs: { noPreloadInfo: true } };
    const snsClient: SNSClient = new SNSClient(serviceCreationArgs);

    return snsClient.getAllInfo().then((info) =>
    {
      expect(info).to.not.be.null;
      snsMock.dispose();
    });
  }).timeout(5 * 1000);
});

describe('SNS createTopic', () =>
{
  it ('should return the subscription ARN', () =>
  {
    AppContext.IsMocking = true;
    const snsMock = SNSMocks.Instance();

    const serviceCreationArgs: ServiceCreationArgs = { Settings: undefined, ServiceType: 'AWS', Name: 'Test SNS Client', Attrs: { noPreloadInfo: true } };
    const snsClient: SNSClient = new SNSClient(serviceCreationArgs);

    const topicName: string = "foo-baz-topic";
    snsClient.createTopic(topicName)
      .then((topicInfo) =>
      {
        // The result should be a SNSTopicInfo object
        expect(topicInfo).to.not.be.null;
        expect(topicInfo.Arn).to.not.be.null;
        expect(topicInfo.Name).equal(topicName);

        // Fetch the TopicInfo for this topic, just to make sure that it's in there.
        snsClient.getTopicInfo(topicInfo.Name, false)
          .then((topicInfo2) =>
            {
              expect(topicInfo2).to.not.be.null;
              expect(topicInfo2.Arn).to.not.be.null;
              expect(topicInfo2.Name).equal(topicInfo.Name);

              snsMock.dispose();
            });
      });

  }).timeout(10 * 1000);
});

describe('SNS createTopic and subscribe', () =>
{
  it ('should return the subscription ARN', () =>
  {
    AppContext.IsMocking = true;
    const snsMock = SNSMocks.Instance();
    const sqsMock = SQSMocks.Instance();

    const serviceCreationArgs: ServiceCreationArgs = { Settings: undefined, ServiceType: 'AWS', Name: 'Test SNS Client', Attrs: { noPreloadInfo: true } };
    const snsClient: SNSClient = new SNSClient(serviceCreationArgs);
    serviceCreationArgs.Name = 'Test SQS Client';
    const sqsClient: SQSClient = new SQSClient(serviceCreationArgs);

    const topicName: string = "foo-baz-topic";
    const queueName: string = "foo-baz-queue";

    let topicInfo2: SNSTopicInfo = null;

    Promise.all([
      snsClient.createTopic(topicName).then((topicInfo) => { topicInfo2 = topicInfo; return topicInfo; }),
      sqsClient.createQueue(queueName).then((queueInfo) => queueInfo),
    ]).then((result) =>
    {
      snsClient.subscribeToSQS(result[0], result[1])
        .then((subscriptionArn) =>
        {
            expect(subscriptionArn).to.not.be.null;
            return subscriptionArn;
         })
        .then((subscriptionArn) =>
        {
          snsClient.publish(topicInfo2, "User.Logged.In", "Marc Adler");
          return subscriptionArn;
        })
        .then((subscriptionArn) => snsClient.unsubscribe(subscriptionArn))
        .then((rc) => expect(rc).to.be.true)
        .then(() =>
        {
            snsMock.dispose();
            sqsMock.dispose();
        })
        .catch((err) => console.log(err));
    });

  }).timeout(10 * 1000);
});
