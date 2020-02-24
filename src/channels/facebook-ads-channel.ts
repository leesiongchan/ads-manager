import * as path from 'path';
// @ts-ignore
import facebookBizSdk from 'facebook-nodejs-business-sdk';
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
  adSet: Omit<FacebookAdSetData, 'campaignId' | 'customAudienceId' | 'name' | 'status'>;
  campaign: Omit<FacebookCampaignData, 'name' | 'status'>;
  customAudience?: Omit<FacebookCustomAudienceData, 'name' | 'subtype'>;
  customAudienceId?: string;
  name: string;
  status: FacebookCampaignStatus;
}

interface FacebookAdsCustomAudienceUserData extends CustomAudienceUserData {}

export class FacebookAdsChannel extends Channel {
  private adAccount: facebookBizSdk.AdAccount;
  protected defaultValues: FacebookAdsDefaultData = {};

  constructor(readonly id: string, private config: FacebookAdsChannelConfig) {
    super(id);

    this.updateClient();
  }

  public async createAd({ imageUrl, ...data }: FacebookAdsAdCreativeData) {
    const image = (await httpClient(imageUrl, { responseType: 'buffer' })).body;
    const adImage = await this.adAccount.createAdImage([], {
      bytes: image.toString('base64'),
      name: path.basename(imageUrl),
    });
    return this.adAccount.createAdCreative(
      [],
      this.composeAdCreativeData({
        ...data,
        imageHash: Object.values<{ hash: string }>(adImage.images)[0].hash,
      }),
    );
  }

  public async createCampaign(data: FacebookAdsCampaignData) {
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
    const campaign = await this.adAccount.createCampaign([], campaignData);

    // 2. Create Custom Audience (optional)
    let customAudienceId = data.customAudienceId;
    if (data.customAudience) {
      const customAudience = await this.createCustomAudience({
        ...this.defaultValues.customAudience,
        ...data.customAudience,
        name: `${data.name} - Custom Audience - ${new Date().getTime()}`,
        subtype: 'CUSTOM',
      });
      customAudienceId = customAudience.id;
    }

    // 3. Create AdSet
    const adSetData = this.composeAdSetData({
      ...this.defaultValues.adSet,
      ...data.adSet,
      campaignId: campaign.id,
      customAudienceId,
      name: `${data.name} - Ad Set`,
      status: data.status,
    });
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
    await Promise.all(adsData.map(adData => this.adAccount.createAd([], adData)));

    return campaign;
  }

  public createCustomAudience(data: FacebookCustomAudienceData) {
    return this.adAccount.createCustomAudience([], this.composeCustomAudienceData(data));
  }

  public createCustomAudienceUsers(customAudienceId: string, data: FacebookAdsCustomAudienceUserData) {
    const customAudience = new facebookBizSdk.CustomAudience(customAudienceId);
    return customAudience.createUser([], this.composeCustomAudienceUserData(data));
  }

  public setDefaultValues(defaultValues: FacebookAdsDefaultData) {
    this.defaultValues = defaultValues;
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
          call_to_action: { type: adCreative.callToActionType, value: { link: adCreative.link } },
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

  private composeAdSetData(adSet: FacebookAdSetData) {
    return {
      bid_amount: adSet.bidAmount,
      billing_event: adSet.billingEvent,
      campaign_id: adSet.campaignId,
      end_time: adSet.endTime,
      name: adSet.name,
      optimization_goal: adSet.optimizationGoal,
      start_time: adSet.startTime,
      status: adSet.status,
      targeting: { custom_audiences: [{ id: adSet.customAudienceId }] },
    };
  }

  private composeCustomAudienceData(customAudience: FacebookCustomAudienceData) {
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

  private composeCampaignData(campaign: FacebookCampaignData) {
    return {
      daily_budget: campaign.dailyBudget,
      lifetime_budget: campaign.lifetimeBudget,
      name: campaign.name,
      objective: campaign.objective,
      special_ad_category: campaign.specialAdCategory,
      status: campaign.status,
    };
  }

  public setConfig(config: Partial<FacebookAdsChannelConfig>) {
    Object.assign(this.config, config);
    this.updateClient();
  }

  private updateClient() {
    facebookBizSdk.FacebookAdsApi.init(this.config.accessToken);
    this.adAccount = new facebookBizSdk.AdAccount(this.config.adAccountId);
  }
}
