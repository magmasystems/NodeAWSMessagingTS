import { S3 } from "aws-sdk";
import { IAWSMessagingServerSettings } from "../awsMessagingServerSettings";
import { IServiceCreationArgs } from "../services/serviceCreationArgs";
import { AWSServiceClient } from "./awsServiceClient";

export class S3Client extends AWSServiceClient
{
    private S3Client: S3;

    constructor(args: IServiceCreationArgs)
    {
        super('S3', 'S3 Client', args.Settings);
        this.S3Client = this.createClient();
    }

    private constructor2(settings?: IAWSMessagingServerSettings)
    {
        // super('S3', 'S3 Client', settings);
        this.S3Client = this.createClient();
    }

    private createClient(): S3
    {
        return new S3({ region: this.AWSClient.Configuration.ses.region, apiVersion: '2006-03-01' });
    }

    public getServiceConfiguration(): any
    {
        return super.getServiceConfiguration().ses;
    }

    private deleteClient(): void
    {
        // There doesn't seem to be a dispose() function for the SES class
    }

    public getAllInfo(): Promise<{}>
    {
        return new Promise((resolve, _) => resolve());
    }

    public upload(bucketName: string, key: string, data: any)
    {
        return new Promise<any>((resolve, reject) =>
        {
            const createBucketInput = { Bucket: bucketName };
            this.S3Client.createBucket(createBucketInput, (err, createResult: S3.CreateBucketOutput) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }

                const params: S3.PutObjectRequest =
                {
                    Body: data,
                    Bucket: bucketName,
                    Key: key,
                };
                this.S3Client.upload(params, async (err4, uploadResult: S3.ManagedUpload.SendData) =>
                {
                    console.log(`File uploaded to S3 successfully at ${uploadResult.Location}`);
                    resolve({ blobUrl: uploadResult.Location, contentType: data.ContentType });
                });
            });
        });
    }
}
