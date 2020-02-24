export interface CustomAudienceUserData {
  users: CustomAudienceUserInfomationData[];
}

export interface CustomAudienceUserInfomationData {
  email: string;
  phone?: string;
}

export abstract class Channel {
  protected defaultValues: any;

  constructor(protected readonly id: string) {}

  public abstract createAd(data: any): Promise<any>;

  public abstract createCampaign(data: any): Promise<any>;
  // public abstract updateCampaign(campaignId: string, data);
  // public abstract updateCampaignStatus(campaignId: string, status: string);
  // public abstract deleteCampaign(campaignId: string);

  public abstract createCustomAudience(data: any): Promise<any>;
  public abstract createCustomAudienceUsers(customAudienceId: string, data: CustomAudienceUserData): Promise<any>;

  public abstract setDefaultValues(defaultValues: any): void;

  public getId() {
    return this.id;
  }
}

export default Channel;
