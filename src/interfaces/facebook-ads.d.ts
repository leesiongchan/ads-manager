export type FacebookCampaignStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED' | 'PAUSED';
export type FacebookAdSetStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED' | 'PAUSED';
export type FacebookAdStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED' | 'PAUSED';

export interface FacebookAdData {
  adCreativeId: string;
  adSetId: string;
  name: string;
  status: FacebookAdStatus;
}

export interface FacebookAdCreativeData {
  name: string;
  pageId: string;
  callToActionType?: string;
  description?: string;
  imageHash: string;
  link: string;
  headline?: string;
  text: string;
}

export interface FacebookAdSetData {
  bidAmount: number;
  billingEvent?: 'IMPRESSIONS';
  campaignId: string;
  customAudienceId?: string;
  endTime?: string;
  name: string;
  optimizationGoal: 'IMPRESSIONS' | 'REACH';
  startTime: string;
  status: FacebookAdSetStatus;
}

export interface FacebookCampaignData {
  dailyBudget: number;
  lifetimeBudget?: number;
  name: string;
  objective?: 'LINK_CLICKS';
  specialAdCategory?: 'NONE';
  status: FacebookCampaignStatus;
}

export interface FacebookCustomAudienceData {
  customerFileSource?: 'PARTNER_PROVIDED_ONLY';
  description?: string;
  name: string;
  subtype: 'CUSTOM';
}
