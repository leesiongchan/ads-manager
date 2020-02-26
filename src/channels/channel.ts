import * as pino from 'pino';

export interface CustomAudienceUserData {
  users: CustomAudienceUserInfomationData[];
}

export interface CustomAudienceUserInfomationData {
  email: string;
  phone?: string;
}

export abstract class Channel {
  protected defaultValues: any;
  protected logger?: pino.Logger;

  constructor(protected readonly id: string) {}

  public abstract createAd(data: any): Promise<any>;

  public abstract createCampaign(data: any): Promise<any>;
  public abstract updateCampaign(campaignId: string, data: any): Promise<any>;
  public abstract updateCampaignStatus(campaignId: string, status: string): Promise<any>;
  public abstract deleteCampaign(campaignId: string): Promise<any>;

  public abstract createCustomAudience(data: any): Promise<any>;
  public abstract createCustomAudienceUsers(customAudienceId: string, data: CustomAudienceUserData): Promise<any>;
  public abstract deleteCustomAudienceUsers(customAudienceId: string, data: CustomAudienceUserData): Promise<any>;

  public abstract setDefaultValues(defaultValues: any): void;

  public setLogger(logger: pino.Logger) {
    this.logger = logger.child({ id: this.id });
  }

  public getLogger() {
    return this.logger;
  }

  public getId() {
    return this.id;
  }
}

export default Channel;
