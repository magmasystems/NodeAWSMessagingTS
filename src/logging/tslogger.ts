import { AppContext } from "../appContext";
import { Log4jsLoggerDriver } from "./log4jsLoggerDriver";
import { TypescriptLoggerDriver } from "./typescriptLoggerDriver";
import { ConfigurationManager } from "../configurationManager";

// https://github.com/mreuvers/typescript-logging/blob/HEAD/docs/latest_log4j.md

export enum TSLogLevel
{
    None,
    Debug,
    Info,
    Warn,
    Error,
}

export interface ITSLogger
{
    log(msg: string, logLevel: TSLogLevel): void;
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
}

export interface ILoggingSettings
{
    level: string;
}

export class TSLogger implements ITSLogger
{
    private static Driver: ITSLogDriver;
    private static Config: any;
    private static LoggingSettings: ILoggingSettings;

    public static initialize(driver: string = null)
    {
        TSLogger.Config = new ConfigurationManager({ Environment: AppContext.Env }).Configuration;
        TSLogger.LoggingSettings = this.Config.appSettings.logging || { level: "Info" };

        TSLogger.Driver = LoggerDriverFactory.Create(driver);
        TSLogger.Driver.initialize(TSLogger.LoggingSettings);
    }

    public createLogger(loggerName: string, params?: []): any
    {
        return TSLogger.Driver.createLogger(loggerName, TSLogger.LoggingSettings, params);
    }

    public log(msg: string, logLevel: TSLogLevel = TSLogLevel.Info): void
    {
        TSLogger.Driver.log(msg, logLevel);
    }

    public info(msg: string): void
    {
        this.log(msg, TSLogLevel.Info);
    }

    public warn(msg: string): void
    {
        this.log(msg, TSLogLevel.Warn);
    }

    public error(msg: string): void
    {
        this.log(msg, TSLogLevel.Error);
    }
}

export interface ITSLogDriver
{
    initialize(loggingSettings: any): void;
    createLogger(loggerName: string, loggingSettings?: any, params?: []): any;
    log(msg: string, logLevel: TSLogLevel): void;
}

export class LoggerDriverFactory
{
    public static Create(driverName: string): ITSLogDriver
    {
        if (!driverName)
        {
            driverName = "log4js";
        }

        switch (driverName.toLowerCase())
        {
            case "log4js":
                return new Log4jsLoggerDriver();
            case "ts":
            default:
                return new TypescriptLoggerDriver();
        }
    }
}
