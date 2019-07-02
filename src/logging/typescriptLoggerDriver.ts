import { LFService, Logger, LoggerFactory, LoggerFactoryOptions, LogGroupRule, LogLevel } from "typescript-logging";
import { ILoggingSettings, ITSLogDriver, TSLogLevel } from "./tslogger";

export class TypescriptLoggerDriver implements ITSLogDriver
{
    private static factory: LoggerFactory;
    private static defaultLogger: Logger;
    private logger: Logger;

    public initialize(loggingSettings: ILoggingSettings): void
    {
        const options = new LoggerFactoryOptions();
        options.addLogGroupRule(new LogGroupRule(new RegExp("app" + ".+"), LogLevel.Info));
        TypescriptLoggerDriver.factory = LFService.createNamedLoggerFactory("app", options);
        TypescriptLoggerDriver.defaultLogger = TypescriptLoggerDriver.factory.getLogger("app.default");
    }

    public createLogger(loggerName: string, loggingSettings: ILoggingSettings, params?: []): any
    {
        try
        {
            if (!loggerName.startsWith("app.")) {
                loggerName = "app." + loggerName;
            }

            this.logger = TypescriptLoggerDriver.factory.getLogger(loggerName);
        }
        catch (exc)
        {
            console.log(exc.message);
            this.logger = TypescriptLoggerDriver.defaultLogger;
        }

        return this.logger;
    }

    public log(msg: string, logLevel: TSLogLevel = TSLogLevel.Info): void
    {
        switch (logLevel)
        {
            case TSLogLevel.Error:
                this.logger.error(msg);
                break;
            case TSLogLevel.Error:
                this.logger.warn(msg);
                break;
            default:
                this.logger.info(msg);
                break;
        }
    }
}
