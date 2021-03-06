// @ts-ignore
import * as facebookBizSdk from 'facebook-nodejs-business-sdk';
import * as path from 'path';
import { DeepPartial } from 'ts-essentials';
import { sha256 } from 'js-sha256';

import Channel, { CustomAudienceUserData } from './channel';
import {
  FacebookAdCreativeData,
  FacebookAdData,
  FacebookAdSetData,
  FacebookCampaignData,
  FacebookCampaignStatus,
  FacebookCustomAudienceData,
} from '../interfaces/facebook-ads';
import httpClient from '../utils/http-client';
import { facebookAdSetSchema, facebookCampaignSchema } from '../validation-schemas/facebook-ads-schema';
import { normalizeEmail } from '../utils/normalizer';

type FacebookAdsDefaultData = DeepPartial<
  Omit<FacebookAdsCampaignData, 'adCreativeIds' | 'adCreatives' | 'customAudienceId' | 'name' | 'status'>
>;

interface FacebookAdsChannelConfig {
  accessToken: string;
  adAccountId: string;
}

interface FacebookAdsAdCreativeData extends Omit<FacebookAdCreativeData, 'imageHash'> {
  imageUrl: string;
}

interface FacebookAdsCampaignData {
  adCreativeIds?: string[];
  adCreatives?: Omit<FacebookAdsAdCreativeData, 'name'>[];
  adSet: Partial<Omit<FacebookAdSetData, 'campaignId' | 'customAudienceId' | 'name' | 'status'>>;
  campaign: Partial<Omit<FacebookCampaignData, 'name' | 'status'>>;
  customAudience?: Partial<Omit<FacebookCustomAudienceData, 'name' | 'subtype'>>;
  customAudienceId?: string;
  name: string;
  status: FacebookCampaignStatus;
}

interface FacebookAdsCustomAudienceUserData extends CustomAudienceUserData {}

export class FacebookAdsChannel extends Channel {
  private adAccount: facebookBizSdk.AdAccount;
  protected defaultValues: FacebookAdsDefaultData = {};

  constructor(readonly id: string, private config?: FacebookAdsChannelConfig) {
    super(id);

    if (config && this.requiredConfigKeys.every(key => config[key])) {
      this.updateClient();
    }
  }

  private get requiredConfigKeys(): (keyof FacebookAdsChannelConfig)[] {
    return ['accessToken', 'adAccountId'];
  }

  public async createAd({ imageUrl, ...data }: FacebookAdsAdCreativeData) {
    if (!this.adAccount) {
      throw new Error('Channel has not been configured yet');
    }

    const image = (await httpClient(imageUrl, { responseType: 'arraybuffer' })).data;
    const adImageData = {
      bytes: image.toString('base64'),
      name: path.basename(imageUrl),
    };
    this.getLogger()?.info({ ...adImageData, bytes: '--skipped--' }, `Creating Ad Image...`);
    const adImage = await this.adAccount.createAdImage([], adImageData);

    const adCreativeData = this.composeAdCreativeData({
      ...data,
      imageHash: Object.values<{ hash: string }>(adImage.images)[0].hash,
    });
    this.getLogger()?.info(adCreativeData, `Creating Ad Creative...`);
    const adCreative = await this.adAccount.createAdCreative([], adCreativeData);

    this.getLogger()?.info(`Ad Creative has been created successfully -> ${adCreative.id}`);

    return adCreative;
  }

  public async createCampaign(data: FacebookAdsCampaignData) {
    if (!this.adAccount) {
      throw new Error('Channel has not been configured yet');
    }
    if (!data.adCreativeIds && !data.adCreatives) {
      throw new Error('`adCreativeIds` or `adCreatives` is not defined');
    }
    if (!data.customAudienceId && !data.customAudience) {
      throw new Error('`customAudienceId` or `customAudience` is not defined');
    }

    // 1. Create Campaign
    const campaignData = this.composeCampaignData({
      ...this.defaultValues.campaign,
      ...data.campaign,
      name: data.name,
      status: data.status,
    });
    this.assertData(
      { ...facebookCampaignSchema, required: ['name', 'objective', 'special_ad_category', 'status'] },
      campaignData,
    );
    this.getLogger()?.info(campaignData, `Creating Campaign...`);
    const campaign = await this.adAccount.createCampaign([], campaignData);

    // 2. Create Custom Audience (optional)
    let customAudienceId = data.customAudienceId;
    if (data.customAudience) {
      const customAudienceData: Partial<FacebookCustomAudienceData> = {
        ...this.defaultValues.customAudience,
        ...data.customAudience,
        name: `${data.name} - Custom Audience - ${new Date().getTime()}`,
        subtype: 'CUSTOM',
      };
      this.getLogger()?.info(customAudienceData, `Creating Custom Audience...`);
      const customAudience = await this.createCustomAudience(customAudienceData);
      customAudienceId = customAudience.id;
    }

    // 3. Create AdSet
    const adSetData = this.composeAdSetData({
      ...this.defaultValues.adSet,
      ...data.adSet,
      campaignId: campaign.id,
      customAudienceId: customAudienceId!,
      name: `${data.name} - Ad Set`,
      status: data.status,
    });
    this.assertData(
      {
        ...facebookAdSetSchema,
        required: [
          'billing_event',
          'campaign_id',
          'custom_audience_id',
          'name',
          'optimization_goal',
          'start_time',
          'status',
        ],
      },
      adSetData,
    );
    this.getLogger()?.info(adSetData, `Creating Ad Set...`);
    const adSet = await this.adAccount.createAdSet([], adSetData);

    // 4. Create AdCreative (optional)
    let adCreativeIds = data.adCreativeIds;
    if (data.adCreatives) {
      const adCreatives = await Promise.all(
        data.adCreatives.map(adCreativeData =>
          this.createAd({ ...adCreativeData, name: `${data.name} - Ad Creative - ${new Date().getTime()}` }),
        ),
      );
      adCreativeIds = adCreatives.map(adCreative => adCreative.id);
    }

    // 5. Create Ads
    const adsData =
      adCreativeIds?.map(adCreativeId =>
        this.composeAdData({
          adCreativeId,
          adSetId: adSet.id,
          name: `${data.name} - Ad - ${new Date().getTime()}`,
          status: data.status,
        }),
      ) || [];
    await Promise.all(
      adsData.map((adData, index) => {
        this.getLogger()?.info(adData, `Creating Ad (${index + 1}/${adsData.length})...`);
        return this.adAccount.createAd([], adData);
      }),
    );

    this.getLogger()?.info(`Campaign has been created successfully -> ${campaign.id}`);

    return campaign;
  }

  public async updateCampaign(
    campaignId: string,
    data: Partial<Pick<FacebookAdsCampaignData, 'adSet' | 'campaign' | 'name' | 'status'>>,
  ) {
    if (!this.adAccount) {
      throw new Error('Channel has not been configured yet');
    }

    const campaign = new facebookBizSdk.Campaign(campaignId);

    if (data.adSet) {
      // We only support for 1 Ad Set for now
      const [adSet] = await campaign.getAdSets();
      const adSetData = this.composeAdSetData(data.adSet as FacebookAdSetData);
      this.getLogger()?.info(adSetData, `Updating Ad Set... -> ${adSet.id}`);
      await adSet.update([], adSetData);
    }

    if (data.campaign) {
      const campaignData = this.composeCampaignData(data.campaign as FacebookCampaignData);
      this.getLogger()?.info(campaignData, `Updating Campaign... -> ${campaignId}`);
      await campaign.update([], campaignData);
    }

    if (data.name || data.status) {
      const campaignData = { name: data.name, status: data.status };
      this.getLogger()?.info(campaignData, `Updating Campaign name and status... -> ${campaignId}`);
      await campaign.update([], campaignData);
    }

    this.getLogger()?.info(`Campaign has been updated successfully -> ${campaignId}`);

    return campaign.get();
  }

  public async updateCampaignStatus(campaignId: string, status: FacebookCampaignStatus) {
    if (!this.adAccount) {
      throw new Error('Channel has not been configured yet');
    }
    this.getLogger()?.info(`Updating Campaign status to ${status}... -> ${campaignId}`);
    const campaign = new facebookBizSdk.Campaign(campaignId);
    await campaign.update([], { status });
    this.getLogger()?.info(`Campaign status has been updated successfully -> ${campaignId}`);
    return campaignId;
  }

  public async deleteCampaign(campaignId: string) {
    if (!this.adAccount) {
      throw new Error('Channel has not been configured yet');
    }
    this.getLogger()?.info(`Deleting Campaign... -> ${campaignId}`);
    const campaign = new facebookBizSdk.Campaign(campaignId);
    await campaign.delete([]);
    this.getLogger()?.info(`Campaign has been deleted successfully -> ${campaignId}`);
    return campaignId;
  }

  public async createCustomAudience(data: Partial<FacebookCustomAudienceData>) {
    if (!this.adAccount) {
      throw new Error('Channel has not been configured yet');
    }
    const customAudienceData = this.composeCustomAudienceData({
      ...this.defaultValues.customAudience,
      ...data,
      subtype: 'CUSTOM',
    });
    this.getLogger()?.info(customAudienceData, `Creating Custom Audience...`);
    const customAudience = await this.adAccount.createCustomAudience([], customAudienceData);
    this.getLogger()?.info(`Custom Audience has been created successfully -> ${customAudience.id}`);
    return customAudience;
  }

  public async createCustomAudienceUsers(customAudienceId: string, data: FacebookAdsCustomAudienceUserData) {
    if (!this.adAccount) {
      throw new Error('Channel has not been configured yet');
    }
    const customAudience = new facebookBizSdk.CustomAudience(customAudienceId);
    const customAudienceUserData = this.composeCustomAudienceUserData(data);
    this.getLogger()?.info(`Adding ${data.users.length} users to the Custom Audience...`);
    const customAudienceUser = await customAudience.createUser([], customAudienceUserData);
    this.getLogger()?.info(`${data.users.length} users have been added to the Custom Audience -> ${customAudienceId}`);
    return customAudienceUser;
  }

  public async deleteCustomAudienceUsers(customAudienceId: string, data: FacebookAdsCustomAudienceUserData) {
    if (!this.adAccount) {
      throw new Error('Channel has not been configured yet');
    }
    const customAudience = new facebookBizSdk.CustomAudience(customAudienceId);
    const customAudienceUserData = this.composeCustomAudienceUserData(data);
    this.getLogger()?.info(`Deleting ${data.users.length} users from the Custom Audience...`);
    const customAudienceUser = await customAudience.deleteUsers(customAudienceUserData);
    this.getLogger()?.info(
      `${data.users.length} users have been deleted from the Custom Audience -> ${customAudienceId}`,
    );
    return customAudienceUser;
  }

  public setConfig(config: Partial<FacebookAdsChannelConfig>) {
    Object.assign(this.config, config);
    if (this.config && this.requiredConfigKeys.every(key => this.config?.[key])) {
      this.updateClient();
    }
  }

  public setDefaultValues(defaultValues: FacebookAdsDefaultData) {
    this.defaultValues = defaultValues;
  }

  private assertData<T>(schema: object, data: T) {
    const validated = this.ajv.validate(schema, data) as boolean;
    if (this.ajv.errors) {
      throw new Error(this.ajv.errorsText());
    }
    return validated;
  }

  private composeAdData(ad: FacebookAdData) {
    return {
      adset_id: ad.adSetId,
      creative: { creative_id: ad.adCreativeId },
      name: ad.name,
      status: ad.status,
    };
  }

  private composeAdCreativeData(adCreative: FacebookAdCreativeData) {
    return {
      name: adCreative.name,
      object_story_spec: {
        link_data: {
          call_to_action: adCreative.callToActionType
            ? { type: adCreative.callToActionType, value: { link: adCreative.link } }
            : undefined,
          description: adCreative.description,
          image_hash: adCreative.imageHash,
          link: adCreative.link,
          message: adCreative.text,
          name: adCreative.headline,
        },
        page_id: adCreative.pageId,
      },
    };
  }

  private composeAdSetData(adSet: Partial<FacebookAdSetData>) {
    return {
      bid_amount: adSet.bidAmount,
      billing_event: adSet.billingEvent,
      campaign_id: adSet.campaignId,
      end_time: adSet.endTime,
      name: adSet.name,
      optimization_goal: adSet.optimizationGoal,
      start_time: adSet.startTime,
      status: adSet.status,
      targeting: adSet.customAudienceId ? { custom_audiences: [{ id: adSet.customAudienceId }] } : undefined,
    };
  }

  private composeCustomAudienceData(customAudience: Partial<FacebookCustomAudienceData>) {
    return {
      customer_file_source: customAudience.customerFileSource,
      description: customAudience.description,
      name: customAudience.name,
      subtype: customAudience.subtype,
    };
  }

  private composeCustomAudienceUserData(customAudienceUserData: FacebookAdsCustomAudienceUserData) {
    return {
      payload: {
        schema: ['EMAIL', 'PHONE'],
        data: customAudienceUserData.users.map(userData => [
          sha256(normalizeEmail(userData.email)),
          userData.phone ? sha256(userData.phone) : undefined,
        ]),
      },
    };
  }

  private composeCampaignData(campaign: Partial<FacebookCampaignData>) {
    return {
      daily_budget: campaign.dailyBudget,
      lifetime_budget: campaign.lifetimeBudget,
      name: campaign.name,
      objective: campaign.objective,
      special_ad_category: campaign.specialAdCategory,
      status: campaign.status,
    };
  }

  private updateClient() {
    if (!this.config || !this.requiredConfigKeys.every(key => this.config?.[key])) {
      throw new Error('Channel has not been configured yet');
    }
    facebookBizSdk.FacebookAdsApi.init(this.config.accessToken);
    this.adAccount = new facebookBizSdk.AdAccount(this.config.adAccountId);
  }
}
