export interface ChannelConfig {
  id: string;
}

export interface CustomAudienceUserData {
  users: CustomAudienceUserInfomationData[];
}

export interface CustomAudienceUserInfomationData {
  email: string;
  phone?: string;
}

export abstract class Channel<Config extends ChannelConfig = ChannelConfig> {
  protected readonly id: string;

  constructor(readonly config: Config) {
    this.id = config.id;
  }

  public abstract createAd(data);

  public abstract createCampaign(data);
  // public abstract updateCampaign(campaignId: string, data);
  // public abstract updateCampaignStatus(campaignId: string, status: string);
  // public abstract deleteCampaign(campaignId: string);

  public abstract createCustomAudience(data);
  public abstract createCustomAudienceUsers(customAudienceId: string, data: CustomAudienceUserData);

  public getId() {
    return this.id;
  }
}

export default Channel;
