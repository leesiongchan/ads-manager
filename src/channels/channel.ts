export interface CustomAudienceUserData {
  users: CustomAudienceUserInfomationData[];
}

export interface CustomAudienceUserInfomationData {
  email: string;
  phone?: string;
}

export abstract class Channel {
  constructor(protected readonly id: string) {}

  public abstract createAd<T>(data: any): Promise<T>;

  public abstract createCampaign<T>(data: any): Promise<T>;
  // public abstract updateCampaign(campaignId: string, data);
  // public abstract updateCampaignStatus(campaignId: string, status: string);
  // public abstract deleteCampaign(campaignId: string);

  public abstract createCustomAudience<T>(data: any): Promise<T>;
  public abstract createCustomAudienceUsers<T>(customAudienceId: string, data: CustomAudienceUserData): Promise<T>;

  public getId() {
    return this.id;
  }
}

export default Channel;
