import { enums } from 'google-ads-api';

// TODO: Now only support `DISPLAY` and `SEARCH` channel
export type GoogleAdvertisingChannelType = keyof Pick<typeof enums.AdvertisingChannelType, 'DISPLAY' | 'SEARCH'>;
export type GoogleCampaignStatus = keyof Pick<typeof enums.CampaignStatus, 'PAUSED' | 'ENABLED'>;
export type GoogleBiddingStrategyType = keyof typeof enums.BiddingStrategyType;

export interface GoogleAdGroupData {
  advertisingChannelType: GoogleAdvertisingChannelType;
  campaignResourceName: string;
  name: string;
}

export interface GoogleAdGroupAdData {
  adGroupResourceName: string;
  advertisingChannelType: GoogleAdvertisingChannelType;
  businessName: string;
  descriptions: [string, string];
  displayUrlPaths?: [string] | [string, string];
  headlines: [string, string, string];
  imageAssetResourceNames: string[];
  squareImageAssetResourceNames: string[];
  url: string;
}

export interface GoogleImageAssetsData {
  imageUrls: string[];
  name?: string;
}

export interface GoogleAdGroupCriteriaData {
  adGroupResourceName: string;
  keywords?: string[];
}

export interface GoogleBiddingStrategyConfig {
  cpcBidCeilingAmount?: number;
}

export interface GoogleCampaignData {
  advertisingChannelType: GoogleAdvertisingChannelType;
  biddingStrategyConfig?: GoogleBiddingStrategyConfig;
  biddingStrategyType: GoogleBiddingStrategyType;
  campaignBudgetResourceName: string;
  endDate?: string;
  name: string;
  startDate: string;
}

export interface GoogleCampaignBudgetData {
  dailyAmount: number;
  name: string;
  totalAmount: number;
}

export interface GoogleCampaignCriteriaData {
  campaignResourceName: string;
  languageCodes?: string[];
  locationCountryCodes?: string[];
}

export interface GoogleUserListData {
  description?: string;
  membershipLifeSpan?: number;
  name: string;
}
