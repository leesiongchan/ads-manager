import * as path from 'path';
import facebookBizSdk from 'facebook-nodejs-business-sdk';
import { sha256 } from 'js-sha256';

import Channel, { ChannelConfig, CustomAudienceUserData } from './channel';
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

type FacebookDefaultData = Partial<FacebookFullCampaignData & { customAudience: FacebookCustomAudienceData }>;

interface FacebookAdsChannelConfig extends ChannelConfig {
  accessToken: string;
  adAccountId: string;
}

interface FacebookFullAdCreativeData extends Omit<FacebookAdCreativeData, 'imageHash'> {
  imageUrl: string;
}

interface FacebookFullCampaignData {
  adCreativeIds?: string[];
  adCreatives?: Omit<FacebookFullAdCreativeData, 'name'>[];
  adSet: Omit<FacebookAdSetData, 'campaignId' | 'customAudienceId' | 'name' | 'status'>;
  campaign: Omit<FacebookCampaignData, 'name' | 'status'>;
  customAudience?: Omit<FacebookCustomAudienceData, 'name'>;
  customAudienceId?: string;
  name: string;
  status: FacebookCampaignStatus;
}

interface FacebookCustomAudienceUserData extends CustomAudienceUserData {}

export class FacebookAdsChannel extends Channel {
  private adAccount: facebookBizSdk.AdAccount;
  private defaultValues: FacebookDefaultData = {};

  constructor(readonly config: FacebookAdsChannelConfig) {
    super(config);

    facebookBizSdk.FacebookAdsApi.init(config.accessToken);
    this.adAccount = new facebookBizSdk.AdAccount(config.adAccountId);
  }

  public async createAd({ imageUrl, ...data }: FacebookFullAdCreativeData) {
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

  public async createCampaign(data: FacebookFullCampaignData) {
    if (!data.adCreativeIds && !data.adCreatives) {
      throw new Error('`adCreativeIds` or `adCreatives` is not defined');
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
    const adsData = adCreativeIds.map(adCreativeId =>
      this.composeAdData({
        adCreativeId,
        adSetId: adSet.id,
        name: `${data.name} - Ad - ${new Date().getTime()}`,
        status: data.status,
      }),
    );
    await Promise.all(adsData.map(adData => this.adAccount.createAd([], adData)));

    return campaign;
  }

  public createCustomAudience(data: FacebookCustomAudienceData) {
    return this.adAccount.createCustomAudience([], this.composeCustomAudienceData(data));
  }

  public createCustomAudienceUsers(customAudienceId: string, data: FacebookCustomAudienceUserData) {
    const customAudience = new facebookBizSdk.CustomAudience(customAudienceId);
    return customAudience.createUser([], this.composeCustomAudienceUserData(data));
  }

  public setDefaultValues(defaultValues: FacebookDefaultData) {
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
          message: adCreative.message,
          name: adCreative.headline,
        },
        page_id: adCreative.pageId,
      },
    };
  }

  private composeAdSetData(adSet: FacebookAdSetData) {
    return {
      bid_amount: adSet.bidAmount,
      // billing_event: facebookBizSdk.AdSet.BillingEvent.impressions,
      campaign_id: adSet.campaignId,
      end_time: adSet.endTime,
      name: adSet.name,
      optimization_goal: adSet.optimizationGoal,
      start_time: adSet.startTime,
      status: adSet.status,
      targeting: {
        custom_audiences: [{ id: adSet.customAudienceId }],
      },
    };
  }

  private composeCustomAudienceData(customAudience: FacebookCustomAudienceData) {
    return {
      // customer_file_source: facebookBizSdk.CustomAudience.CustomerFileSource.partner_provided_only,
      description: customAudience.description,
      name: customAudience.name,
      subtype: facebookBizSdk.CustomAudience.Subtype.custom,
    };
  }

  private composeCustomAudienceUserData(customAudienceUserData: FacebookCustomAudienceUserData) {
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
      // objective: facebookBizSdk.Campaign.Objective.link_clicks,
      // special_ad_category: facebookBizSdk.Campaign.SpecialAdCategory.none,
      status: campaign.status,
    };
  }
}
