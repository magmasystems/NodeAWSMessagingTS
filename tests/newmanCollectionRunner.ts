import * as newman from 'newman';
import * as postman from 'postman-collection';
import { Logger } from 'typescript-logging';
import { TSLogger } from '../src/logging/tslogger';

export class NewmanCollectionRunner
{
    // This will reset the user_id key in the User table
    // ALTER SEQUENCE user_user_id_seq RESTART WITH 5

    private static logger: Logger;
    private PostmanCollectionName: string;

    constructor(postmanCollectionName: string)
    {
        this.PostmanCollectionName = postmanCollectionName;
        NewmanCollectionRunner.logger = new TSLogger().createLogger('app.Newman', []);
    }

    public runPostmanCollection(): boolean
    {
        if (!this.PostmanCollectionName)
        {
            return false;
        }

        const fs = require('fs'); // needed to read JSON file from disk
        fs.access(this.PostmanCollectionName, fs.constants.F_OK, (err) =>
        {
            if (err)
            {
                NewmanCollectionRunner.logger.warn(`${this.PostmanCollectionName} does not exist`);
                return false;
            }
        });

        const collectionString = fs.readFileSync(this.PostmanCollectionName).toString();
        const collectionJson = JSON.parse(collectionString);

        const UseCaseFolderName = 'Use Case - User CRUD';

        const pmCollection: postman.Collection = new postman.Collection(collectionJson);
        const useCaseFolder = pmCollection.items.find((item) => item.name.indexOf(UseCaseFolderName) >= 0, null);
        if (useCaseFolder)
        {
        }

        NewmanCollectionRunner.logger.info(`Starting to run the Newman collection named [${UseCaseFolderName}]`);
        const runOptions: newman.NewmanRunOptions =
        {
            collection: collectionJson,
            folder: UseCaseFolderName,
            reporters: 'cli',
        };
        newman.run(runOptions, (err, summary) =>
        {
            if (err || summary.error)
            {
                return false;
            }
            else
            {
                // See if any of the responses returned an error code
                let hasErrors = false;
                for (const execution of summary.run.executions)
                {
                    const response: any = (execution as any).response;
                    NewmanCollectionRunner.logger.info(`Request ${execution.item.name} returned ${response.code}`);
                    if (response.code >= 400) {
                        hasErrors = true;
                    }
                }

                if (hasErrors)
                {
                    return false;
                }

                /*
                const getAllUsersResponse: any = (summary.run.executions[0] as any).response;
                if (getAllUsersResponse.code === 200)
                {
                    const jsonUsers: any = JSON.parse(getAllUsersResponse.stream.toString());
                    const users: User[] = jsonUsers.result.map((jsonUser) =>
                    {
                        return User.fromDatabaseJson(jsonUser);
                    });
                    if (users.length >= 0)
                    {

                    }
                }
                */
            }
        });

        return true;
    }
}
