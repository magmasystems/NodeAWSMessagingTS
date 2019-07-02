export interface IAWSResourceInfo
{
    Arn: string;
    Url: string;
    Name: string;
    Attributes: {};
}

/**
 * AWSResourceInfoBase
 *
 * @export
 * @class AWSResourceInfoBase
 */
export abstract class AWSResourceInfoBase implements IAWSResourceInfo
{
    public Arn: string;
    public Url: string;
    public Name: string;
    public Attributes: {};
    protected ResourceType: string;

    constructor(resourceType: string, name: string, arn: string, attributes: any = {})
    {
        this.ResourceType = resourceType;
        this.Name       = name;
        this.Arn        = arn;
        this.Attributes = attributes;
    }
}
