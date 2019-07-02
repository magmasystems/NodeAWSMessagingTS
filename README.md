<!-- markdownlint-disable MD022 MD033 -->
# Messaging Interface for Node

This package provides a simple interface into the AWS-based messaging services, such as [*Simple Queue Service (SQS)*](https://aws.amazon.com/sqs/) and [*Simple Notification Service (SNS)*](https://aws.amazon.com/sns/).

Let's say that you have two applications that were hosted on AWS and they wanted to communicate with each other through messaging. There are different ways to accomplish this. One is to use a Kafka running on an EC2 instance. Another way is to use a hosted version of Kafka (ie: Confluent). Yet another way is to use a combination of SQS, SNS and Kinesis.


## Setting up the Environment
----

In the root of your project, you need to have a file called **app.config.json**, which contains all of the configuration information.

The `credentials` section has the access and secrets keys that your application uses to access the AWS services.

There are service-specific sections, such as `sqs` and `sns` that contain information about which region to use, plus other service-specific information.

The `appSettings` section contains information that your application will use. Anything can be in there, but especially important are the settings to deal with the proxy server. If you are behind a proxy server, then you need to set the `proxy` address. If you are developing at home, then you can ignore the proxy by setting the `proxyIgnore` variable to *true*.

Here is an example of an app.config.json file:

```json
{
  "sqs" :
  {
    // The region and the url for SQS 
    "region": "us-west-2",
    "serviceUrl": "http://sqs.us-west-2.amazonaws.com",
    // How long (in seconds) should a message be retained for (default = 120) 
    "messageRetentionPeriod": 90,
    // Number of seconds to wait for a message to appear. (default = 10) 
    // This is the concept of short-polling vs long-polling 
    "receiveWaitSeconds":  10,
    // Should the message be deleted form the queue after receiving it 
    "deleteMessageAfterConsuming":  false,
    // Additional attributes that will be passed to SQS's receiveMessage() function 
    // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html#receiveMessage-property 
    "receiveAttributes":
    {
      "MaxNumberOfMessages": 30
    },
    // The interval (in seconds) at which we poll for changes in the topics. A value of -1 will turn off the watcher. 
    "infoWatcherInterval": 60
  },

  "sns" :
  {
    // The region and the url for SNS 
    "region": "us-west-2",
    "serviceUrl": "http://sns.us-west-2.amazonaws.com",
    // The interval (in seconds) at which we poll for changes in the topics. A value of -1 will turn off the watcher. 
    "infoWatcherInterval": -1
  },

  "kinesis" :
  {
    "serviceUrl": "http://kinesis.us-west-2.amazonaws.com"
  },

  // application-specific settings (including the proxy settings for AWS) 
  "appSettings":
  {
    // The MessagingService app needs to listen to a port. The default is 3000. 
    "serverPort":    3000,
    // This specifies the address of the proxy. You need this to get your app to connect to AWS. 
    "proxy":         "[The address of the proxy server]",
    // You can turn the proxy off if you are developing outside of the corporate network. Set proxyIgnore to true to ignore the proxy 
    "proxyIgnore":   false,
    // Authentication information 
    "authentication":
    {
      "method": "iniFile",
      "iniProfile": "default"
    }
  }
}
```

### Different Configuration Files for Different Environments

It was stated above that the name of the configuration file was *app.config.json*. You can actually have different config files for different environments (ie: dev, prod, qa). On the commend line, you can specify the name of the enviroment by passing an argument of the form:

-env *xxx*

where *xxx* is the name of the environment (ie: dev, qa, prod). When an environment is specified, MessagingService will look for a configuration file named **app.config.*env*.json**. If it doesn't find a config file with that name, it will use the *app.config.json* file.

## Swagger Docuumentation
----

We use the express-oas-generator package to automatically generate the Swagger (OpenAPI) documentation for the APIs. To view the documentation, in your browser, navigate to http://localhost:[port]/api-docs, where `port` is the port that the Node AWS Messaging server is running on.

## Programming the API
----

To create a client for SQS, do the following:

```javascript
// foo.js
var express = require('express');
var app = express();

var messaging = require('node-aws-messaging');
var sqsClient = new messaging.SQSClient();

// Create a Queue
app.get(`/foo/queue/:queue/create`, (req, resp) =>
{
    sqsClient.createQueue(req.params.queue, { MessageRetentionPeriod: '300' })
        .then((queueInfo) =>
        {
            resp.status(200).json(queueInfo);
        })
        .catch((err) =>
        {
            resp.status(400).json({error: err});
        });
});

module.exports = app;

app.listen(3033, function()
{
    console.log('foo listening on port 3033!');
});
```

Notice that this code uses a JavaScript Promise. Creating a queue in SQS could take an undetermined amount of time, so when the queue has been created, then you can publish a message to it. Also, you should use the catch() statement to process any errors from the createQueue() call.

Open a browser, and enter the URL `http://localhost:3033/foo/queue/buzz-lightyear/create`

In the browser, you will see the response:

```json
{
  "ResourceType": "Queue",
  "Name": "buzz-lightyear",
  "Arn": "arn:aws:sqs:us-west-2:901643335044:buzz-lightyear",
  "Attributes": {
    "QueueArn": "arn:aws:sqs:us-west-2:901643335044:buzz-lightyear",
    "ApproximateNumberOfMessages": "0",
    "ApproximateNumberOfMessagesNotVisible": "0",
    "ApproximateNumberOfMessagesDelayed": "0",
    "CreatedTimestamp": "1511994792",
    "LastModifiedTimestamp": "1511994792",
    "VisibilityTimeout": "30",
    "MaximumMessageSize": "262144",
    "MessageRetentionPeriod": "300",
    "DelaySeconds": "0",
    "ReceiveMessageWaitTimeSeconds": "10"
  },
  "Url": "https://sqs.us-west-2.amazonaws.com/901643335044/buzz-lightyear"
}
```

To create and use an SNS client, do the following:

    import { SNSClient } from 'node-aws-messaging';
    ...
    private snsClient: SNSClient;
    ...
    this.snsClient = new SNSClient();
    ....
    snsClient.createTopic(topicName).then((topicInfo) => snsClient.publish(topicInfo, 'Customer.LoggedIn', msgText);
                                    .catch((err) => console.error(err));
    ....
    // when you are done with the client, you should dispose it
    this.snsClient.dispose();

If you want to enable the REST interface of the package, you need to call the following somewhere in your program:

    import { AWSMessagingRestApi } from 'node-aws-messaging';
    ...
    private api: AWSMessagingRestApi;
    ...
    this.api = new AWSMessagingRestApi();

The first line imports the namespace from the package. The second line declares a private variable which holds a reference to the API class (this is not strictly needed, but in the future, AWSMessagingAPI might implement IDisposable, and there may be a need to dispose the instance). The third line creates an instance of the REST API. When this function is called, the routes will be set up and the Rest API can be accessed by clients.

## REST API Interface
----

In addition to using the JavaScript API in your application, you can also use a RESTful API which can be used to interact with SQS and SNS.

| Operation | URL | Method | Body |
| --------- | --- | ------ | ---- |
| **SQS** | | | |
| Create a Queue named *queue* | `/messaging/queue/create` | POST | { "Name": *name* } |
| Send a message *body* to a *queue*. The queue will be created if it doesn't exist. | `/messaging/queue/:queue/send/:body` | GET | |
| Read a message from a *queue* | `/messaging/queue/:queue/read` | GET | |
| Get the AWS Queue Urls of all of the queues. We can pass an optional prefix to match against. | `/messaging/queue/?:prefix` | GET | |
| Get the resource information for all queues | `/messaging/queue/info` | GET | |
| Get the resource information for a single *queue* | `/messaging/queue/:queue?:create` | GET | |
| Delete a *queue* | `/messaging/queue/:queue` | DELETE | |
| **SNS** | | |
| Create a Topic named *topic* | `/messaging/topic/create` | POST | { "Name": *name* } |
| Publish a message *body* to a *topic*. The topic will be created if it doesn't exist. | `/messaging/topic/:topic/send/:body` | GET | |
| Get the AWS Topic ARNs of all topics. | `/messaging/topic` | GET | |
| Get the resource information for all topics | `/messaging/topic/info` | GET | |
| Get the resource information for a single *topic* | `/messaging/topic/:topic?:create` | GET | |
| Delete a *topic* | `/messaging/topic/:topic` | DELETE | |
| Subscribe to a topic via a queue | `/messaging/topic/:topic/subscribe/:queue` | GET | |
| Unsubscribe | `/messaging/topic/unsubscribe/:subscription` | GET | |

## Events

The **AWSMessagingServer** class has a member called **AWSEvents**. This is an event publisher that will publish interesting events that happen inside of the framework. The AWSEvents publisher derived from the [EventEmitter2](https://github.com/asyncly/EventEmitter2) class, which is a class that behaves the same way as NodeJS's EventEmitter, but has support for wildcard subscriptions.

If you want to subscribe to an event, you can do something like this:

    var server = new AWSMessagingServer();
    server.AWSEvents.on('AWS.Queue.*', function (args)
    {
        console.log(`The event received was ${this.event} and the arg is ${args[0]}`);
    });

If you want to subscribe to all events, do the following:

    this.api.EventPublisher.on('**', function(args)
    {
        console.log(`The event received was ${this.event} and the arg is ${args[0]}`);
    });

Notice that the code above used the old-style *function(args)* instead of *(args) =>*. This is because we need the '*this*' variable to refer to the event publisher itself, and not to the containing class. this.event will give you the name of the event that was received.

All events begin with the prefix **AWS**.

| Event | Args | Description |
| --------- | --- | ------ |
| AWS.Queue.Created | arg[0] = name of the queue | A new SQS queue was created |
| AWS.Queue.Deleted | arg[0] = name of the queue | An existing SQS queue was deleted |
| AWS.Queue.Purged | arg[0] = name of the queue | An existing SQS queue was purged |
| AWS.Topic.Created | arg[0] = name of the topic | A new SNS topic was created |
| AWS.Topic.Deleted | arg[0] = name of the topic | An existing SNS topic was deleted |
| AWS.Topic.Subscribed | args[0] = { Endpoint, Protocol, TopicArn } | An existing SNS topic was subscribed to |
| | args[1] = the ARN of the subscription | |
| AWS.Topic.Unsubscribed | arg[0] = the ARN of the subscription | An existing SNS topic was unsubscribed from |

### WebSockets

If you run the AWS Messaging application as a [PM2-hosted service](#the-messagingservice-application), then the events mentioned above will be broadcast through a WebSocket. If you write a client-side application that uses the AWS Messaging service, then you can subscribe to interesting events through the socket.

In the example below, we assume that we are connecting to a service running on your local machine on port 3050. When you subscribe, two event handlers will be set up. Subscribing to '*' (using rthe socketio-wildcard package) will subscribe to every event coming from the messaging service. You can also subscribe to a specific event and take some action when that event occurs.

```json
  protected socketCreate(): void {
    const connectOptions: SocketIOClient.ConnectOpts = {
      autoConnect: true,
    };

    this.io = socketIo('http://localhost:3050', connectOptions);

    // Subscribe to every even that comes out of the AWS Messaging server
    // https://github.com/hden/socketio-wildcard
    require('socketio-wildcard')(socketIo.Manager)(this.io);
    this.io.on('*', (eventInfo: EventArgs) => {
       // tslint:disable-next-line:no-console
       console.log(`Received wildcard event ${eventInfo.data[0]} targetting queue ${eventInfo.data[1]}`);
    });

    this.io.on('AWS.Queue.Created', (queueName: string) => {
      this.onQueueCreated(queueName);
    });
  }

  protected socketDestroy(): void {
    this.io.disconnect();
    this.io.close();
  }
```

## Testing
----

Mocha and Chai are used for the unit testing frameworks. In order to mock the AWS SDK calls, I used a package called [aws-sdk-mock](https://www.npmjs.com/package/aws-sdk-mock).

The unit test files are in the ./tests directory, and all of the tests are named *.test.ts. There is a Mocha task in the *launch.json* file which can be used to run the tests:

```json
{
  "request": "launch",
  "name": "Run mocha",
  "type": "node",
  "program": "/usr/local/lib/node_modules/mocha/bin/_mocha",
  "stopOnEntry": false,
  "args": ["dist/tests//.test.js"],
  "cwd": "${workspaceFolder}",
  "runtimeExecutable": null,
  "env": { "NODE_ENV": "testing"}
}
```

## Internals

Each client (SQS, SNS) has a **Resource Watcher**. This watcher polls the SQS queues and SNS topics at fixed intervals, and will send events if there is another queue or topic added or deleted. (It currently does not detect changes in the attributes of an existing queue).

## The MessagingService Application

There is an application that will instatiate an  AWS Messaging class and will listen to a port for REST requests. This application is called **MessagingService**. You can run this as a standlone application from a Terminal, or you can run it as a service using the **pm2** utility.

To run the application as a standlone executable:

    cd MessagingService
    node server.js

To run the application as a service:

    cd MessagingService
    pm2 start pm2.config.js

If you want to stop the service:

    pm2 stop MessagingService

If you want to delete the service from the list of running services that pm2 manages:

    pm2 delete MessagingService
