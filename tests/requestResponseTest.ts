import { AWSMessagingServer, JmsMessage, SQSClient } from "../index";

export class RequestResponseTest
{
  public testRequestResponse(servers: AWSMessagingServer[]): Promise<string>
  {
      return new Promise((resolve, reject) =>
      {
          // We need two different environments, each with a different port
          if (servers.length < 2)
          {
              reject('To test request/response, you need two servers with two different config files and ports');
          }

          // Create the two clients for the request/response
          const client1 = new SQSClient({ Settings: servers[0].Settings });
          const client2 = new SQSClient({ Settings: servers[1].Settings });

          // The queue names and the message to pass
          const requestQueueName  = 'My-Test-Request-Queue';
          const responseQueueName = 'My-Test-Response-Queue';
          const message = new JmsMessage('This is a message that tests request/response', requestQueueName, responseQueueName);

          // Create the two queues.
          // Client 1 publishes a message and Client 2 receives it.
          Promise.all(client1.createQueues([requestQueueName, responseQueueName]))
              .then((queueInfos) => { client1.publish(queueInfos[0], message.toJson()); return queueInfos; })
              .then((queueInfos) => client2.receiveMessage(queueInfos[0], null, (msg) =>
              {
                  // Client 2 takes the request, prepares a response, and replies to Client 1
                  const objMessage = JmsMessage.fromAWS(msg);
                  const responseMessage = new JmsMessage(`This is the response to message [${objMessage.Message}]`, objMessage.ReplyTo, null, objMessage.CorrelationID);
                  client2.publish(queueInfos[1], responseMessage.toJson())
                      // Client 1 receives the response.
                      // But we want to make sure that client1 receives a response that has the same CorrID as the original request
                      // and within the specified timeout period. We don't want Client1 destroying other messages that are
                      // in the queue but with different Correlation IDS.
                      .then(() => client1.receiveMessage(queueInfos[1], null, (msg2) =>
                      {
                          const objMessage2 = JmsMessage.fromAWS(msg2);
                          resolve(`The original sender got the response [${objMessage2.Message}]`);
                      }))
                      .catch((err) => reject(err));
              }))
              .catch((err) => reject(err));
      });
  }
}
