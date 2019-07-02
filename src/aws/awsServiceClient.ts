"use strict";

// import entire SDK
/// <reference types="aws-sdk" />
import * as AWS from 'aws-sdk';
import { EventEmitter2 } from 'eventemitter2';
import express = require('express');
import { AWSMessagingApiManager } from '../awsMessagingApiManager';
import { AWSServiceEventPublisher } from '../awsServiceEventPublisher';
import { IDisposable, using } from '../framework/using';
import { TSLogger } from '../logging/tslogger';
import { IServiceCreationArgs } from '../services/serviceCreationArgs';
import { AWSClient } from './awsClient';

/**
 * AWSServiceClient
 *
 * @export
 * @class AWSServiceClient
 * @implements {IDisposable}
 */
export abstract class AWSServiceClient implements IDisposable
{
    private static ServiceClientInstanceNumber: number = 1;
    private static instanceNumber: number = 0;

    /**
     * AWSClient
     *
     * @type {AWSClient}
     * @memberof AWSServiceClient
     */
    public AWSClient: AWSClient;

    /**
     * Name
     *
     * @type {string}
     * @memberof AWSServiceClient
     */
    public Name: string;

    /**
     * ServiceType
     *
     * @type {string}
     * @memberof AWSServiceClient
     */
    public ServiceType: string;

    /**
     * Config
     *
     * @type {*}
     * @memberof AWSServiceClient
     */
    public Config: any;

    /**
     * Logger
     *
     * @protected
     * @type {*}
     * @memberof AWSServiceClient
     */
    protected Logger: any;

    /**
     * EventPublisher
     *
     * @type {AWSServiceEventPublisher}
     * @memberof AWSServiceClient
     */
    public EventPublisher: AWSServiceEventPublisher;

    /**
     * ResourceInfoChanged
     *
     * @memberof AWSServiceClient
     */
    public ResourceInfoChanged: (client: AWSServiceClient, map: {}) => void;

    private apiManager: AWSMessagingApiManager;
    public get Manager(): AWSMessagingApiManager { return this.apiManager; }
    public set Manager(val: AWSMessagingApiManager) { this.apiManager = val; }

    constructor(args: IServiceCreationArgs)
    {
        const inst = ++AWSServiceClient.instanceNumber;

        // this.Name = `${name}_${AWSServiceClient.ServiceClientInstanceNumber++}`;
        this.Name = `${args.Name}`;
        this.ServiceType = args.ServiceType || 'AWS Messaging';
        this.AWSClient = new AWSClient(args.Name, args.Settings);
        this.Config = this.AWSClient.Configuration;
        this.Logger = new TSLogger().createLogger(`${this.Name}-${inst}`, []);
        this.EventPublisher = new AWSServiceEventPublisher(this.Name);
    }

    public dispose(): void
    {
        this.AWSClient.dispose();
        this.Logger.info(`${this.Name} disposed`);
    }

    public getServiceConfiguration(): any
    {
        return this.AWSClient.Configuration;
    }

    protected getEntityName(): string
    {
        return this.Name.endsWith("Service") ? this.Name.replace("Service", "") : this.Name;
    }

    public createApi(router: express.Router): void
    {
        router.route(`/${this.Name}`).get((req, resp) =>
        {
            this.Logger.info(`Got a simple GET request for the service: Name ${req.params.queue}`);
            resp.status(200).json({ serviceName: this.Name });

        });
    }

    public getCurrentInfoMap(): {}
    {
        return null;
    }

    public abstract async getAllInfo(): Promise<{}>;

    public swapInfoMap(newMap: {}, fireChangeEvent: boolean = false): void
    {
        // The subclass is supposed to assign the map now

        if (fireChangeEvent && this.ResourceInfoChanged)
        {
            this.Logger.info(`swapInfoMap - the resource has changed for ${this.Name}`);
            this.ResourceInfoChanged(this, newMap);
        }
    }

    protected extractNameFromArn(arn: string): string
    {
        const idx = arn.lastIndexOf(":");
        return arn.substring(idx + 1);
    }
}
