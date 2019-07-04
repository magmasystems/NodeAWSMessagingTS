import * as expressOasGenerator from 'express-oas-generator';
import * as socketio from 'socket.io';
import * as WebSocket from 'ws';
import { AppContext } from './src/appContext';
import { AWSMessagingServer } from './src/awsMessagingServer';
import { AWSServiceEventPublisher } from './src/awsServiceEventPublisher';
import { IDisposable, using } from './src/framework/using';
import { TSLogger } from './src/logging/tslogger';
import { NewmanCollectionRunner } from './tests/newmanCollectionRunner';
import { SQSTester } from './tests/sqsTests';

interface IWebSocketOnMessage { data: WebSocket.Data; type: string; target: WebSocket; }
interface IWebSocketOnClose { wasClean: boolean; code: number; reason: string; target: WebSocket; }
interface IWebSocketOnError { error: any; message: string; type: string; target: WebSocket; }

export class Program implements IDisposable
{
    public Servers: AWSMessagingServer[] = [];
    public Environments: string[] = [];
    private noCreateRest: boolean;
    private static io: SocketIO.Server;
    private static websocket: WebSocket.Server;
    private static logger: any;
    public PostmanCollectionName: string;

    constructor(args: string[])
    {
        this.processCommandLine(args);

        // If an environment was specified, then see if there is only a single environment. If so, then
        // the AppContext.Env should use that single environment.
        if (this.Environments.length === 1)
        {
            AppContext.Env = this.Environments[0];
        }
        else if (this.Environments.length === 0)
        {
            this.Environments = [ undefined ];
        }

        TSLogger.initialize();
        Program.logger = new TSLogger().createLogger('aws-messaging', []);

        // Catch termination and clean up
        process.on('SIGINT', () =>
        {
            if (this.Servers)
            {
                for (const server of this.Servers)
                {
                    server.dispose();
                }
            }
            process.exit(0);
        });

        for (let i = 0;  i < this.Environments.length;  i++)
        {
            // Create the Rest API, and also, Rest API for some testing
            if (this.noCreateRest) {
                continue;
            }

            const server = new AWSMessagingServer({ Environment: this.Environments[i] });
            this.Servers.push(server);

            // Only generate the Swaggerize docs on the first go-around
            if (i === 0)
            {
                expressOasGenerator.init(server.App, {});
            }

            SQSTester.CreateRestTests(this.Servers);

            server.AWSEvents.on('**', function(values)
            {
                Program.handleAWSEvents(server, this, values);
            });
        }
    }

    public dispose(): void
    {
    }

    private static handleAWSEvents(server: AWSMessagingServer, eventPublisher: any, values): void {
        let eventName: string = eventPublisher.event;
        eventName = eventName.replace(AWSServiceEventPublisher.Prefix, '');
        // 'this' is bound to the event, not to this MessagingServer class
        const userName = server.UserName;
        let logMessage = '';

        switch (eventName)
        {
            case "Queue.Created":
            case "Queue.Deleted":
            case "Queue.Purged" :
            case "Topic.Created":
            case "Topic.Deleted":
                const objectName: string = values[0];
                logMessage = `${eventName}: ${objectName}, user: ${server.UserName}`;
                Program.io.emit(eventPublisher.event, objectName);
                break;

            case "Resource.Changed":
                const [serviceType, clientName, newMap] = values;
                Program.io.emit(eventPublisher.event, serviceType, clientName, newMap);
                break;
        }

        // We can write events to an audit log
        if (logMessage.length > 0)
        {
            Program.logger.info(logMessage);
        }
    }

    private processCommandLine(args: string[]): void
    {
        // args[0] is "node"
        // args[1] is the name of the file tp execute (app.js)
        // args[2] starts the command-line args
        for (let i = 2;  i < args.length;  i++)
        {
            switch (args[i].toLowerCase())
            {
                case "mock":
                    AppContext.IsMocking = true;
                    break;

                case "norest":
                    this.noCreateRest = true;
                    break;

                case "-env":
                    this.Environments.push(args[++i]);
                    break;

                case "-postman":
                    this.PostmanCollectionName = args[++i];
                    break;

                default:
                    console.log(`Unknown command-line argument: [${args[i]}]`);
                    break;
            }
        }
    }

    private initWebSocket(http): void
    {
        if (Program.io)
        {
            return;
        }

        Program.io = socketio(http);

        Program.io.on('connection', (socket) =>
        {
            Program.logger.info('A client connected through the socket');
            socket.on('disconnect', () =>
            {
                Program.logger.info('A client disconnected from the socket');
            });

            // Here we can put in event handlers for messages that the clients send us...
        });
    }

    private initWebSocketWS(httpServer: any): void
    {
        if (Program.websocket)
        {
            return;
        }

        // ws://localhost:3053/awsmessaging/ws
        Program.websocket = new WebSocket.Server({ server: httpServer, path: '/awsmessaging/ws' });
        Program.websocket.on('connection', (socket) =>
        {
            Program.logger.info('A client connected through the socket');
            socket.on('message', (event: WebSocket.Data) =>
            {
                Program.logger.info('A client sent a message to the socket:');
                Program.logger.info(`[${event.toString()}]`);
            });
            socket.on('close', (event: IWebSocketOnClose) =>
            {
                Program.logger.info('A client disconnected from the socket');
            });
            socket.on('error', (event: IWebSocketOnError) =>
            {
                Program.logger.error(`WebSocket error: ${event.message}`);
            });

            // Here we can put in event handlers for messages that the clients send us...
        });
    }

    public messageLoop(server: AWSMessagingServer): void
    {
        if (process.send)
        {
            process.send('ready');  // to let pm2 know that the service is ready
        }

        const http = require('http').Server(server.App);
        const port = server.Configuration.appSettings.serverPort || 3000;
        AppContext.HttpServer = http.listen(port, () =>
        {
            Program.logger.info(`NodeAWSMessaging listening on port ${port}!`);
        });

        // this.initWebSocket(http);
        this.initWebSocketWS(AppContext.HttpServer);
    }
}

using (new Program(process.argv), (program) =>
{
    for (const server of program.Servers)
    {
        program.messageLoop(server);
    }

    if (program.PostmanCollectionName)
    {
        new NewmanCollectionRunner(program.PostmanCollectionName).runPostmanCollection();
    }
});
